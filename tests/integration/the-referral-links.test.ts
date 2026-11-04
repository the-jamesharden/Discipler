import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { createPostgresPendingSignups, type PostgresPendingSignups } from '~/platform/supabase/pending-signups'
import { openSignedUpChurch } from '~/platform/supabase/provisioning'
import { createPostgresReferrals, type PostgresReferrals } from '~/platform/supabase/referrals'
import { createEmailSender } from '~/service/email-sender'
import { openTrial } from '~/service/open-trial'
import { createOpeningAChurch, type OpeningAChurch } from '~/service/opening-a-church'
import type { SignUp } from '~/service/sign-up'
import { SIGN_UP_ATTEMPT_COOKIE } from '../../app/signup/attempt-cookie'
import { POST as confirmCode } from '../../app/signup/confirm-code/route'
import { POST as humanCheck } from '../../app/signup/human-check/route'
import { POST as openChurch } from '../../app/signup/open-church/route'
import { POST as sendCode } from '../../app/signup/send-code/route'
import { aFakeStripe } from '../support/fake-stripe'
import {
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
} from '../support/local-supabase'
import { aNetworkAddress, anAddress, buildHarness, codeIn, GOOD_TOKEN } from '../support/sign-up-scenarios'

/**
 * Each church's code and who invited whom (Exponential launch, ticket 20): the real
 * routes, tables and Supabase Auth, with Cloudflare, Resend and Stripe as fakes at their
 * ports. The pages are `tests/app/the-sign-up-pages.test.ts`.
 */

let currentSignUp: SignUp | null = null
let currentOpening: OpeningAChurch | null = null

vi.mock('~/service/container', () => ({
  getSignUp: () => {
    if (!currentSignUp) throw new Error('A sign-up route reached the service while it should have been shut.')
    return currentSignUp
  },
  getOpeningAChurch: () => {
    if (!currentOpening) throw new Error('A sign-up route reached the service while it should have been shut.')
    return currentOpening
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}))

const aUsPhone = () => `+1205${2_000_000 + Math.floor(Math.random() * 7_999_999)}`
const aChurchName = () => `Grace Church ${crypto.randomUUID().slice(0, 8)}`

let store: PostgresPendingSignups
let referrals: PostgresReferrals
let billing: PostgresBilling
let pool: pg.Pool
let h: ReturnType<typeof buildHarness>

const post = (path: string, fields: Record<string, string> = {}, attempt?: string) =>
  new NextRequest(`http://127.0.0.1:3211${path}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': aNetworkAddress(),
      ...(attempt ? { cookie: `${SIGN_UP_ATTEMPT_COOKIE}=${attempt}` } : {}),
    },
  })

const attemptFromCookie = (response: Response): string => {
  const cookie = response.headers.getSetCookie().find((line) => line.startsWith(`${SIGN_UP_ATTEMPT_COOKIE}=`))
  if (!cookie) throw new Error('No attempt cookie was set.')
  return cookie.slice(SIGN_UP_ATTEMPT_COOKIE.length + 1).split(';')[0]!
}

/** A church signing itself up from page one, with what its address carried. */
const signUpWith = async (carried: { ref?: string; code?: string } = {}): Promise<{ id: MinistryId; name: string }> => {
  const attempt = attemptFromCookie(await humanCheck(post('/signup/human-check', { token: GOOD_TOKEN })))
  expect((await sendCode(post('/signup/send-code', { email: anAddress(), phone: aUsPhone() }, attempt))).status).toBe(200)
  const code = codeIn(h.email.delivered.at(-1))
  expect((await confirmCode(post('/signup/confirm-code', { code }, attempt))).status).toBe(200)

  const name = aChurchName()
  const response = await openChurch(
    post(
      '/signup/open-church',
      {
        humanToken: GOOD_TOKEN,
        churchName: name,
        fullName: 'Dan Whitfield',
        heardFrom: '',
        password: 'grace shepherds 1',
        timezone: 'America/Chicago',
        cycle: 'month',
        agreedToTerms: 'yes',
        code: carried.code ?? '',
        ref: carried.ref ?? '',
      },
      attempt,
    ),
  )
  expect(await response.json()).toEqual({ next: '/signup/payment' })

  const { rows } = await pool.query<{ id: string }>(`select id from ministry where name = $1`, [name])
  return { id: rows[0]!.id as MinistryId, name }
}

const liveCodeOf = async (church: string): Promise<string> => {
  const { rows } = await pool.query<{ code: string }>(
    `select code from referral_code where ministry_id = $1 and retired_at is null`,
    [church],
  )
  expect(rows).toHaveLength(1)
  return rows[0]!.code
}

const retireCodeOf = (church: string) =>
  pool.query(`update referral_code set retired_at = $2 where ministry_id = $1 and retired_at is null`, [church, new Date()])

const referralsOf = async (church: string) => {
  const { rows } = await pool.query(`select * from referral where invited_church = $1`, [church])
  return rows as { invited_church: string; inviting_church: string; referral_code: string; invited_at: Date }[]
}

const offerOpenedFor = async (church: { id: MinistryId; name: string }, code: string) => {
  const clock = createTestClock(new Date('2026-11-10T18:00:00Z'))
  const fake = aFakeStripe(clock)
  const opened = await openTrial(
    { records: billing.records, stripe: fake.stripe, trials: fake.trials, invitations: referrals, clock },
    { church: church.id, churchName: church.name, adminEmail: anAddress(), cycle: 'month', code },
  )
  if (!('offer' in opened)) throw new Error(`No trial opened: ${JSON.stringify(opened)}`)
  return opened.offer
}

beforeAll(() => {
  publishSupabaseCredentials()
  pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  store = createPostgresPendingSignups(localSupabase().databaseUrl)
  referrals = createPostgresReferrals(localSupabase().databaseUrl)
  billing = createPostgresBilling(localSupabase().databaseUrl)
})

afterAll(async () => {
  await store.close()
  await referrals.close()
  await billing.close()
  await pool.end()
})

beforeEach(() => {
  h = buildHarness({
    store,
    giveAccount: async () => {
      throw new Error('This suite makes its accounts by opening churches.')
    },
  })
  currentSignUp = h.signUp
  currentOpening = createOpeningAChurch({
    signUp: h.signUp,
    signUps: store,
    openChurch: openSignedUpChurch,
    sender: createEmailSender(h.email.transport),
    clock: h.clock,
  })
  vi.stubEnv('SIGN_UP_OPEN', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a church\'s code', { timeout: 60_000 }, () => {
  it('is made when it opens, whichever way it opens, and is never its name', async () => {
    const fixture = await createMinistryWithAdmin(aChurchName())
    const signedUp = await signUpWith()

    for (const church of [fixture, signedUp]) {
      const code = await liveCodeOf(church.id)
      expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/)
      expect(church.name.toLowerCase().replace(/[^a-z0-9]/g, '')).not.toContain(code)
    }
  })

  it('differs from every other church\'s', async () => {
    const { rows } = await pool.query<{ codes: string; distinct_codes: string }>(
      `select count(*) as codes, count(distinct code) as distinct_codes from referral_code`,
    )

    expect(rows[0]!.codes).toBe(rows[0]!.distinct_codes)
  })

  it('every church has one, including those that were there before the migration', async () => {
    const church = await createMinistryWithAdmin(aChurchName())
    const migration = readFileSync(
      fileURLToPath(new URL('../../supabase/migrations/20261104110020_referral_codes_and_who_invited_whom.sql', import.meta.url)),
      'utf8',
    )
    const backfill = /-- begin: every church that already exists\n([\s\S]*?)-- end: every church that already exists/.exec(migration)![1]!

    const client = await pool.connect()
    try {
      await client.query('begin')
      // As it stood before: a church with no code at all, and nothing else disturbed.
      await client.query(`delete from referral_code where ministry_id = $1`, [church.id])
      await client.query(backfill)

      const { rows } = await client.query(`select code from referral_code where ministry_id = $1 and retired_at is null`, [church.id])
      expect(rows).toHaveLength(1)
      const { rows: without } = await client.query(
        `select m.id from ministry m
          where not exists (select 1 from referral_code c where c.ministry_id = m.id and c.retired_at is null)`,
      )
      expect(without).toEqual([])
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('is one live at a time, and a retired one is kept and replaced', async () => {
    const church = await createMinistryWithAdmin(aChurchName())
    const first = await liveCodeOf(church.id)

    await expect(pool.query(`select app.issue_referral_code($1)`, [church.id])).rejects.toThrow(/referral_code_one_live_per_church/)

    await retireCodeOf(church.id)
    await pool.query(`select app.issue_referral_code($1)`, [church.id])

    const second = await liveCodeOf(church.id)
    expect(second).not.toBe(first)
    const { rows } = await pool.query(`select code, retired_at from referral_code where ministry_id = $1 order by retired_at nulls last`, [church.id])
    expect(rows.map((row) => row.code)).toEqual([first, second])
    expect(rows[0].retired_at).not.toBeNull()
  })

  it('makes no two alike over many, and only from its alphabet', async () => {
    const { rows } = await pool.query<{ made: string }>(`select app.a_referral_code() as made from generate_series(1, 2000)`)
    const made = rows.map((row) => row.made)

    expect(new Set(made).size).toBe(made.length)
    for (const code of made) expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/)
    // Every letter turns up, in every place: nothing is fixed by the UUID's version bits.
    for (let place = 0; place < 10; place += 1) {
      expect(new Set(made.map((code) => code[place])).size, `place ${place}`).toBe(32)
    }
  })

  it('cannot be read by a browser, and a command reads only its own church\'s', async () => {
    const mine = await createMinistryWithAdmin(aChurchName())
    const other = await createMinistryWithAdmin(aChurchName())

    const { rows: privileges } = await pool.query(
      `select has_table_privilege('anon', 'referral_code', 'select') as anon,
              has_table_privilege('authenticated', 'referral_code', 'select') as authenticated`,
    )
    expect(privileges).toEqual([{ anon: false, authenticated: false }])

    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [mine.id])
      const { rows } = await client.query<{ ministry_id: string }>(`select ministry_id from referral_code`)
      expect(rows.map((row) => row.ministry_id)).toEqual([mine.id])
      expect(rows.map((row) => row.ministry_id)).not.toContain(other.id)
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('cannot be a short name\'s route', async () => {
    const church = await createMinistryWithAdmin(aChurchName())

    await expect(pool.query(`update ministry set short_name = 'r' where id = $1`, [church.id])).rejects.toThrow(
      /ministry_short_name_is_not_a_route/,
    )
  })
})

describe('whether a code is live', { timeout: 60_000 }, () => {
  it('reads a live one, in any case', async () => {
    const code = await liveCodeOf((await createMinistryWithAdmin(aChurchName())).id)

    expect(await referrals.isLive(code)).toBe(true)
    expect(await referrals.isLive(code.toUpperCase())).toBe(true)
  })

  it('reads a retired one as an unknown one', async () => {
    const church = await createMinistryWithAdmin(aChurchName())
    const code = await liveCodeOf(church.id)
    await retireCodeOf(church.id)

    expect(await referrals.isLive(code)).toBe(false)
    expect(await referrals.isLive('0000000000')).toBe(false)
    expect(await referrals.isLive('not a code')).toBe(false)
  })
})

describe('a church invited with a live code', { timeout: 60_000 }, () => {
  it('has one row saying who invited it, gets the first paid month, and was invited', async () => {
    const inviting = await createMinistryWithAdmin(aChurchName())
    const invited = await signUpWith({ ref: await liveCodeOf(inviting.id) })

    const rows = await referralsOf(invited.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.inviting_church).toBe(inviting.id)
    expect(rows[0]!.invited_at).toEqual(h.clock.now())

    expect(await referrals.wasInvited(invited.id)).toBe(true)
    expect(await offerOpenedFor(invited, '')).toBe('referral')
  })

  it('tells support@ which offer it came with', async () => {
    const inviting = await createMinistryWithAdmin(aChurchName())
    await signUpWith({ ref: await liveCodeOf(inviting.id) })

    const told = h.email.delivered.find((email) => email.subject.includes('signed up for Discipler'))
    expect(told?.text).toContain('Offer: The first paid month free, invited by another church')
    expect(told?.text).not.toContain(inviting.name)
  })

  it('is read in any case, as a link may have been pasted', async () => {
    const inviting = await createMinistryWithAdmin(aChurchName())
    const invited = await signUpWith({ ref: (await liveCodeOf(inviting.id)).toUpperCase() })

    expect(await referrals.wasInvited(invited.id)).toBe(true)
  })

  it('gets the offer with EXPO26 too, and the row stays for the inviting church\'s credit', async () => {
    const inviting = await createMinistryWithAdmin(aChurchName())
    const invited = await signUpWith({ ref: await liveCodeOf(inviting.id), code: 'EXPO26' })

    expect((await referralsOf(invited.id)).map((row) => row.inviting_church)).toEqual([inviting.id])
    expect(await offerOpenedFor(invited, 'EXPO26')).toBe('exponential')

    const told = h.email.delivered.find((email) => email.subject.includes('signed up for Discipler'))
    expect(told?.text).toContain('Offer: The Exponential special offer')
  })

  it('leaves the inviting church\'s own record as it was', async () => {
    const inviting = await createMinistryWithAdmin(aChurchName())
    const code = await liveCodeOf(inviting.id)
    await signUpWith({ ref: code })

    expect(await referrals.wasInvited(inviting.id as MinistryId)).toBe(false)
    expect(await liveCodeOf(inviting.id)).toBe(code)
  })
})

describe('a church whose code does not count', { timeout: 60_000 }, () => {
  it('records nothing for a retired code, and is at the normal price', async () => {
    const inviting = await createMinistryWithAdmin(aChurchName())
    const code = await liveCodeOf(inviting.id)
    await retireCodeOf(inviting.id)

    const church = await signUpWith({ ref: code })

    expect(await referralsOf(church.id)).toEqual([])
    expect(await referrals.wasInvited(church.id)).toBe(false)
    expect(await offerOpenedFor(church, '')).toBe('none')
  })

  it.each(['0000000000', 'not-a-code', ''])('records nothing for %j', async (ref) => {
    const church = await signUpWith({ ref })

    expect(await referralsOf(church.id)).toEqual([])
    expect(await referrals.wasInvited(church.id)).toBe(false)
  })

  it('says no offer to support@', async () => {
    await signUpWith({ ref: '0000000000' })

    const told = h.email.delivered.find((email) => email.subject.includes('signed up for Discipler'))
    expect(told?.text).toContain('Offer: None')
  })
})

describe('the table of who invited whom', () => {
  it('is shut to every role but the operator\'s', async () => {
    const { rows } = await pool.query(
      `select r as role, has_table_privilege(r, 'referral', 'select') as can_read
         from unnest(array['anon', 'authenticated', 'service_role', 'discipler_command']) r
        order by r`,
    )

    expect(rows.map((row) => row.can_read)).toEqual([false, false, false, false])
  })
})
