import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, type TestClock } from '~/domain/clock'
import { FAILED_SIGN_INS_ALLOWED, SIGN_IN_WINDOW_MINUTES } from '~/domain/sign-in-limit'
import {
  createPostgresSignInLimit,
  type PostgresSignInLimit,
} from '~/platform/supabase/sign-in-limit'
import type { SignInAccount } from '~/service/ports'
import { aNetwork } from '../support/app'
import { aTestPhoneNumber, localSupabase, serviceRoleClient } from '../support/local-supabase'

/**
 * The sign-in guessing limit at its port, against the real table (Exponential
 * launch, ticket 13): ten failures per account and per network in fifteen minutes,
 * counted in Postgres, and the eleventh try held back.
 *
 * A clock of its own, started at the process's now, so the window can be walked
 * through without waiting fifteen minutes. Every test names an account and a
 * network nobody else uses, so nothing here counts what a neighbouring test wrote.
 */

describe('the sign-in guessing limit', () => {
  let clock: TestClock
  let limit: PostgresSignInLimit
  let pool: pg.Pool

  beforeAll(() => {
    clock = createTestClock(new Date())
    limit = createPostgresSignInLimit(localSupabase().databaseUrl, clock)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await limit.close()
    await pool.end()
  })

  /** Ten wrong passwords, each kept as a failure. */
  const failTenTimes = async (
    account: SignInAccount,
    network: () => string | null,
  ) => {
    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      expect(await limit.attempt(account, network())).not.toBeNull()
    }
  }

  it('lets ten wrong passwords on one account through, and holds back the eleventh', async () => {
    const account = { phone: aTestPhoneNumber() }
    await failTenTimes(account, aNetwork)

    expect(await limit.attempt(account, aNetwork())).toBeNull()
  })

  it('holds back a network that has failed ten times, whichever accounts it tried', async () => {
    const network = aNetwork()
    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      expect(await limit.attempt({ phone: aTestPhoneNumber() }, network)).not.toBeNull()
    }

    expect(await limit.attempt({ phone: aTestPhoneNumber() }, network)).toBeNull()
    // And only that network: the account it would have tried is untouched.
    expect(await limit.attempt({ phone: aTestPhoneNumber() }, aNetwork())).not.toBeNull()
  })

  it('does not count a try that was not a failure', async () => {
    const account = { phone: aTestPhoneNumber() }
    const network = aNetwork()

    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED * 2; i++) {
      const attempt = await limit.attempt(account, network)
      expect(attempt).not.toBeNull()
      await attempt!.notAFailure()
    }
  })

  it('counts an account with no network against the account alone', async () => {
    const account = { userId: randomUUID() }
    await failTenTimes(account, () => null)

    expect(await limit.attempt(account, null)).toBeNull()
  })

  it('counts a sign-in and a change of password apart', async () => {
    // The same digits as a user id cannot collide with a phone, because the keys
    // are namespaced before they are hashed.
    const userId = randomUUID()
    await failTenTimes({ userId }, aNetwork)

    expect(await limit.attempt({ phone: userId }, aNetwork())).not.toBeNull()
  })

  describe('with an email (ticket 21)', () => {
    const anAddress = () => `pastor.${randomUUID().slice(0, 8)}@grace.example`
    const accounts: string[] = []

    afterAll(async () => {
      for (const id of accounts) await serviceRoleClient().auth.admin.deleteUser(id).catch(() => undefined)
    })

    /** The shape sign-up's opening leaves behind: both confirmed, and the address lower case. */
    const anAccountHolding = async (email: string, phone: string | null = aTestPhoneNumber()) => {
      const { data, error } = await serviceRoleClient().auth.admin.createUser({
        email,
        email_confirm: true,
        password: 'a-long-enough-password',
        ...(phone ? { phone, phone_confirm: true } : {}),
      })
      if (error) throw error
      accounts.push(data.user.id)
      return { phone: phone ?? '' }
    }

    it('counts ten by email against the phone of the account holding it', async () => {
      const email = anAddress()
      const { phone } = await anAccountHolding(email)
      await failTenTimes({ email }, aNetwork)

      expect(await limit.attempt({ phone }, aNetwork())).toBeNull()
    })

    it('counts ten by phone against the email of the account holding it', async () => {
      const email = anAddress()
      const { phone } = await anAccountHolding(email)
      await failTenTimes({ phone }, aNetwork)

      expect(await limit.attempt({ email }, aNetwork())).toBeNull()
    })

    it('adds the two together, so ten is ten and not twenty', async () => {
      const email = anAddress()
      const { phone } = await anAccountHolding(email)
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
        const account = i % 2 === 0 ? { email } : { phone }
        expect(await limit.attempt(account, aNetwork())).not.toBeNull()
      }

      expect(await limit.attempt({ email }, aNetwork())).toBeNull()
      expect(await limit.attempt({ phone }, aNetwork())).toBeNull()
    })

    it('is one account in any capitals', async () => {
      const email = anAddress()
      const { phone } = await anAccountHolding(email)
      await failTenTimes({ email: email.toUpperCase() }, aNetwork)

      expect(await limit.attempt({ email }, aNetwork())).toBeNull()
      expect(await limit.attempt({ phone }, aNetwork())).toBeNull()
    })

    it('holds back an address nobody holds in just the same way, under its own count', async () => {
      const email = anAddress()
      await failTenTimes({ email }, aNetwork)

      expect(await limit.attempt({ email }, aNetwork())).toBeNull()
      expect(await limit.attempt({ email: email.toUpperCase() }, aNetwork())).toBeNull()
      expect(await limit.attempt({ email: anAddress() }, aNetwork())).not.toBeNull()
    })

    it('counts an account with no phone under its address', async () => {
      const email = anAddress()
      await anAccountHolding(email, null)
      await failTenTimes({ email }, aNetwork)

      expect(await limit.attempt({ email }, aNetwork())).toBeNull()
    })

    it('still counts the network, whichever address it tries', async () => {
      const network = aNetwork()
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
        expect(await limit.attempt({ email: anAddress() }, network)).not.toBeNull()
      }

      expect(await limit.attempt({ email: anAddress() }, network)).toBeNull()
    })

    it('holds no address, only its digest', async () => {
      const email = anAddress()
      await limit.attempt({ email }, aNetwork())

      const { rows } = await pool.query<{ account_digest: string }>(
        `select account_digest from sign_in_attempt
          where account_digest = encode(sha256(convert_to($1, 'UTF8')), 'hex')`,
        [`email:${email}`],
      )

      expect(rows).toHaveLength(1)
      expect(JSON.stringify(rows)).not.toContain(email)
    })

    it('reads a NUL in a hand-made entry as any other wrong address', async () => {
      expect(await limit.attempt({ email: `a\0${anAddress()}` }, aNetwork())).not.toBeNull()
    })
  })

  it('lets the account try again once its oldest failure is fifteen minutes old', async () => {
    const account = { phone: aTestPhoneNumber() }
    await failTenTimes(account, aNetwork)
    expect(await limit.attempt(account, aNetwork())).toBeNull()

    clock.advanceBy(SIGN_IN_WINDOW_MINUTES * 60 * 1000 - 1000)
    expect(await limit.attempt(account, aNetwork())).toBeNull()

    clock.advanceBy(2000)
    expect(await limit.attempt(account, aNetwork())).not.toBeNull()
  })

  it('lets ten through of a burst sent all at once, and no more', async () => {
    // The race the reserve-under-a-lock shape exists for: counted first and
    // recorded afterwards, every one of these would have read a count of zero.
    const account = { phone: aTestPhoneNumber() }

    const attempts = await Promise.all(
      Array.from({ length: 30 }, () => limit.attempt(account, aNetwork())),
    )

    expect(attempts.filter((attempt) => attempt !== null)).toHaveLength(FAILED_SIGN_INS_ALLOWED)
  })

  it('holds no phone number and no address, only their digests', async () => {
    const phone = aTestPhoneNumber()
    const network = '198.51.100.23'
    await limit.attempt({ phone }, network)

    const { rows } = await pool.query<{ account_digest: string; network_digest: string }>(
      `select account_digest, network_digest from sign_in_attempt
        where account_digest = encode(sha256(convert_to($1, 'UTF8')), 'hex')`,
      [`phone:${phone}`],
    )

    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(phone.slice(1))
    expect(JSON.stringify(rows)).not.toContain(network)
  })

  it('is refused to every API role', async () => {
    const { rows } = await pool.query<{ grantee: string }>(
      `select distinct grantee from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'sign_in_attempt'
          and grantee in ('anon', 'authenticated', 'service_role', 'discipler_command')`,
    )
    expect(rows).toEqual([])

    const { rows: facts } = await pool.query<{ forced: boolean; policies: number }>(
      `select c.relforcerowsecurity as forced,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c where c.oid = 'public.sign_in_attempt'::regclass`,
    )
    expect(facts).toEqual([{ forced: true, policies: 0 }])
  })
})
