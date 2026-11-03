import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EMAIL_CODE } from '~/domain/launch-terms'
import { PENDING_SIGNUP_KEPT_HOURS } from '~/domain/sign-up-attempt'
import {
  createPostgresPendingSignups,
  spendPendingSignup,
  type PostgresPendingSignups,
} from '~/platform/supabase/pending-signups'
import { localSupabase } from '../support/local-supabase'
import {
  aNetworkAddress,
  anAddress,
  buildHarness,
  describeSignUpScenarios,
  GOOD_TOKEN,
  notThe,
  type SignUpScenarioStore,
} from '../support/sign-up-scenarios'

/**
 * Sign-up's first three steps against the real tables (Exponential launch, ticket 11).
 * The scenarios are the same ones `tests/domain` runs on a store in memory; below them
 * is what only Postgres can show: a burst queueing behind the caps, what a row holds,
 * and an account found in `auth.users`. That the tables are operator-only is
 * `rls-coverage.test.ts`.
 */

const US_PHONE = '+12055550100'

let pool: pg.Pool
let store: PostgresPendingSignups
const givenAccounts: string[] = []

const backing = (): SignUpScenarioStore => ({
  store,
  async giveAccount(email) {
    const stored = email.toLowerCase()
    givenAccounts.push(stored)
    await pool.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1)`,
      [stored],
    )
  },
})

beforeAll(() => {
  pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  store = createPostgresPendingSignups(localSupabase().databaseUrl)
})

afterAll(async () => {
  await pool.query(`delete from auth.users where email = any($1)`, [givenAccounts])
  await store.close()
  await pool.end()
})

describe('the email code at sign-up, on the real tables', () => {
  describeSignUpScenarios(backing)
})

describe('a burst', () => {
  afterEach(() => vi.restoreAllMocks())

  it('cannot pass the cap on one address together', async () => {
    const h = buildHarness(backing())
    const address = anAddress()
    const attempts = await Promise.all(Array.from({ length: 12 }, () => h.attempt()))

    const answers = await Promise.all(
      attempts.map((attempt) =>
        h.signUp.sendCode({ attempt, email: address, phone: US_PHONE, network: aNetworkAddress() }),
      ),
    )

    expect(answers.filter((answer) => 'sent' in answer)).toHaveLength(EMAIL_CODE.perEmailPerHour)
    expect(h.email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour)
  }, 30_000)

  it('cannot pass the cap on one network together', async () => {
    const h = buildHarness(backing())
    const network = aNetworkAddress()
    const attempts = await Promise.all(Array.from({ length: EMAIL_CODE.perNetworkPerHour + 5 }, () => h.attempt()))

    await Promise.all(
      attempts.map((attempt) => h.signUp.sendCode({ attempt, email: anAddress(), phone: US_PHONE, network })),
    )

    expect(h.email.delivered).toHaveLength(EMAIL_CODE.perNetworkPerHour)
  }, 30_000)

  it('of one double click sends one email', async () => {
    const h = buildHarness(backing())
    const attempt = await h.attempt()
    const address = anAddress()
    const ask = () => h.signUp.sendCode({ attempt, email: address, phone: US_PHONE, network: aNetworkAddress() })

    const answers = await Promise.all([ask(), ask()])

    expect(answers.filter((answer) => 'sent' in answer)).toHaveLength(1)
    expect(answers.filter((answer) => 'refusal' in answer && answer.refusal === 'signup.resend_too_soon')).toHaveLength(1)
    expect(h.email.delivered).toHaveLength(1)
  })

  it('of guesses cannot get past five wrong tries', async () => {
    const h = buildHarness(backing())
    const { token, code } = await h.attemptWithCode()

    const answers = await Promise.all(
      Array.from({ length: 9 }, () => h.signUp.confirmCode({ attempt: token, typed: notThe(code) })),
    )

    expect(answers.filter((answer) => 'refusal' in answer && answer.refusal === 'signup.wrong_code')).toHaveLength(4)
    expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toEqual({ refusal: 'signup.too_many_tries' })
  }, 30_000)
})

describe('what the tables hold', () => {
  const rowOf = async (address: string) =>
    (await pool.query(`select * from pending_signup where email = $1`, [address])).rows[0] as Record<string, unknown>

  it('is an HMAC of the code and a digest of the attempt, and no password column at all', async () => {
    const h = buildHarness(backing())
    const { token, address, code } = await h.attemptWithCode()

    const row = await rowOf(address)
    const held = JSON.stringify(row)

    expect(row.code_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(held).not.toContain(code)
    expect(held).not.toContain(token)
    expect(Object.keys(row).filter((column) => /pass(word)?$/i.test(column) && column !== 'human_passed_at')).toEqual([])
  })

  it('forgets the code once it is used', async () => {
    const h = buildHarness(backing())
    const { token, address, code } = await h.attemptWithCode()
    await h.signUp.confirmCode({ attempt: token, typed: code })

    expect((await rowOf(address)).code_digest).toBeNull()
  })

  it('keeps no code at all for an address with an account', async () => {
    const owned = backing()
    const h = buildHarness(owned)
    const taken = anAddress()
    await owned.giveAccount(taken)
    const attempt = await h.attempt()
    await h.signUp.sendCode({ attempt, email: taken, phone: US_PHONE, network: aNetworkAddress() })

    expect(await rowOf(taken)).toMatchObject({ code_digest: null, email: taken })
  })

  it('counts by digest, with no address or network in the caps', async () => {
    const h = buildHarness(backing())
    const network = aNetworkAddress()
    const { address } = await h.attemptWithCode(undefined, network)

    const { rows } = await pool.query(`select * from pending_signup_send order by sent_at desc limit 50`)
    const held = JSON.stringify(rows)
    expect(held).not.toContain(address)
    expect(held).not.toContain(network)
  })

  it('sweeps an attempt and its sends once they are a day old', async () => {
    const h = buildHarness(backing())
    const { address } = await h.attemptWithCode()
    expect(await rowOf(address)).toBeDefined()

    h.clock.advanceBy(PENDING_SIGNUP_KEPT_HOURS * 60 * 60 * 1000 + 1)
    await h.attemptWithCode()

    expect(await rowOf(address)).toBeUndefined()
    const { rows } = await pool.query(`select count(*)::int as old from pending_signup_send where sent_at < $1`, [
      new Date(h.clock.now().getTime() - PENDING_SIGNUP_KEPT_HOURS * 60 * 60 * 1000),
    ])
    expect(rows[0].old).toBe(0)
  })
})

describe('spending an attempt (ticket 17)', () => {
  it('works once, in the caller’s own transaction, and ends the attempt', async () => {
    const h = buildHarness(backing())
    const { token, code } = await h.attemptWithCode()
    await h.signUp.confirmCode({ attempt: token, typed: code })
    const ready = await h.signUp.readyToOpen({ attempt: token, humanToken: GOOD_TOKEN })
    if (!('ready' in ready)) throw new Error('not ready')
    const id = ready.ready.pendingSignupId

    const client = await pool.connect()
    try {
      await client.query('begin')
      expect(await spendPendingSignup(client, id, h.clock.now())).toBe(true)
      await client.query('rollback')
      expect(await h.signUp.standing(token)).toMatchObject({ step: 'account' })

      await client.query('begin')
      expect(await spendPendingSignup(client, id, h.clock.now())).toBe(true)
      expect(await spendPendingSignup(client, id, h.clock.now())).toBe(false)
      await client.query('commit')
    } finally {
      client.release()
    }

    expect(await h.signUp.standing(token)).toEqual({ step: 'human_check' })
  })

  it('refuses an attempt that has not proven its address', async () => {
    const h = buildHarness(backing())
    const { address } = await h.attemptWithCode()
    const { rows } = await pool.query(`select id from pending_signup where email = $1`, [address])

    const client = await pool.connect()
    try {
      expect(await spendPendingSignup(client, rows[0].id, h.clock.now())).toBe(false)
    } finally {
      client.release()
    }
  })
})
