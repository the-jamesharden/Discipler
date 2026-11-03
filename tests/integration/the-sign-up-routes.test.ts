import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMAIL_CODE } from '~/domain/launch-terms'
import { createPostgresPendingSignups, type PostgresPendingSignups } from '~/platform/supabase/pending-signups'
import type { SignUp } from '~/service/sign-up'
import { POST as confirmCode } from '../../app/signup/confirm-code/route'
import { POST as humanCheck } from '../../app/signup/human-check/route'
import { POST as resendCode } from '../../app/signup/resend-code/route'
import { POST as sendCode } from '../../app/signup/send-code/route'
import { SIGN_UP_ATTEMPT_COOKIE } from '../../app/signup/attempt-cookie'
import { localSupabase } from '../support/local-supabase'
import { aNetworkAddress as aNetwork, anAddress, buildHarness, codeIn, GOOD_TOKEN, notThe } from '../support/sign-up-scenarios'

/**
 * Sign-up's routes, in process, with the real tables behind them and Cloudflare and
 * Resend as fakes at their ports (Exponential launch, ticket 11). In process because a
 * built server has neither fake to reach for and must not call either vendor; that a
 * built server is shut is `sign-up-is-shut-over-http.test.ts`.
 */

let current: SignUp | null = null

vi.mock('~/service/container', () => ({
  getSignUp: () => {
    if (!current) throw new Error('The sign-up routes reached the service while it should have been shut.')
    return current
  },
}))

const US_PHONE = '+12055550100'

let store: PostgresPendingSignups
let pool: pg.Pool
let h: ReturnType<typeof buildHarness>
const givenAccounts: string[] = []

const giveAccount = async (email: string) => {
  givenAccounts.push(email)
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1)`,
    [email],
  )
}

const post = (
  path: string,
  fields: Record<string, string> = {},
  { attempt, network, origin = 'http://127.0.0.1:3211' }: { attempt?: string; network?: string; origin?: string } = {},
) =>
  new NextRequest(`${origin}${path}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(attempt ? { cookie: `${SIGN_UP_ATTEMPT_COOKIE}=${attempt}` } : {}),
      ...(network ? { 'x-forwarded-for': network } : {}),
    },
  })

const attemptFromCookie = (response: Response): string => {
  const cookie = response.headers.getSetCookie().find((line) => line.startsWith(`${SIGN_UP_ATTEMPT_COOKIE}=`))
  if (!cookie) throw new Error('No attempt cookie was set.')
  return cookie.slice(SIGN_UP_ATTEMPT_COOKIE.length + 1).split(';')[0]!
}

const passTheCheck = async () =>
  attemptFromCookie(await humanCheck(post('/signup/human-check', { token: GOOD_TOKEN })))

beforeAll(() => {
  pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  store = createPostgresPendingSignups(localSupabase().databaseUrl)
})

afterAll(async () => {
  await pool.query(`delete from auth.users where email = any($1)`, [givenAccounts])
  await store.close()
  await pool.end()
})

beforeEach(() => {
  h = buildHarness({ store, giveAccount })
  current = h.signUp
  vi.stubEnv('SIGN_UP_OPEN', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('while sign-up is shut', () => {
  it('every route answers 404, sets nothing, and never reaches the service', async () => {
    vi.stubEnv('SIGN_UP_OPEN', '')
    current = null

    for (const route of [humanCheck, sendCode, resendCode, confirmCode]) {
      const response = await route(post('/signup/x', { token: GOOD_TOKEN, email: anAddress(), phone: US_PHONE }))
      expect(response.status).toBe(404)
      expect(response.headers.getSetCookie()).toEqual([])
      expect(await response.text()).toBe('')
    }
  })
})

describe('the attempt’s cookie', () => {
  it('is httpOnly, SameSite=Lax, and held to /signup', async () => {
    const response = await humanCheck(post('/signup/human-check', { token: GOOD_TOKEN }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ passed: true })
    const [cookie] = response.headers.getSetCookie()
    expect(cookie).toMatch(/; HttpOnly/i)
    expect(cookie).toMatch(/; SameSite=lax/i)
    expect(cookie).toMatch(/; Path=\/signup/i)
    expect(cookie).not.toMatch(/; Secure/i)
  })

  it('is Secure over https', async () => {
    const response = await humanCheck(
      post('/signup/human-check', { token: GOOD_TOKEN }, { origin: 'https://app.trydiscipler.com' }),
    )
    expect(response.headers.getSetCookie()[0]).toMatch(/; Secure/i)
  })

  it('is not set for a token Cloudflare refuses', async () => {
    const response = await humanCheck(post('/signup/human-check', { token: 'a-forged-token' }))

    expect(response.status).toBe(403)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await response.json()).toMatchObject({ refusal: 'signup.not_human' })
  })
})

describe('the whole of it through the routes', () => {
  it('passes the check, sends a code, and proves the address', async () => {
    const attempt = await passTheCheck()
    const address = anAddress()

    const sent = await sendCode(post('/signup/send-code', { email: address, phone: US_PHONE }, { attempt, network: aNetwork() }))
    expect(sent.status).toBe(200)
    expect(await sent.json()).toEqual({ sent: true, email: address, resendInSeconds: EMAIL_CODE.resendAfterSeconds })

    const code = codeIn(h.email.delivered[0])
    const verified = await confirmCode(post('/signup/confirm-code', { code }, { attempt }))
    expect(verified.status).toBe(200)
    expect(await verified.json()).toEqual({ verified: true, email: address })
  })

  it('binds the code to the cookie: another browser’s cookie, or none, proves nothing', async () => {
    const attempt = await passTheCheck()
    await sendCode(post('/signup/send-code', { email: anAddress(), phone: US_PHONE }, { attempt, network: aNetwork() }))
    const code = codeIn(h.email.delivered[0])

    const stranger = await passTheCheck()
    const fromStranger = await confirmCode(post('/signup/confirm-code', { code }, { attempt: stranger }))
    expect(fromStranger.status).toBe(409)
    expect(await fromStranger.json()).toMatchObject({ refusal: 'signup.no_code' })

    const noCookie = await confirmCode(post('/signup/confirm-code', { code }))
    expect(noCookie.status).toBe(409)
    expect(await noCookie.json()).toMatchObject({ refusal: 'signup.human_check_needed' })
  })

  it('takes a code only from the body, never the address', async () => {
    const attempt = await passTheCheck()
    await sendCode(post('/signup/send-code', { email: anAddress(), phone: US_PHONE }, { attempt, network: aNetwork() }))
    const code = codeIn(h.email.delivered[0])

    const response = await confirmCode(post(`/signup/confirm-code?code=${code}`, {}, { attempt }))

    expect(await response.json()).toMatchObject({ refusal: 'signup.malformed_code' })
  })

  it('says how many tries are left in the mock-up’s words', async () => {
    const attempt = await passTheCheck()
    await sendCode(post('/signup/send-code', { email: anAddress(), phone: US_PHONE }, { attempt, network: aNetwork() }))
    const code = codeIn(h.email.delivered[0])

    const response = await confirmCode(post('/signup/confirm-code', { code: notThe(code) }, { attempt }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      refusal: 'signup.wrong_code',
      triesLeft: 4,
      message: "That code doesn't match. Please check your email and try again. You have 4 tries left.",
    })
  })

  it('resends to the address on the attempt, and says when it is too soon', async () => {
    const attempt = await passTheCheck()
    const address = anAddress()
    await sendCode(post('/signup/send-code', { email: address, phone: US_PHONE }, { attempt, network: aNetwork() }))

    const tooSoon = await resendCode(post('/signup/resend-code', {}, { attempt, network: aNetwork() }))
    expect(tooSoon.status).toBe(429)
    expect(await tooSoon.json()).toMatchObject({
      refusal: 'signup.resend_too_soon',
      resendInSeconds: EMAIL_CODE.resendAfterSeconds,
    })

    h.clock.advanceBy(EMAIL_CODE.resendAfterSeconds * 1000)
    const resent = await resendCode(post('/signup/resend-code', {}, { attempt, network: aNetwork() }))
    expect(await resent.json()).toEqual({ sent: true, email: address, resendInSeconds: EMAIL_CODE.resendAfterSeconds })
    expect(h.email.delivered[1]!.to).toEqual([address])
  })

  it('counts the network the request came from', async () => {
    const network = aNetwork()
    for (let i = 0; i < EMAIL_CODE.perNetworkPerHour; i++) {
      const attempt = await passTheCheck()
      const answer = await sendCode(post('/signup/send-code', { email: anAddress(), phone: US_PHONE }, { attempt, network }))
      expect(answer.status).toBe(200)
    }

    const attempt = await passTheCheck()
    const capped = await sendCode(post('/signup/send-code', { email: anAddress(), phone: US_PHONE }, { attempt, network }))
    expect(capped.status).toBe(429)
    expect(await capped.json()).toMatchObject({ refusal: 'signup.too_many_codes' })
  }, 30_000)
})

describe('the two answers to "send me a code", as a browser sees them', () => {
  const answerTo = async (address: string) => {
    const attempt = await passTheCheck()
    const response = await sendCode(
      post('/signup/send-code', { email: address, phone: US_PHONE }, { attempt, network: aNetwork() }),
    )
    return {
      status: response.status,
      setsCookies: response.headers.getSetCookie(),
      headers: [...response.headers.keys()].sort(),
      body: (await response.text()).replace(address, '<the address>'),
    }
  }

  it('look the same whether or not the address has an account', async () => {
    const taken = anAddress()
    await giveAccount(taken)

    const forTaken = await answerTo(taken)
    const forFree = await answerTo(anAddress())

    expect(forTaken).toEqual(forFree)
    expect(forTaken.status).toBe(200)
    expect(h.email.delivered.map((envelope) => envelope.kind)).toEqual(['signUpAttemptNotice', 'emailCode'])
  })
})
