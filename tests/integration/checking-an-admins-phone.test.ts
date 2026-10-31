import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, type TestClock } from '~/domain/clock'
import {
  createPostgresPhoneChecks,
  type PostgresPhoneChecks,
} from '~/platform/supabase/phone-checks'
import { createPhoneCheck, type PhoneCheck } from '~/service/phone-check'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { createScriptedVerifier } from '../support/phone-verifier'

/**
 * Checking an Admin's own phone (Exponential launch, ticket 09) against the real
 * tables: the phone read off the Admin's own Roster row, the code limits counted
 * in Postgres, one attempt however fast the button is pressed, and a verified
 * phone remembered. Twilio is the scripted stand-in; its adapter is driven in
 * `tests/platform/twilio-verify.test.ts`.
 */

const minutes = (count: number) => count * 60_000

let pool: pg.Pool
let checks: PostgresPhoneChecks
let clock: TestClock
let twilio: ReturnType<typeof createScriptedVerifier>
let phoneCheck: PhoneCheck
let ministry: MinistryFixture
let admin: { userId: string; ministryId: MinistryFixture['id'] }

const setRosterPhone = (personId: string, phone: string) =>
  pool.query(`update person set phone = $2 where id = $1`, [personId, phone])

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  checks = createPostgresPhoneChecks(localSupabase().databaseUrl)
})

afterAll(async () => {
  await checks.close()
  await pool.end()
})

beforeEach(async () => {
  ministry = await createMinistryWithAdmin('Riverside Chapel')
  admin = { userId: ministry.adminUserId, ministryId: ministry.id }
  // From the process's clock, never a pinned date: a pinned one passes into the
  // past and the windows below start counting differently.
  clock = createTestClock(new Date())
  twilio = createScriptedVerifier()
  phoneCheck = createPhoneCheck({ checks, verifier: twilio.verifier, clock })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('checking an Admin’s own phone', () => {
  it('texts the phone on the Admin’s own Roster row and verifies it with the code', async () => {
    expect(await phoneCheck.status(admin)).toEqual({
      phone: ministry.adminPhone,
      verified: false,
    })

    expect(await phoneCheck.sendCode(admin)).toEqual({ sent: ministry.adminPhone })
    expect(twilio.sent).toEqual([ministry.adminPhone])

    expect(await phoneCheck.confirmCode(admin, '123456')).toEqual({ verified: ministry.adminPhone })
    expect(await phoneCheck.status(admin)).toEqual({ phone: ministry.adminPhone, verified: true })
  })

  it('remembers a verified phone on a fresh connection, and never sends for it again', async () => {
    await phoneCheck.sendCode(admin)
    await phoneCheck.confirmCode(admin, '123456')

    const fresh = createPostgresPhoneChecks(localSupabase().databaseUrl)
    try {
      const again = createPhoneCheck({ checks: fresh, verifier: twilio.verifier, clock })
      expect(await again.sendCode(admin)).toEqual({ verified: ministry.adminPhone })
    } finally {
      await fresh.close()
    }
    expect(twilio.sent).toHaveLength(1)
  })

  it('asks again once the Roster row holds a different phone', async () => {
    await phoneCheck.sendCode(admin)
    await phoneCheck.confirmCode(admin, '123456')

    const newPhone = aTestPhoneNumber()
    await setRosterPhone(ministry.adminPersonId, newPhone)

    expect(await phoneCheck.status(admin)).toEqual({ phone: newPhone, verified: false })
  })

  it('refuses a Canadian number before Twilio is asked, and records nothing', async () => {
    await setRosterPhone(ministry.adminPersonId, '+14165550100')

    expect(await phoneCheck.sendCode(admin)).toEqual({ refusal: 'phone_check.not_us' })
    expect(twilio.sent).toEqual([])

    const { rows } = await pool.query(`select 1 from phone_check where user_id = $1`, [admin.userId])
    expect(rows).toEqual([])
  })

  it('ends the attempt at the fifth wrong code', async () => {
    await phoneCheck.sendCode(admin)
    const answers = []
    for (let i = 0; i < 5; i++) answers.push(await phoneCheck.confirmCode(admin, '000000'))

    expect(answers).toEqual([
      { refusal: 'phone_check.wrong_code', triesLeft: 4 },
      { refusal: 'phone_check.wrong_code', triesLeft: 3 },
      { refusal: 'phone_check.wrong_code', triesLeft: 2 },
      { refusal: 'phone_check.wrong_code', triesLeft: 1 },
      { refusal: 'phone_check.attempt_ended' },
    ])
    expect(await phoneCheck.confirmCode(admin, '123456')).toEqual({
      refusal: 'phone_check.attempt_ended',
    })
    expect(twilio.checked).toHaveLength(5)

    // A new code is a new attempt, with five tries of its own.
    await phoneCheck.sendCode(admin)
    expect(await phoneCheck.confirmCode(admin, '123456')).toEqual({ verified: ministry.adminPhone })
  })

  it('resends into the attempt that is open, and starts a new one once it expires', async () => {
    await phoneCheck.sendCode(admin)
    clock.advanceBy(minutes(2))
    await phoneCheck.sendCode(admin)
    clock.advanceBy(minutes(11))

    expect(await phoneCheck.confirmCode(admin, '123456')).toEqual({
      refusal: 'phone_check.code_expired',
    })
    await phoneCheck.sendCode(admin)

    const { rows } = await pool.query<{ ended_by: string | null; codes: number }>(
      `select pc.ended_by, (select count(*)::int from phone_check_code c where c.phone_check_id = pc.id) as codes
         from phone_check pc where pc.user_id = $1 order by pc.started_at`,
      [admin.userId],
    )
    expect(rows).toEqual([
      { ended_by: 'expired', codes: 2 },
      { ended_by: null, codes: 1 },
    ])
  })
})

describe('the code limits, counted in Postgres', () => {
  it('stops the sixth code in an hour, and allows one again after it', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await phoneCheck.sendCode(admin)).toEqual({ sent: ministry.adminPhone })
      clock.advanceBy(minutes(1))
    }
    expect(await phoneCheck.sendCode(admin)).toEqual({ refusal: 'phone_check.too_many_codes' })

    clock.advanceBy(minutes(60))
    expect(await phoneCheck.sendCode(admin)).toEqual({ sent: ministry.adminPhone })
  })

  it('stops the eleventh code in a day', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await phoneCheck.sendCode(admin)).toEqual({ sent: ministry.adminPhone })
      clock.advanceBy(minutes(13))
    }
    expect(await phoneCheck.sendCode(admin)).toEqual({ refusal: 'phone_check.too_many_codes' })
  })

  it('counts the codes sent to one phone by every Admin', async () => {
    const other = await createMinistryWithAdmin('Hillside Fellowship')
    await setRosterPhone(other.adminPersonId, ministry.adminPhone)
    const otherAdmin = { userId: other.adminUserId, ministryId: other.id }

    for (let i = 0; i < 5; i++) await phoneCheck.sendCode(i % 2 === 0 ? admin : otherAdmin)

    expect(await phoneCheck.sendCode(otherAdmin)).toEqual({
      refusal: 'phone_check.too_many_codes',
    })
  })

  it('opens one attempt and counts both codes when the button is pressed twice at once', async () => {
    const both = await Promise.all([phoneCheck.sendCode(admin), phoneCheck.sendCode(admin)])

    expect(both).toEqual([{ sent: ministry.adminPhone }, { sent: ministry.adminPhone }])
    const { rows } = await pool.query<{ attempts: number; codes: number }>(
      `select count(distinct pc.id)::int as attempts, count(c.id)::int as codes
         from phone_check pc join phone_check_code c on c.phone_check_id = pc.id
        where pc.user_id = $1`,
      [admin.userId],
    )
    expect(rows).toEqual([{ attempts: 1, codes: 2 }])
  })
})

describe('who may read a phone check', () => {
  it('is nobody but the trusted connection', async () => {
    const { rows } = await pool.query<{ grantee: string; table_name: string }>(
      `select grantee, table_name
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('phone_check', 'phone_check_code')
          and grantee in ('anon', 'authenticated', 'service_role', 'discipler_command')`,
    )
    expect(rows).toEqual([])

    const { rows: security } = await pool.query<{ relname: string; forced: boolean; policies: number }>(
      `select c.relname, c.relforcerowsecurity as forced,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('phone_check', 'phone_check_code')
        order by c.relname`,
    )
    expect(security).toEqual([
      { relname: 'phone_check', forced: true, policies: 0 },
      { relname: 'phone_check_code', forced: true, policies: 0 },
    ])
  })
})
