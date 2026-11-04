import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { SIGN_UP_CONSENT_VERSION, TERMS_VERSION } from '~/domain/consent'
import type { EmailAddress } from '~/domain/email'
import { PairingRefused } from '~/domain/errors'
import { personId, type IdSource } from '~/domain/ids'
import { EXPONENTIAL_OFFER } from '~/domain/launch-terms'
import type { PhoneNumber } from '~/domain/roster'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createPostgresPendingSignups, type PostgresPendingSignups } from '~/platform/supabase/pending-signups'
import { MinistryNotProvisioned, openSignedUpChurch, provisionMinistry } from '~/platform/supabase/provisioning'
import { createCommandService } from '~/service/command-service'
import { createEmailSender } from '~/service/email-sender'
import { createOpeningAChurch, type ChurchOpener, type OpeningAChurch } from '~/service/opening-a-church'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import type { SignUp } from '~/service/sign-up'
import { POST as confirmCode } from '../../app/signup/confirm-code/route'
import { SIGN_UP_ATTEMPT_COOKIE } from '../../app/signup/attempt-cookie'
import { POST as humanCheck } from '../../app/signup/human-check/route'
import { POST as openChurch } from '../../app/signup/open-church/route'
import { POST as sendCode } from '../../app/signup/send-code/route'
import { noDailyCap } from '../support/daily-cap'
import {
  addASharedNumber,
  addPerson,
  aTestPhoneNumber,
  completeIntake,
  localSupabase,
  pairOneToOne,
  publishSupabaseCredentials,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'
import { aNetworkAddress, anAddress, buildHarness, codeIn, GOOD_TOKEN } from '../support/sign-up-scenarios'

/**
 * "Set up your account" and what it opens (Exponential launch, ticket 17): the real
 * routes, tables, Supabase Auth and session, with Cloudflare and Resend as fakes at their
 * ports. In process because a built server has neither fake to reach for and must not call
 * either vendor. The page itself is `tests/app/the-sign-up-pages.test.ts`.
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

/** The session the browser would be holding, by what the route set on its way out. */
const sessionCookies = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...sessionCookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void sessionCookies.set(name, value),
  }),
}))

const PASSWORD = 'grace shepherds 1'

/** A real US number, which sign-up requires and the fixtures' 555 numbers are not. */
const aUsPhone = () => `+1205${2_000_000 + Math.floor(Math.random() * 7_999_999)}`

const aChurchName = () => `Grace Church ${crypto.randomUUID().slice(0, 8)}`

let store: PostgresPendingSignups
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

/** Page one to the proven address, through the real routes. */
const aProvenAttempt = async ({ email = anAddress(), phone = aUsPhone() } = {}) => {
  const attempt = attemptFromCookie(await humanCheck(post('/signup/human-check', { token: GOOD_TOKEN })))
  const pressedAt = h.clock.now()
  const sent = await sendCode(post('/signup/send-code', { email, phone }, attempt))
  expect(sent.status).toBe(200)
  const proven = await confirmCode(post('/signup/confirm-code', { code: codeIn(h.email.delivered.at(-1)) }, attempt))
  expect(proven.status).toBe(200)
  return { attempt, email, phone, pressedAt }
}

const theForm = (fields: Record<string, string> = {}) => ({
  humanToken: GOOD_TOKEN,
  churchName: aChurchName(),
  fullName: 'Dan Whitfield',
  heardFrom: '',
  password: PASSWORD,
  timezone: 'America/Chicago',
  cycle: 'month',
  agreedToTerms: 'yes',
  code: '',
  ...fields,
})

const start = (attempt: string, fields: Record<string, string> = {}) =>
  openChurch(post('/signup/open-church', theForm(fields), attempt))

const answerTo = async (attempt: string, fields: Record<string, string> = {}) => {
  const response = await start(attempt, fields)
  return { status: response.status, body: (await response.json()) as Record<string, unknown>, response }
}

const churchNamed = async (name: string) => {
  const { rows } = await pool.query<{ id: string; timezone: string }>(`select id, timezone from ministry where name = $1`, [name])
  return rows
}

const accountsOnPhone = async (phone: string) => {
  const { rows } = await pool.query<{ id: string; email: string | null }>(`select id, email from auth.users where phone = $1`, [
    phone.replace(/^\+/, ''),
  ])
  return rows
}

const adminOf = async (ministryId: string) => {
  const { rows } = await pool.query<{ id: string; user_id: string; phone: string }>(
    `select p.id, p.user_id, p.phone from person p
       join ministry_member m on m.user_id = p.user_id and m.ministry_id = p.ministry_id
      where p.ministry_id = $1 and m.tier = 'admin'`,
    [ministryId],
  )
  return rows[0]!
}

const attemptRow = async (email: string) => {
  const { rows } = await pool.query(`select * from pending_signup where email = $1`, [email])
  return rows[0] as { spent_at: Date | null; agreed_at: Date | null } & Record<string, unknown>
}

const openedChurch = async (fields: Record<string, string> = {}, who: { email?: string; phone?: string } = {}) => {
  const proven = await aProvenAttempt(who)
  const form = theForm(fields)
  const answer = await answerTo(proven.attempt, form)
  expect(answer.body).toEqual({ next: '/signup/payment' })
  const [church] = await churchNamed(form.churchName)
  return { ...proven, church: church!, name: form.churchName, form, answer }
}

const openingWith = (openChurchWith: ChurchOpener) =>
  createOpeningAChurch({
    signUp: h.signUp,
    signUps: store,
    openChurch: openChurchWith,
    sender: createEmailSender(h.email.transport),
    clock: h.clock,
  })

beforeAll(() => {
  publishSupabaseCredentials()
  pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  store = createPostgresPendingSignups(localSupabase().databaseUrl)
})

afterAll(async () => {
  await store.close()
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
  currentOpening = openingWith(openSignedUpChurch)
  sessionCookies.clear()
  vi.stubEnv('SIGN_UP_OPEN', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('while sign-up is shut', () => {
  it('answers 404 and never reaches the service', async () => {
    vi.stubEnv('SIGN_UP_OPEN', '')
    currentSignUp = null
    currentOpening = null

    const response = await openChurch(post('/signup/open-church', theForm()))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })
})

describe('opening a church', { timeout: 60_000 }, () => {
  it('opens one, signs the Admin in with the password just chosen, and goes to the payment step', async () => {
    const { church, phone, email, answer } = await openedChurch({ fullName: '  Dan   Whitfield ' })

    expect(answer.status).toBe(200)
    const admin = await adminOf(church.id)
    expect(admin.phone).toBe(phone)

    const { rows: people } = await pool.query(`select full_name from person where id = $1`, [admin.id])
    expect(people).toEqual([{ full_name: 'Dan Whitfield' }])

    // The session the route set, as a browser would hold it.
    const authCookie = [...sessionCookies.keys()].find((cookie) => cookie.includes('auth-token'))
    expect(authCookie, `cookies set: ${[...sessionCookies.keys()]}`).toBeDefined()

    // The attempt's cookie goes with the attempt.
    // Read back and written again first, as Next does when a route also set a cookie through
    // `next/headers`, which is what signing in does, and which drops a `Max-Age=0`.
    const asServed = new ResponseCookies(answer.response.headers)
    for (const cookie of asServed.getAll()) asServed.set(cookie)
    const cleared = answer.response.headers.getSetCookie().find((line) => line.startsWith(`${SIGN_UP_ATTEMPT_COOKIE}=`))
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i)
    expect(cleared).toMatch(/Path=\/signup/i)

    expect(await attemptRow(email)).toMatchObject({ spent_at: expect.any(Date) })
  })

  it('takes the second token of its own kind, from this page', async () => {
    const { attempt } = await aProvenAttempt()
    h.human.asked.length = 0

    expect(await answerTo(attempt, { humanToken: 'a-forged-token' })).toMatchObject({
      status: 403,
      body: { refusal: 'signup.not_human' },
    })
    expect(h.human.asked).toEqual([{ token: 'a-forged-token', action: 'signup_open' }])
  })

  it('takes the email and the phone from the attempt, whatever the form says', async () => {
    const { phone, email, church } = await openedChurch({ email: 'someone.else@example.com', phone: '+12055550199' })

    const admin = await adminOf(church.id)
    expect(admin.phone).toBe(phone)
    expect((await accountsOnPhone(phone))[0]!.email).toBe(email.toLowerCase())
  })

  it('refuses an attempt whose proof lapsed, and sends nothing to say so but the code', async () => {
    const { attempt } = await aProvenAttempt()
    h.clock.advanceBy(61 * 60_000)

    expect(await answerTo(attempt)).toMatchObject({ status: 409, body: { refusal: 'signup.not_verified' } })
  })

  it('refuses a visitor with no attempt', async () => {
    const response = await openChurch(post('/signup/open-church', theForm()))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ refusal: 'signup.not_verified' })
  })

  it.each([
    ['church name', { churchName: ' ​ ' }, 'signup.church_name_needed'],
    ['full name', { fullName: '   ' }, 'signup.full_name_needed'],
    ['agreement to the terms', { agreedToTerms: 'no' }, 'signup.terms_needed'],
    ['monthly or yearly', { cycle: 'weekly' }, 'signup.bad_cycle'],
  ])('refuses a missing %s, even though only the button stood in its way', async (_what, fields, refusal) => {
    const { attempt, phone } = await aProvenAttempt()
    h.human.asked.length = 0

    expect(await answerTo(attempt, fields)).toMatchObject({ status: 422, body: { refusal } })

    expect(await accountsOnPhone(phone)).toEqual([])
    expect(h.human.asked, 'a form that is refused anyway spends no token').toEqual([])
  })
})

describe('a double click', { timeout: 60_000 }, () => {
  it('opens one church, one account and one row, and the person ends up signed in', async () => {
    const { attempt, phone, email } = await aProvenAttempt()
    const form = theForm()
    h.human.asked.length = 0

    const answers = await Promise.all([start(attempt, form), start(attempt, form)])
    const bodies = await Promise.all(answers.map((response) => response.json() as Promise<{ next: string }>))

    expect(answers.map((response) => response.status)).toEqual([200, 200])
    expect(bodies.map((body) => body.next).sort()).toEqual(['/', '/signup/payment'])

    const churches = await churchNamed(form.churchName)
    expect(churches).toHaveLength(1)
    expect(await accountsOnPhone(phone)).toHaveLength(1)

    const { rows } = await pool.query(`select 1 from church_signup where ministry_id = $1`, [churches[0]!.id])
    expect(rows).toHaveLength(1)

    expect([...sessionCookies.keys()].some((cookie) => cookie.includes('auth-token'))).toBe(true)
    expect(h.human.asked, 'the second never reached Cloudflare').toHaveLength(1)
    expect(h.email.delivered.filter((envelope) => envelope.kind === 'newSignUp')).toHaveLength(1)
    expect(await attemptRow(email)).toMatchObject({ spent_at: expect.any(Date) })
  })

  it('opens nothing on a second request for a spent attempt, and the answer goes to /', async () => {
    const { attempt, phone, form } = await openedChurch()
    const before = await pool.query(`select count(*)::int as churches from ministry`)
    h.human.asked.length = 0

    const again = await answerTo(attempt, { ...form, churchName: aChurchName() })

    expect(again).toMatchObject({ status: 200, body: { next: '/' } })
    const after = await pool.query(`select count(*)::int as churches from ministry`)
    expect(after.rows[0].churches).toBe(before.rows[0].churches)
    expect(await accountsOnPhone(phone)).toHaveLength(1)
    expect(h.human.asked).toEqual([])
  })

  it('stands behind the lock: an attempt spent inside the transaction takes its account back', async () => {
    const { attempt, phone } = await aProvenAttempt()
    const readiness = await h.signUp.readyToOpen({ attempt, humanToken: GOOD_TOKEN })
    if (!('ready' in readiness)) throw new Error('Not ready')
    await pool.query(`update pending_signup set spent_at = now() where id = $1`, [readiness.ready.pendingSignupId])
    const name = aChurchName()

    const opened = await openSignedUpChurch({
      pendingSignupId: readiness.ready.pendingSignupId,
      churchName: name,
      timezone: 'America/Chicago',
      at: h.clock.now(),
      admin: {
        fullName: 'Dan Whitfield',
        phone: phone as PhoneNumber,
        email: anAddress() as EmailAddress,
        password: PASSWORD,
      },
      agreedAt: h.clock.now(),
      cycle: 'month',
      carriedCode: null,
      heardFrom: null,
    })

    expect(opened).toEqual({ alreadyOpened: true })
    expect(await churchNamed(name)).toEqual([])
    expect(await accountsOnPhone(phone)).toEqual([])
  })
})

describe('the password', { timeout: 60_000 }, () => {
  it('is refused by the server when it is common, even though the button was on, and costs nothing', async () => {
    const { attempt, phone, email } = await aProvenAttempt()
    const form = theForm({ password: 'password123' })
    h.human.asked.length = 0

    expect(await answerTo(attempt, form)).toMatchObject({
      status: 422,
      body: {
        refusal: 'account.password_too_common',
        message: 'That password is one of the most common, so it is easy to guess. Choose another.',
      },
    })

    expect(await churchNamed(form.churchName)).toEqual([])
    expect(await accountsOnPhone(phone)).toEqual([])
    expect(await attemptRow(email)).toMatchObject({ spent_at: null })
    expect(h.human.asked).toEqual([])

    // A better one, on the same attempt.
    expect((await answerTo(attempt, { ...form, password: PASSWORD })).body).toEqual({ next: '/signup/payment' })
  })

  it('is refused by the server when it is short or too long', async () => {
    const { attempt } = await aProvenAttempt()

    expect(await answerTo(attempt, { password: 'short' })).toMatchObject({
      body: { refusal: 'account.password_too_short' },
    })
    expect(await answerTo(attempt, { password: 'x'.repeat(73) })).toMatchObject({
      body: { refusal: 'account.password_too_long' },
    })
  })

  it('is stored nowhere on pending_signup or church_signup', async () => {
    const { email, church } = await openedChurch()

    const { rows: columns } = await pool.query(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('pending_signup', 'church_signup')
          and (column_name ilike '%password%' or column_name ilike '%secret%')`,
    )
    expect(columns).toEqual([])

    const { rows } = await pool.query<{ held: string }>(
      `select to_jsonb(p)::text as held from pending_signup p where email = $1
       union all
       select to_jsonb(c)::text from church_signup c where ministry_id = $2`,
      [email, church.id],
    )
    expect(rows).toHaveLength(2)
    for (const { held } of rows) expect(held).not.toContain(PASSWORD)
  })
})

describe('the timezone', { timeout: 60_000 }, () => {
  it('is stored as chosen', async () => {
    const { church } = await openedChurch({ timezone: 'Pacific/Honolulu' })
    expect(church.timezone).toBe('Pacific/Honolulu')
  })

  it('takes a zone the device named that the list does not', async () => {
    const { church } = await openedChurch({ timezone: 'Asia/Kolkata' })
    expect(church.timezone).toBe('Asia/Kolkata')
  })

  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['not a zone', 'Mars/Olympus_Mons'],
    ['an abbreviation the dispatcher cannot read', 'CEST'],
  ])('is refused when it is %s, with no account made', async (_why, timezone) => {
    const { attempt, phone } = await aProvenAttempt()
    const form = theForm({ timezone })

    expect(await answerTo(attempt, form)).toMatchObject({
      status: 422,
      body: { refusal: 'signup.bad_timezone', message: 'Please choose your timezone.' },
    })
    expect(await churchNamed(form.churchName)).toEqual([])
    expect(await accountsOnPhone(phone)).toEqual([])
  })
})

describe('the account it makes', { timeout: 60_000 }, () => {
  const signInWith = async (credential: { email: string } | { phone: string }) => {
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ ...credential, password: PASSWORD } as Parameters<
      typeof client.auth.signInWithPassword
    >[0])
    return { client, error }
  }

  it('holds the proven address in lower case, confirmed, beside the phone', async () => {
    const typed = `Pastor.${crypto.randomUUID().slice(0, 8)}@Grace.Example`
    const { church, phone } = await openedChurch({}, { email: typed, phone: aUsPhone() })

    const { data, error } = await serviceRoleClient().auth.admin.getUserById((await adminOf(church.id)).user_id)
    expect(error).toBeNull()
    expect(data.user!.email).toBe(typed.toLowerCase())
    expect(data.user!.email_confirmed_at).toBeTruthy()
    expect(data.user!.phone).toBe(phone.replace('+', ''))
    expect(data.user!.phone_confirmed_at).toBeTruthy()
  })

  it('can sign in with the email and with the phone, the first of which ticket 21 opens the door to', async () => {
    const { email, phone } = await openedChurch()

    expect((await signInWith({ email })).error).toBeNull()
    expect((await signInWith({ phone })).error).toBeNull()
  })

  it('leaves every other caller making a phone-only account', async () => {
    const provisioned = await provisionMinistry({
      name: aChurchName(),
      timezone: 'America/New_York',
      admin: { fullName: 'Phone Only', phone: aTestPhoneNumber(), password: PASSWORD },
    })

    const { data } = await serviceRoleClient().auth.admin.getUserById(provisioned.adminUserId)
    expect(data.user!.email).toBe('')

    const { rows } = await pool.query(
      `select
         (select count(*)::int from church_signup where ministry_id = $1) as signups,
         (select count(*)::int from consent_record where ministry_id = $1) as consents,
         (select count(*)::int from ministry_event where ministry_id = $1 and type = 'ministry.terms_accepted') as terms`,
      [provisioned.ministryId],
    )
    expect(rows[0]).toEqual({ signups: 0, consents: 0, terms: 0 })
  })
})

describe('what it chose', { timeout: 60_000 }, () => {
  const rowFor = async (ministryId: string) => {
    const { rows } = await pool.query(`select * from church_signup where ministry_id = $1`, [ministryId])
    return rows[0]
  }

  it('is kept for the payment step and its reminder', async () => {
    const { church } = await openedChurch({
      cycle: 'year',
      code: EXPONENTIAL_OFFER.code,
      heardFrom: 'conferences',
    })

    expect(await rowFor(church.id)).toEqual({
      ministry_id: church.id,
      billing_cycle: 'year',
      carried_code: EXPONENTIAL_OFFER.code,
      heard_from: 'conferences',
      reminder_sent_at: null,
      reminders_off_at: null,
    })
  })

  it('keeps a code that did not apply as it was carried, because the payment step says so', async () => {
    const { church } = await openedChurch({ code: 'NOTACODE' })
    expect(await rowFor(church.id)).toMatchObject({ carried_code: 'NOTACODE', heard_from: null })
  })

  it('keeps nothing that could not be a code, and no answer a person could not have chosen', async () => {
    const { church } = await openedChurch({ code: '"><script>', heardFrom: 'a-billboard' })
    expect(await rowFor(church.id)).toMatchObject({ carried_code: null, heard_from: null })
  })

  it('is no business of a signed-in browser', async () => {
    const { phone, church } = await openedChurch()
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    await client.auth.signInWithPassword({ phone, password: PASSWORD })

    const { error } = await client.from('church_signup').select('*').eq('ministry_id', church.id)
    expect(error?.code).toBe('42501')
  })

  it('is read as discipler_command for its own church only', async () => {
    const first = await openedChurch()
    const second = await openedChurch()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [first.church.id])
      const { rows } = await client.query<{ ministry_id: string }>(`select ministry_id from church_signup`)
      expect(rows.map((row) => row.ministry_id)).not.toContain(second.church.id)
    } finally {
      await client.query('rollback')
      client.release()
    }
  })
})

describe('the consent and the terms', { timeout: 60_000 }, () => {
  const consentOf = async (personOf: string) => {
    const { rows } = await pool.query(
      `select consent, granted, version, source, decided_at, intake_path, declared_side
         from consent_record where person_id = $1`,
      [personOf],
    )
    return rows
  }

  it('records the Admin\'s consent for texts, at the press of "Email me a code"', async () => {
    const { church, pressedAt } = await openedChurch()

    expect(await consentOf((await adminOf(church.id)).id)).toEqual([
      {
        consent: 'sms',
        granted: true,
        version: SIGN_UP_CONSENT_VERSION,
        source: 'ministry_setup',
        decided_at: pressedAt,
        intake_path: null,
        declared_side: null,
      },
    ])
  })

  it('keeps that time after a resend, and however long the page took', async () => {
    const email = anAddress()
    const phone = aUsPhone()
    const attempt = attemptFromCookie(await humanCheck(post('/signup/human-check', { token: GOOD_TOKEN })))
    const pressedAt = h.clock.now()
    await sendCode(post('/signup/send-code', { email, phone }, attempt))

    h.clock.advanceBy(2 * 60_000)
    const { POST: resendCode } = await import('../../app/signup/resend-code/route')
    expect((await resendCode(post('/signup/resend-code', {}, attempt))).status).toBe(200)
    await confirmCode(post('/signup/confirm-code', { code: codeIn(h.email.delivered.at(-1)) }, attempt))

    h.clock.advanceBy(20 * 60_000)
    const form = theForm()
    expect((await answerTo(attempt, form)).body).toEqual({ next: '/signup/payment' })

    const [church] = await churchNamed(form.churchName)
    const [consent] = await consentOf((await adminOf(church!.id)).id)
    expect(consent.decided_at).toEqual(pressedAt)
  })

  it('never uses the version Statement 1 is recorded under', async () => {
    const { CONSENT_VERSION } = await import('~/domain/consent')
    expect(SIGN_UP_CONSENT_VERSION).not.toBe(CONSENT_VERSION)
  })

  it('records the terms as an event, with their version and the time pressed', async () => {
    const before = h.clock.now()
    h.clock.advanceBy(5_000)
    const { church } = await openedChurch()

    const { rows } = await pool.query(
      `select occurred_at, subject_type, subject_id, payload from ministry_event
        where ministry_id = $1 and type = 'ministry.terms_accepted'`,
      [church.id],
    )
    expect(rows).toEqual([
      {
        occurred_at: h.clock.now(),
        subject_type: 'ministry',
        subject_id: church.id,
        payload: { termsVersion: TERMS_VERSION, adminPersonId: (await adminOf(church.id)).id },
      },
    ])
    expect(rows[0].occurred_at.getTime()).toBeGreaterThan(before.getTime())
  })

  it('takes the terms version from the date in the terms themselves', () => {
    const terms = readFileSync(fileURLToPath(new URL('../../docs/legal/terms-of-service.md', import.meta.url)), 'utf8')
    const effective = /^Effective date: (.+)$/m.exec(terms)![1]!
    const day = new Date(`${effective} 00:00:00 UTC`).toISOString().slice(0, 10)

    expect(TERMS_VERSION).toBe(day)
  })
})

describe('an Admin holding only this consent', { timeout: 120_000 }, () => {
  const CHECK_IN_HOUR = new Date('2031-03-03T20:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  let effects: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>

  const delivered: { to: string; body: string }[] = []
  const transport: MessageTransport = {
    async deliver(_from, to, body) {
      delivered.push({ to, body })
    },
  }

  const serviceAt = (now: Date) =>
    createCommandService({ clock: createTestClock(now), ids, store: effects, appBaseUrl: 'https://discipler.test' })

  const fixtureFor = (id: string, name: string) => ({ id, name }) as MinistryFixture

  beforeAll(() => {
    effects = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await effects.close()
    await queue.close()
  })

  afterEach(() => {
    delivered.length = 0
  })

  /** With the texting gate out of the way, so only the consent and the Intake are on trial. */
  const aChurchAllowedToText = async () => {
    const opened = await openedChurch()
    // The fixtures add a shared number with each church, and this church is not theirs.
    await addASharedNumber()
    await pool.query(`update ministry_billing set billed_outside_stripe = true where ministry_id = $1`, [opened.church.id])
    await pool.query(`update ministry set checkin_day = 1, checkin_hour = 20, timezone = 'UTC' where id = $1`, [opened.church.id])
    return { ...opened, admin: await adminOf(opened.church.id), fixture: fixtureFor(opened.church.id, opened.name) }
  }

  const tickAndDrain = async (ministryId: string) => {
    await serviceAt(CHECK_IN_HOUR).execute({ type: 'scheduled.tick', ministryId: ministryId as never })
    return dispatchQueue({
      queue,
      transport,
      clock: createTestClock(CHECK_IN_HOUR),
      ministryId: ministryId as never,
      dailyCap: noDailyCap,
    })
  }

  it('reads as having given no Intake, so their Participation Status is unchanged', async () => {
    const { admin } = await aChurchAllowedToText()

    const { rows } = await pool.query(
      `select public.participation_status(p) as status,
              (select count(*)::int from intake_submission i where i.person_id = p.id) as intakes
         from person p where p.id = $1`,
      [admin.id],
    )
    expect(rows).toEqual([{ status: 'no_intake_submitted', intakes: 0 }])
  })

  it('may be texted, which is what the test check-in needs: the outbound trigger takes it', async () => {
    const { admin, church } = await aChurchAllowedToText()

    await expect(
      pool.query(
        `insert into outbound_message
           (ministry_id, carries_rates_line, person_id, to_phone, body, enqueued_at, message_kind)
         values ($1, false, $2, $3, 'A test check-in', $4, 'no_reply')`,
        [church.id, admin.id, admin.phone, CHECK_IN_HOUR],
      ),
    ).resolves.toBeDefined()
  })

  it('gets no Check-In Rhythm text, while a Discipler in the same church does', async () => {
    const { admin, church, fixture } = await aChurchAllowedToText()
    const leaderPhone = aTestPhoneNumber()
    const leader = personId(await addPerson(fixture, 'Dana Leader', { phone: leaderPhone }))
    const disciple = personId(await addPerson(fixture, 'Sam Disciple', { phone: aTestPhoneNumber() }))
    await completeIntake(fixture, leader)
    await completeIntake(fixture, disciple)
    await pairOneToOne(fixture, leader, disciple, { joinedAt: new Date(CHECK_IN_HOUR.getTime() - weeks(1)) })

    await tickAndDrain(church.id)

    expect(delivered.map(({ to }) => to), 'the tick ran, and reached its Discipler').toContain(leaderPhone)
    expect(delivered.map(({ to }) => to)).not.toContain(admin.phone)
    const { rows } = await pool.query(`select 1 from outbound_message where person_id = $1`, [admin.id])
    expect(rows).toEqual([])
  })

  it('cannot be made a Discipler', async () => {
    const { admin, church, fixture } = await aChurchAllowedToText()
    const disciple = await addPerson(fixture, 'Sam Disciple', { phone: aTestPhoneNumber() })

    await expect(
      serviceAt(new Date()).execute({
        type: 'relationship.create',
        ministryId: church.id as never,
        leaderIds: [personId(admin.id)],
        participantIds: [personId(disciple)],
      }),
    ).rejects.toThrow(new PairingRefused('relationship.leader_has_not_completed_intake'))
  })

  it('cannot be made a Disciple', async () => {
    const { admin, church, fixture } = await aChurchAllowedToText()
    const leader = await addPerson(fixture, 'Dana Leader', { phone: aTestPhoneNumber() })

    await expect(
      serviceAt(new Date()).execute({
        type: 'relationship.create',
        ministryId: church.id as never,
        leaderIds: [personId(leader)],
        participantIds: [personId(admin.id)],
      }),
    ).rejects.toBeInstanceOf(PairingRefused)
  })

  it('is not offered by Suggested Pairs', async () => {
    const { admin, church, phone } = await aChurchAllowedToText()
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    await client.auth.signInWithPassword({ phone, password: PASSWORD })

    const { data, error } = await client.rpc('suggestion_inputs', { target_ministry_id: church.id })

    expect(error).toBeNull()
    expect((data as { person_id: string }[]).map((row) => row.person_id)).not.toContain(admin.id)
  })

  it('has the later Intake win: declining there means no texts, even the test check-in', async () => {
    const { admin, fixture } = await aChurchAllowedToText()

    await completeIntake(fixture, admin.id, ['contact_sharing'])
    await pool.query(
      `insert into consent_record (ministry_id, person_id, consent, granted, version, source, decided_at)
       values ($1, $2, 'sms', false, '2026-09-v1', 'pastor_link', $3)`,
      [fixture.id, admin.id, new Date()],
    )

    const { rows } = await pool.query(`select app.current_consent($1, 'sms') as sms`, [admin.id])
    expect(rows).toEqual([{ sms: false }])
  })

  describe('with no subscription, as every church made here starts', () => {
    it('is billed through Stripe, has no subscription, and its texts are withheld until the payment step', async () => {
      const { church } = await openedChurch()
      const admin = await adminOf(church.id)

      const { rows: billing } = await pool.query(
        `select billed_outside_stripe, stripe_customer_id, stripe_subscription_id from ministry_billing where ministry_id = $1`,
        [church.id],
      )
      expect(billing).toEqual([{ billed_outside_stripe: false, stripe_customer_id: null, stripe_subscription_id: null }])

      const { rows: queued } = await pool.query<{ id: string }>(
        `insert into outbound_message
           (ministry_id, carries_rates_line, person_id, to_phone, body, enqueued_at, message_kind)
         values ($1, false, $2, $3, 'A text before the payment step', $4, 'no_reply')
         returning id`,
        [church.id, admin.id, admin.phone, CHECK_IN_HOUR],
      )

      await dispatchQueue({
        queue,
        transport,
        clock: createTestClock(CHECK_IN_HOUR),
        ministryId: church.id as never,
        dailyCap: noDailyCap,
      })

      expect(delivered).toEqual([])
      const { rows } = await pool.query(`select sent_at, withheld_reason from outbound_message where id = $1`, [queued[0]!.id])
      expect(rows).toEqual([{ sent_at: null, withheld_reason: 'church_has_no_access' }])
    })
  })
})

describe('a phone or email that already has an account', { timeout: 60_000 }, () => {
  const TAKEN = 'That phone number or email already has a Discipler account. Sign in, or start again with a different one.'

  it('is refused for the phone, in the draft\'s words, leaving nothing behind and the attempt live', async () => {
    const { phone } = await openedChurch()
    const { attempt, email } = await aProvenAttempt({ phone })
    const form = theForm()

    expect(await answerTo(attempt, form)).toMatchObject({
      status: 409,
      body: { refusal: 'account.already_exists', message: TAKEN },
    })

    expect(await churchNamed(form.churchName)).toEqual([])
    expect(await accountsOnPhone(phone)).toHaveLength(1)
    expect(await attemptRow(email)).toMatchObject({ spent_at: null })
  })

  it('is refused for an address an account took after this attempt proved it', async () => {
    const email = anAddress()
    const later = await aProvenAttempt({ email })
    await openedChurch({}, { email, phone: aUsPhone() })
    const form = theForm()

    expect(await answerTo(later.attempt, form)).toMatchObject({
      status: 409,
      body: { refusal: 'account.already_exists', message: TAKEN },
    })
    expect(await churchNamed(form.churchName)).toEqual([])
    expect(await accountsOnPhone(later.phone)).toEqual([])
  })

  it('lets "start again" open a new attempt that goes all the way', async () => {
    const { phone } = await openedChurch()
    const { attempt } = await aProvenAttempt({ phone })
    await answerTo(attempt)

    // A new pass of the check is what `signUpHref('human_check', carried, { again: true })` opens.
    const again = await aProvenAttempt()
    expect(again.attempt).not.toBe(attempt)

    expect((await answerTo(again.attempt)).body).toEqual({ next: '/signup/payment' })
  })
})

describe('when something fails', { timeout: 60_000 }, () => {
  it('leaves no account behind when the transaction fails, as provisioning always has', async () => {
    const { attempt, phone, email } = await aProvenAttempt()
    const readiness = await h.signUp.readyToOpen({ attempt, humanToken: GOOD_TOKEN })
    if (!('ready' in readiness)) throw new Error('Not ready')
    const name = aChurchName()

    // A blank name passes the type checker and fails `person`'s own check, inside the
    // transaction, with the Ministry already written.
    await expect(
      openSignedUpChurch({
        pendingSignupId: readiness.ready.pendingSignupId,
        churchName: name,
        timezone: 'America/Chicago',
        at: h.clock.now(),
        admin: { fullName: '   ', phone: phone as PhoneNumber, email: email as EmailAddress, password: PASSWORD },
        agreedAt: h.clock.now(),
        cycle: 'month',
        carriedCode: null,
        heardFrom: null,
      }),
    ).rejects.toThrow(MinistryNotProvisioned)

    expect(await churchNamed(name)).toEqual([])
    expect(await accountsOnPhone(phone)).toEqual([])
    expect(await attemptRow(email), 'the attempt is taken back with it').toMatchObject({ spent_at: null })

    // And the same attempt can go on.
    expect((await answerTo(attempt)).body).toEqual({ next: '/signup/payment' })
  })

  it('shows the browser a code and never what provisioning said, and logs the name alone', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    currentOpening = openingWith(async () => {
      throw new MinistryNotProvisioned('a constraint complained about +12055550123')
    })
    const { attempt } = await aProvenAttempt()

    const answer = await answerTo(attempt)

    expect(answer).toMatchObject({ status: 502, body: { refusal: 'signup.not_opened' } })
    expect(JSON.stringify(answer.body)).not.toContain('constraint')
    expect(logged.mock.calls.join(' ')).toContain('MinistryNotProvisioned')
    expect(logged.mock.calls.join(' ')).not.toContain('+1205')
  })

  it('sends them to sign in by hand when the church opened and signing in did not', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { attempt, email } = await aProvenAttempt()
    const name = aChurchName()
    const opening = currentOpening!
    currentOpening = {
      ...opening,
      open: async (form) => {
        const outcome = await opening.open(form)
        if (!('opened' in outcome)) throw new Error('It should have opened.')
        return { opened: { ...outcome.opened, password: 'not the password chosen' } }
      },
    }

    const answer = await answerTo(attempt, { churchName: name })

    expect(answer).toMatchObject({ status: 200, body: { next: '/login' } })
    expect(await churchNamed(name)).toHaveLength(1)
    expect(await attemptRow(email)).toMatchObject({ spent_at: expect.any(Date) })
    expect([...sessionCookies.keys()].some((cookie) => cookie.includes('auth-token'))).toBe(false)
    expect(logged.mock.calls.join(' ')).toContain('Signing in')
    expect(logged.mock.calls.join(' ')).not.toContain('not the password chosen')
  })
})

describe('telling support@', { timeout: 60_000 }, () => {
  const newSignUps = () => h.email.delivered.filter((envelope) => envelope.kind === 'newSignUp')

  it('sends one email, after the commit, with the church, where it heard and its offer', async () => {
    const { name } = await openedChurch({ heardFrom: 'conferences', code: EXPONENTIAL_OFFER.code })

    expect(newSignUps()).toHaveLength(1)
    const [email] = newSignUps()
    expect(email!.to).toEqual(['support@trydiscipler.com'])
    expect(email!.subject).toContain(name)
    expect(email!.text).toContain(name)
    expect(email!.text).toContain('Conferences')
    // On the system clock's day this runs, whichever side of the offer's end that is.
    expect(email!.text).toMatch(/Offer: (The Exponential special offer|None)/)
  })

  it('says when it heard nothing and came with no offer', async () => {
    await openedChurch()

    const [email] = newSignUps()
    expect(email!.text).toContain('It did not say')
    expect(email!.text).toContain('Offer: None')
  })

  it('names the offer while the code runs', async () => {
    // A clock inside the offer, so this does not stop being true when the offer ends.
    currentOpening = createOpeningAChurch({
      signUp: h.signUp,
      signUps: store,
      openChurch: openSignedUpChurch,
      sender: createEmailSender(h.email.transport),
      clock: createTestClock(new Date(`${EXPONENTIAL_OFFER.lastDay}T12:00:00Z`)),
    })
    await openedChurch({ code: EXPONENTIAL_OFFER.code })

    expect(newSignUps()[0]!.text).toContain('Offer: The Exponential special offer')
  })

  it('never undoes the church, and logs the failure by its name', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const attempt = await aProvenAttempt()
    h.email.failWith(Object.assign(new Error('Resend said something about support@trydiscipler.com'), { name: 'ResendDown' }))
    const form = theForm()

    const answer = await answerTo(attempt.attempt, form)

    expect(answer.body).toEqual({ next: '/signup/payment' })
    expect(await churchNamed(form.churchName)).toHaveLength(1)
    expect(logged.mock.calls.join(' ')).toContain('ResendDown')
    expect(logged.mock.calls.join(' ')).not.toContain('Resend said')
  })
})

describe('a church-plant application', { timeout: 60_000 }, () => {
  const YES = {
    plant: 'yes',
    plantLaunchDate: 'September 2025',
    plantSendingChurch: 'First Baptist',
    plantAverageAttendance: '120',
    plantLeadPastor: 'Dan Whitfield',
    plantAnythingElse: 'We meet in a school.\nFirst service in May.',
  }

  const applicationOf = async (ministryId: string) => {
    const { rows } = await pool.query(`select * from church_plant_application where ministry_id = $1`, [ministryId])
    return rows
  }
  const applicationEmails = () => h.email.delivered.filter((envelope) => envelope.kind === 'churchPlantApplication')

  it('keeps the answers and the time, with no decision, and the church opens as usual', async () => {
    const { church, answer } = await openedChurch(YES)

    expect(answer.body).toEqual({ next: '/signup/payment' })
    const rows = await applicationOf(church.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      launch_date: 'September 2025',
      sending_church: 'First Baptist',
      average_attendance: '120',
      lead_pastor: 'Dan Whitfield',
      anything_else: 'We meet in a school.\nFirst service in May.',
      decision: null,
      decided_at: null,
    })
    expect(rows[0].applied_at).toBeInstanceOf(Date)

    const billing = await pool.query(`select billed_outside_stripe from ministry_billing where ministry_id = $1`, [church.id])
    expect(billing.rows[0].billed_outside_stripe).toBe(false)
  })

  it('writes nothing and sends nothing for No, whatever was typed before they changed their mind', async () => {
    const { church } = await openedChurch({ ...YES, plant: 'no' })

    expect(await applicationOf(church.id)).toEqual([])
    expect(applicationEmails()).toEqual([])
  })

  it('takes a lead pastor who is not the person signing up', async () => {
    const { church } = await openedChurch({ ...YES, fullName: 'Dan Whitfield', plantLeadPastor: 'Ruth Okafor' })

    expect((await applicationOf(church.id))[0].lead_pastor).toBe('Ruth Okafor')
  })

  it('emails the founders the answers, the church, the address and the ID, and no link', async () => {
    const { church, name, email: address } = await openedChurch(YES)

    const [application] = await applicationOf(church.id)
    expect(applicationEmails()).toHaveLength(1)
    const [email] = applicationEmails()
    expect(email!.to).toEqual(['james@trydiscipler.com', 'lerone@trydiscipler.com'])
    expect(email!.subject).toContain(name)
    for (const expected of [
      name,
      'Launch date, or planned launch date: September 2025',
      'Sending or partner church: First Baptist',
      'Average weekly attendance: 120',
      'Lead pastor: Dan Whitfield',
      `Login email: ${address}`,
      '> We meet in a school.',
      '> First service in May.',
      application.id,
    ]) {
      expect(email!.text).toContain(expected)
    }
    expect(email!.text).not.toMatch(/https?:|www\.|\/approve/i)
  })

  it('still tells support@ once, as for any church', async () => {
    await openedChurch(YES)

    expect(h.email.delivered.filter((envelope) => envelope.kind === 'newSignUp')).toHaveLength(1)
  })

  it('refuses Yes with a required answer missing, opens nothing and spends nothing', async () => {
    const attempt = await aProvenAttempt()
    const form = theForm({ ...YES, plantSendingChurch: '   ' })

    const answer = await answerTo(attempt.attempt, form)

    expect(answer.status).toBe(422)
    expect(answer.body).toEqual({
      refusal: 'signup.plant_sending_church_needed',
      message: 'Please enter your sending or partner church.',
    })
    expect(await churchNamed(form.churchName)).toEqual([])
    expect((await attemptRow(attempt.email)).spent_at).toBeNull()
  })

  it('never undoes the church when the email fails, logs it by name, and keeps the application', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const attempt = await aProvenAttempt()
    h.email.failWith(Object.assign(new Error('Resend said something about First Baptist'), { name: 'ResendDown' }))
    const form = theForm(YES)

    const answer = await answerTo(attempt.attempt, form)

    expect(answer.body).toEqual({ next: '/signup/payment' })
    const [church] = await churchNamed(form.churchName)
    expect(await applicationOf(church!.id)).toHaveLength(1)
    expect(logged.mock.calls.join(' ')).toContain('ResendDown')
    expect(logged.mock.calls.join(' ')).not.toContain('First Baptist')
  })

  it('goes with the church: a transaction that fails leaves neither', async () => {
    const attempt = await aProvenAttempt()
    // Longer than the column holds, past what the form reads, so only the database refuses.
    const opener: ChurchOpener = (church) =>
      openSignedUpChurch({
        ...church,
        plant: { ...church.plant!, sendingChurch: 'x'.repeat(201) },
      })
    currentOpening = openingWith(opener)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const form = theForm(YES)

    const answer = await answerTo(attempt.attempt, form)

    expect(answer.body).toMatchObject({ refusal: 'signup.not_opened' })
    expect(await churchNamed(form.churchName)).toEqual([])
    expect((await attemptRow(attempt.email)).spent_at).toBeNull()
    expect(await accountsOnPhone(attempt.phone)).toEqual([])
    expect(applicationEmails()).toEqual([])
  })

  it('cannot be read by a browser, signed in or not', async () => {
    const { church, phone } = await openedChurch(YES)
    const { apiUrl, anonKey } = localSupabase()
    const browser = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const signedOut = await browser.from('church_plant_application').select('*').eq('ministry_id', church.id)
    expect(signedOut.data).toBeNull()
    expect(signedOut.error?.code).toBe('42501')

    const { error } = await browser.auth.signInWithPassword({ phone, password: PASSWORD })
    expect(error).toBeNull()
    const signedIn = await browser.from('church_plant_application').select('*').eq('ministry_id', church.id)
    expect(signedIn.data).toBeNull()
    expect(signedIn.error?.code).toBe('42501')
  })
})

describe('the lock itself', { timeout: 30_000 }, () => {
  it('holds a second opening on one attempt until the first is done, and no other attempt', async () => {
    const first = await aProvenAttempt()
    const other = await aProvenAttempt()
    const order: string[] = []
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const holding = store.opening(first.attempt as never, async () => {
      order.push('first in')
      await held
      order.push('first out')
    })
    await new Promise((resolve) => setTimeout(resolve, 200))

    const waiting = store.opening(first.attempt as never, async () => {
      order.push('second in')
    })
    await store.opening(other.attempt as never, async () => {
      order.push('another attempt in')
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(order).toEqual(['first in', 'another attempt in'])

    release()
    await Promise.all([holding, waiting])
    expect(order).toEqual(['first in', 'another attempt in', 'first out', 'second in'])
  })
})
