import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, type TestClock } from '~/domain/clock'
import { EMAIL_CODE, PASSWORD_RESET_LINK_MINUTES } from '~/domain/launch-terms'
import { FAILED_SIGN_INS_ALLOWED } from '~/domain/sign-in-limit'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import {
  createPostgresPasswordResetLinks,
  type PostgresPasswordResetLinks,
} from '~/platform/supabase/password-reset-links'
import { createPostgresSignInLimit, type PostgresSignInLimit } from '~/platform/supabase/sign-in-limit'
import { createEmailSender } from '~/service/email-sender'
import { createForgotPassword, type ForgotPassword } from '~/service/forgot-password'
import type { Accounts } from '~/service/ports'
import { POST as askRoute } from '../../app/login/forgot/ask/route'
import { POST as saveRoute } from '../../app/login/forgot/[token]/save/route'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
  serviceRoleClient,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  aNetworkAddress,
  anAddress,
  createRecordingEmail,
  createScriptedHumanCheck,
  GOOD_TOKEN,
} from '../support/sign-up-scenarios'

/**
 * "Forgot your password?" (Exponential launch, ticket 22; ADR-0030): the real routes,
 * tables and Supabase Auth, with Cloudflare and Resend as fakes at their ports. In
 * process because a built server has neither fake to reach for and must not call either
 * vendor. A built server is `forgot-password-over-http.test.ts`.
 */

let current: ForgotPassword

vi.mock('~/service/container', () => ({ getForgotPassword: () => current }))

/** What the route left for after the response. Nothing here runs until a test says so. */
const afterTheResponse: (() => Promise<void>)[] = []

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (work: () => Promise<void>) => void afterTheResponse.push(work),
}))

const NEW_PASSWORD = 'harbinger lantern copper fern'
const COMMON_PASSWORD = 'password123'

const post = (path: string, fields: Record<string, string>, network = aNetworkAddress()) =>
  new NextRequest(`http://localhost:3100${path}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': network },
  })

describe('forgetting a password', () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  let links: PostgresPasswordResetLinks
  let signIns: PostgresSignInLimit
  let clock: TestClock
  let human: ReturnType<typeof createScriptedHumanCheck>
  let email: ReturnType<typeof createRecordingEmail>
  const made: string[] = []

  const serviceWith = (accounts: Pick<Accounts, 'setPassword'>) =>
    createForgotPassword({
      links,
      humanCheck: human.humanCheck,
      sender: createEmailSender(email.transport),
      accounts,
      signIns,
      addresses: {
        link: (token) => new URL(`/login/forgot/${token}`, 'http://localhost:3100'),
        logo: () => new URL('/discipler-logo.png', 'http://localhost:3100'),
      },
      clock,
    })

  beforeAll(async () => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ministry = await createMinistryWithAdmin('Forgot Password Chapel')
    links = createPostgresPasswordResetLinks(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    for (const id of made) await serviceRoleClient().auth.admin.deleteUser(id).catch(() => undefined)
    await links.close()
    await pool.end()
  })

  beforeEach(() => {
    clock = createTestClock(new Date())
    signIns = createPostgresSignInLimit(localSupabase().databaseUrl, clock)
    human = createScriptedHumanCheck()
    email = createRecordingEmail()
    current = serviceWith(supabaseAccounts)
    afterTheResponse.length = 0
  })

  afterEach(async () => {
    await signIns.close()
    vi.restoreAllMocks()
  })

  /** An Admin in the shape sign-up leaves one: their phone, and a confirmed address in lower case. */
  const anAccount = async (tier: 'admin' | 'leader' = 'admin', { confirmed = true } = {}) => {
    const account = await addPersonWithAccount(ministry, `Forgetful ${randomUUID().slice(0, 6)}`, tier)
    made.push(account.userId)
    const address = anAddress()
    const { error } = await serviceRoleClient().auth.admin.updateUserById(account.userId, {
      email: address,
      email_confirm: confirmed,
    })
    if (error) throw error
    return { ...account, email: address }
  }

  /** "Send me the link", through the route, and what it left for after the response, run. */
  const press = async (address: string, network = aNetworkAddress(), token = GOOD_TOKEN) => {
    const response = await askRoute(post('/login/forgot/ask', { email: address, humanToken: token }, network))
    const body = (await response.json()) as Record<string, unknown>
    const waiting = afterTheResponse.splice(0)
    for (const work of waiting) await work()
    return { status: response.status, body }
  }

  const tokenIn = (index = -1): string => {
    const token = /\/login\/forgot\/([A-Za-z0-9_-]{43})$/m.exec(email.delivered.at(index)?.text ?? '')?.[1]
    if (!token) throw new Error('That email held no link.')
    return token
  }

  /** A link asked for and emailed. */
  const aLink = async (address: string) => {
    await press(address)
    return tokenIn()
  }

  const saving = (token: string, password: string) =>
    saveRoute(post(`/login/forgot/${token}/save`, { password }), { params: Promise.resolve({ token }) })

  const whereItWent = (response: Response) => {
    const location = new URL(response.headers.get('location') ?? '')
    return `${location.pathname}${location.search}`
  }

  const signsIn = async (who: { phone: string }, password: string) => {
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ phone: who.phone, password })
    return error === null
  }

  const rowsFor = async (userId: string) =>
    (
      await pool.query<Record<string, unknown>>(`select * from password_reset_link where user_id = $1`, [userId])
    ).rows

  describe('a link', () => {
    it('sets the new password once, goes to /login with a notice, and signs nobody in', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)

      const response = await saving(token, NEW_PASSWORD)

      expect(response.status).toBe(303)
      expect(whereItWent(response)).toBe('/login?notice=password-changed')
      expect(response.headers.getSetCookie()).toEqual([])
      expect(await signsIn(admin, NEW_PASSWORD)).toBe(true)
      expect(await signsIn(admin, admin.password)).toBe(false)

      const second = await saving(token, `${NEW_PASSWORD} again`)
      expect(whereItWent(second)).toBe(`/login/forgot/${token}`)
      expect(await current.linkIsLive(token)).toBe(false)
      expect(await signsIn(admin, NEW_PASSWORD)).toBe(true)
    })

    it('does not work once its time is up, and does up to then', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)

      clock.advanceBy(PASSWORD_RESET_LINK_MINUTES * 60_000 - 1)
      expect(await current.linkIsLive(token)).toBe(true)

      clock.advanceBy(1)
      expect(await current.linkIsLive(token)).toBe(false)
      expect(whereItWent(await saving(token, NEW_PASSWORD))).toBe(`/login/forgot/${token}`)
      expect(await signsIn(admin, admin.password)).toBe(true)
    })

    it('ends every other session on the account', async () => {
      const admin = await anAccount()
      const held = await signInWith(admin)
      expect((await held.rpc('session_is_live')).data).toBe(true)

      await saving(await aLink(admin.email), NEW_PASSWORD)

      expect((await held.rpc('session_is_live')).data).toBe(false)
      expect((await held.auth.getUser()).data.user).toBeNull()
    })

    it('still works after being opened twice and pressed once', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)

      expect(await current.linkIsLive(token)).toBe(true)
      expect(await current.linkIsLive(token)).toBe(true)

      expect(whereItWent(await saving(token, NEW_PASSWORD))).toBe('/login?notice=password-changed')
      expect(await signsIn(admin, NEW_PASSWORD)).toBe(true)
    })

    it('stops working when a newer one is sent, and the newer one works', async () => {
      const admin = await anAccount()
      const older = await aLink(admin.email)
      const newer = await aLink(admin.email)

      expect(newer).not.toBe(older)
      expect(await current.linkIsLive(older)).toBe(false)
      expect(whereItWent(await saving(older, NEW_PASSWORD))).toBe(`/login/forgot/${older}`)
      expect(await signsIn(admin, admin.password)).toBe(true)

      expect(whereItWent(await saving(newer, NEW_PASSWORD))).toBe('/login?notice=password-changed')
      expect(await signsIn(admin, NEW_PASSWORD)).toBe(true)
    })

    it('makes a separate email each time, so Resend does not take the second for a retry', async () => {
      const admin = await anAccount()
      await aLink(admin.email)
      await aLink(admin.email)

      const keys = email.delivered.map((one) => one.idempotencyKey)
      expect(new Set(keys).size).toBe(2)
    })

    it('can be asked for again after one was used', async () => {
      const admin = await anAccount()
      await saving(await aLink(admin.email), NEW_PASSWORD)

      const again = await aLink(admin.email)

      expect(await current.linkIsLive(again)).toBe(true)
      expect(whereItWent(await saving(again, `${NEW_PASSWORD} two`))).toBe('/login?notice=password-changed')
    })

    it.each([
      ['a common one', COMMON_PASSWORD, 'account.password_too_common'],
      ['a short one', 'short', 'account.password_too_short'],
      ['an empty one', '', 'account.password_too_short'],
      ['one too long to store', 'x'.repeat(73), 'account.password_too_long'],
    ])('refuses %s, and stays live', async (_name, password, code) => {
      const admin = await anAccount()
      const token = await aLink(admin.email)

      expect(whereItWent(await saving(token, password))).toBe(`/login/forgot/${token}?error=${code}`)

      expect(await current.linkIsLive(token)).toBe(true)
      expect(await signsIn(admin, admin.password)).toBe(true)
      expect(whereItWent(await saving(token, NEW_PASSWORD))).toBe('/login?notice=password-changed')
    })

    it('says it is dead, rather than that a password is weak, once it is', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)
      await saving(token, NEW_PASSWORD)

      expect(whereItWent(await saving(token, COMMON_PASSWORD))).toBe(`/login/forgot/${token}`)
    })

    it('stays live when the password could not be set, for pressing again', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      current = serviceWith({
        setPassword: async () => {
          throw new Error('Supabase Auth did not answer')
        },
      })

      expect(whereItWent(await saving(token, NEW_PASSWORD))).toBe(`/login/forgot/${token}?error=forgot.not_saved`)
      expect(await current.linkIsLive(token)).toBe(true)

      current = serviceWith(supabaseAccounts)
      expect(whereItWent(await saving(token, NEW_PASSWORD))).toBe('/login?notice=password-changed')
    })

    it('lets one of two presses at the same instant through', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)

      const answers = await Promise.all([
        current.choose({ token, password: NEW_PASSWORD }),
        current.choose({ token, password: `${NEW_PASSWORD} other` }),
      ])

      expect(answers.filter((answer) => 'changed' in answer)).toHaveLength(1)
      expect(answers.filter((answer) => 'refusal' in answer && answer.refusal === 'forgot.link_dead')).toHaveLength(1)
    })

    it.each(['not-a-token', 'a'.repeat(43), '__proto__', ''])('reads %j as dead', async (token) => {
      expect(await current.linkIsLive(token)).toBe(false)
      expect(await current.choose({ token, password: NEW_PASSWORD })).toEqual({ refusal: 'forgot.link_dead' })
    })

    it('is kept only as a digest', async () => {
      const admin = await anAccount()
      const token = await aLink(admin.email)

      const [row] = await rowsFor(admin.userId)

      expect(JSON.stringify(row)).not.toContain(token)
      expect(row!.token_digest).toMatch(/^[0-9a-f]{64}$/)
    })

    it('goes with the account', async () => {
      const admin = await anAccount()
      await aLink(admin.email)

      const { error } = await serviceRoleClient().auth.admin.deleteUser(admin.userId)

      expect(error).toBeNull()
      expect(await rowsFor(admin.userId)).toEqual([])
    })
  })

  describe('asking', () => {
    it('sends the Admin the reset email, at the address their account holds', async () => {
      const admin = await anAccount()

      const answer = await press(admin.email.toUpperCase())

      expect(answer.status).toBe(200)
      expect(email.delivered).toHaveLength(1)
      expect(email.delivered[0]).toMatchObject({
        kind: 'passwordReset',
        to: [admin.email],
        subject: 'Reset your Discipler password',
      })
    })

    it('answers an address with an account and one without in the same words', async () => {
      const admin = await anAccount()
      const nobody = anAddress()

      const known = await press(admin.email)
      const unknown = await press(nobody)

      expect(known).toEqual({ status: 200, body: { sent: true, email: admin.email } })
      expect(unknown).toEqual({ status: 200, body: { sent: true, email: nobody } })
      expect(email.delivered).toHaveLength(1)
    })

    it('answers before the email leaves, and an address with an account takes no longer', async () => {
      const admin = await anAccount()
      // What a known address would add if the answer waited on Resend.
      email.takeThisLong(1000)
      const REQUESTS = 7

      const timed = async (address: string) => {
        const started = performance.now()
        await askRoute(post('/login/forgot/ask', { email: address, humanToken: GOOD_TOKEN }))
        const took = performance.now() - started
        // Past the hour each time, so the caps stay out of what is being timed.
        clock.advanceBy(61 * 60_000)
        return took
      }
      const median = (times: readonly number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!

      const known: number[] = []
      const unknown: number[] = []
      for (let i = 0; i < REQUESTS; i++) {
        unknown.push(await timed(anAddress()))
        known.push(await timed(admin.email))
      }

      expect(email.delivered).toHaveLength(0)
      expect(afterTheResponse).toHaveLength(REQUESTS * 2)
      expect(Math.abs(median(known) - median(unknown))).toBeLessThan(200)
    })

    it('sends a Leader\'s phone nothing, and says it is not an address', async () => {
      const leader = await addPersonWithAccount(ministry, 'Marcus Webb', 'leader')
      made.push(leader.userId)

      const answer = await press(leader.phone)

      expect(answer.status).toBe(422)
      expect(answer.body.refusal).toBe('forgot.bad_email')
      expect(email.delivered).toEqual([])
      expect(await rowsFor(leader.userId)).toEqual([])
      expect(human.asked).toEqual([])
    })

    it.each([
      ['a Leader', () => anAccount('leader')],
      ['an Admin whose address was never confirmed', () => anAccount('admin', { confirmed: false })],
    ])('sends %s nothing, and answers the same', async (_name, make) => {
      const account = await make()

      const answer = await press(account.email)

      expect(answer).toEqual({ status: 200, body: { sent: true, email: account.email } })
      expect(email.delivered).toEqual([])
      expect(await rowsFor(account.userId)).toEqual([])
    })

    it('sends an account with no Ministry nothing', async () => {
      const address = anAddress()
      const { data, error } = await serviceRoleClient().auth.admin.createUser({
        email: address,
        email_confirm: true,
        password: NEW_PASSWORD,
      })
      if (error) throw error
      made.push(data.user.id)

      expect((await press(address)).status).toBe(200)
      expect(email.delivered).toEqual([])
    })

    it('sends nothing for the sixth request for an address in an hour, and answers the same', async () => {
      const admin = await anAccount()
      for (let i = 0; i < EMAIL_CODE.perEmailPerHour; i++) await press(admin.email)
      expect(email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour)
      const lastLink = tokenIn()

      const sixth = await press(admin.email)

      expect(sixth).toEqual({ status: 200, body: { sent: true, email: admin.email } })
      expect(email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour)
      // It replaced nothing either: the last link sent is still the one that works.
      expect(await current.linkIsLive(lastLink)).toBe(true)

      clock.advanceBy(60 * 60_000)
      await press(admin.email)
      expect(email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour + 1)
    })

    it('reaches the cap the same way for an address nobody holds', async () => {
      const nobody = anAddress()
      const counted = () =>
        pool.query(`select count(*)::int as count from password_reset_request where requested_at = $1`, [clock.now()])

      for (let i = 0; i <= EMAIL_CODE.perEmailPerHour; i++) await press(nobody)

      expect((await counted()).rows[0].count).toBe(EMAIL_CODE.perEmailPerHour)
    })

    it('counts an address in any capitals as one', async () => {
      const admin = await anAccount()
      for (let i = 0; i < EMAIL_CODE.perEmailPerHour; i++) await press(admin.email)

      const local = admin.email.slice(0, admin.email.indexOf('@')).toUpperCase()
      await press(`${local}${admin.email.slice(admin.email.indexOf('@'))}`)

      expect(email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour)
    })

    it('sends nothing past the cap for one network, whichever addresses it asks about', async () => {
      const admin = await anAccount()
      const network = aNetworkAddress()
      for (let i = 0; i < EMAIL_CODE.perNetworkPerHour; i++) await press(anAddress(), network)

      const answer = await press(admin.email, network)

      expect(answer).toEqual({ status: 200, body: { sent: true, email: admin.email } })
      expect(email.delivered).toEqual([])

      await press(admin.email)
      expect(email.delivered).toHaveLength(1)
    })

    it('holds a burst to the cap, each request seeing the ones before it', async () => {
      const admin = await anAccount()

      await Promise.all(Array.from({ length: 12 }, () => press(admin.email)))

      expect(email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour)
    })

    it('is behind Cloudflare, for its own action, and a no costs nothing', async () => {
      const admin = await anAccount()

      const answer = await press(admin.email, aNetworkAddress(), 'a-token-cloudflare-refuses')

      expect(answer.status).toBe(403)
      expect(answer.body.refusal).toBe('forgot.not_human')
      expect(human.asked).toEqual([{ token: 'a-token-cloudflare-refuses', action: 'forgot_password' }])
      expect(email.delivered).toEqual([])
      expect(await rowsFor(admin.userId)).toEqual([])
    })

    it('spends no token on something that is not an address', async () => {
      const answer = await press('not an address')

      expect(answer.status).toBe(422)
      expect(answer.body).toMatchObject({
        refusal: 'forgot.bad_email',
        message: "That doesn't look like an email address. Please check it and try again.",
      })
      expect(human.asked).toEqual([])
    })

    it('still answers the same when the email does not go, and says so without its words', async () => {
      const admin = await anAccount()
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      email.failWith(Object.assign(new Error('Resend said something about the link'), { status: 500, name: 'Boom' }))

      const answer = await press(admin.email)

      expect(answer).toEqual({ status: 200, body: { sent: true, email: admin.email } })
      expect(logged).toHaveBeenCalledTimes(1)
      expect(String(logged.mock.calls[0]![0])).toMatch(/^A reset email for link [0-9a-f-]{36} did not go: Boom 500$/)
    })
  })

  describe('what is left behind', () => {
    it('logs no token anywhere, whatever happens, and the email holds no congregation data', async () => {
      const lines: string[] = []
      for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')))
      }
      const admin = await anAccount()

      const emailed = await aLink(admin.email)
      await saving(emailed, COMMON_PASSWORD)

      email.failWith(Object.assign(new Error('a request that held the link'), { status: 500 }))
      await press(admin.email)
      email.failWith(null)
      current = serviceWith({
        setPassword: async () => {
          throw new Error('Supabase Auth did not answer')
        },
      })
      const refused = tokenIn()
      await saving(refused, NEW_PASSWORD)
      current = serviceWith(supabaseAccounts)
      await saving(await aLink(admin.email), NEW_PASSWORD)

      const tokens = email.delivered.map((_, index) => tokenIn(index))
      expect(tokens.length).toBeGreaterThan(0)
      for (const token of tokens) expect(lines.join('\n')).not.toContain(token)

      const { rows } = await pool.query<{ full_name: string }>(`select full_name from person where user_id = $1`, [admin.userId])
      for (const envelope of email.delivered) {
        const everything = `${envelope.subject}\n${envelope.text}\n${envelope.html}`
        expect(everything).not.toContain(rows[0]!.full_name)
        expect(everything).not.toContain(ministry.name)
        expect(everything).not.toContain(admin.phone)
        expect(everything).not.toContain(admin.email)
      }
    })

    it('holds no address, no network and no token in the request table', async () => {
      const network = aNetworkAddress()
      const admin = await anAccount()
      await press(admin.email, network)

      const { rows } = await pool.query<Record<string, unknown>>(
        `select * from password_reset_request where requested_at = $1`,
        [clock.now()],
      )
      const held = JSON.stringify(rows)

      expect(rows.length).toBeGreaterThan(0)
      expect(held).not.toContain(admin.email)
      expect(held).not.toContain(network)
    })

    it('sweeps rows nothing will read again, when somebody next asks', async () => {
      const admin = await anAccount()
      const nobody = anAddress()
      await press(nobody)
      await aLink(admin.email)
      const askedAt = clock.now()

      clock.advanceBy(25 * 60 * 60_000)
      await press(anAddress())

      const { rows } = await pool.query<{ count: number }>(
        `select count(*)::int as count from password_reset_request where requested_at = $1`,
        [askedAt],
      )
      expect(rows[0]!.count).toBe(0)
      expect(await rowsFor(admin.userId)).toEqual([])
    })
  })

  describe('the guessing limit', () => {
    const lockOut = async (who: Parameters<PostgresSignInLimit['attempt']>[0]) => {
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
        expect(await signIns.attempt(who, aNetworkAddress())).not.toBeNull()
      }
      expect(await signIns.attempt(who, aNetworkAddress())).toBeNull()
    }

    it('lets somebody who locked themselves out by phone straight back in', async () => {
      const admin = await anAccount()
      await lockOut({ phone: admin.phone })

      await saving(await aLink(admin.email), NEW_PASSWORD)

      expect(await signIns.attempt({ phone: admin.phone }, aNetworkAddress())).not.toBeNull()
    })

    it('lets somebody who locked themselves out by email straight back in', async () => {
      const admin = await anAccount()
      await lockOut({ email: admin.email })

      await saving(await aLink(admin.email), NEW_PASSWORD)

      expect(await signIns.attempt({ email: admin.email }, aNetworkAddress())).not.toBeNull()
      expect(await signIns.attempt({ phone: admin.phone }, aNetworkAddress())).not.toBeNull()
    })

    it('clears what the change-your-password form counted as well', async () => {
      const admin = await anAccount()
      await lockOut({ userId: admin.userId })

      await saving(await aLink(admin.email), NEW_PASSWORD)

      expect(await signIns.attempt({ userId: admin.userId }, aNetworkAddress())).not.toBeNull()
    })

    it('clears nobody else\'s, and nothing until the reset goes through', async () => {
      const admin = await anAccount()
      const other = await anAccount()
      await lockOut({ phone: admin.phone })
      await lockOut({ phone: other.phone })

      const token = await aLink(admin.email)
      await saving(token, COMMON_PASSWORD)
      expect(await signIns.attempt({ phone: admin.phone }, aNetworkAddress())).toBeNull()

      await saving(token, NEW_PASSWORD)
      expect(await signIns.attempt({ phone: other.phone }, aNetworkAddress())).toBeNull()
    })

    it('still resets the password when the count could not be cleared', async () => {
      const admin = await anAccount()
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const token = await aLink(admin.email)
      const forgive = vi.spyOn(signIns, 'forgive').mockRejectedValue(new Error('no database'))

      expect(await current.choose({ token, password: NEW_PASSWORD })).toEqual({ changed: true })

      expect(forgive).toHaveBeenCalledWith(admin.userId)
      expect(logged).toHaveBeenCalledTimes(1)
      expect(await signsIn(admin, NEW_PASSWORD)).toBe(true)
    })
  })
})
