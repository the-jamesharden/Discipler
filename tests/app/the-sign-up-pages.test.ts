import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMAIL_CODE } from '~/domain/launch-terms'
import { HUMAN_PASS_LIFETIME_MINUTES } from '~/domain/sign-up-attempt'
import type { SignUp } from '~/service/sign-up'
import { createInMemoryPendingSignups } from '../support/pending-signups-in-memory'
import { aNetworkAddress, anAddress, buildHarness, codeIn, notThe } from '../support/sign-up-scenarios'
import AccountPage, { generateMetadata as accountTitle } from '../../app/signup/account/page'
import CodePage, { generateMetadata as codeTitle } from '../../app/signup/code/page'
import { CREATE_AN_ACCOUNT, TEXTING_FINE_PRINT } from '../../app/signup/copy'
import EmailPage, { generateMetadata as emailTitle } from '../../app/signup/email/page'
import HumanCheckPage, { generateMetadata as humanCheckTitle } from '../../app/signup/page'

/**
 * Sign-up's pages (Exponential launch, tickets 15 and 16), rendered as the server
 * renders them, with the real service on an in-memory store behind them. That a built
 * server keeps them shut is `tests/integration/sign-up-is-shut-over-http.test.ts`.
 */

let current: SignUp | null = null
let cookie: string | undefined

vi.mock('~/service/container', () => ({
  getSignUp: () => {
    if (!current) throw new Error('A sign-up page reached the service while it should have been shut.')
    return current
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'discipler_signup_attempt' && cookie !== undefined ? { name, value: cookie } : undefined,
  }),
}))

type Params = Record<string, string>
type Page = (props: { searchParams: Promise<Params> }) => Promise<ReactElement>

const PAGES: readonly (readonly [string, Page])[] = [
  ['/signup', HumanCheckPage],
  ['/signup/email', EmailPage],
  ['/signup/code', CodePage],
  ['/signup/account', AccountPage],
]

/** What a browser would get: a page, a redirect or a 404. */
const open = async (
  page: Page,
  params: Params = {},
): Promise<{ html: string } | { redirect: string } | { notFound: true }> => {
  try {
    return { html: renderToStaticMarkup(await page({ searchParams: Promise.resolve(params) })) }
  } catch (error) {
    const digest = String((error as { digest?: unknown }).digest ?? '')
    if (digest.startsWith('NEXT_REDIRECT')) return { redirect: digest.split(';')[2]! }
    if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404')) return { notFound: true }
    throw error
  }
}

const htmlOf = async (page: Page, params: Params = {}): Promise<string> => {
  const answer = await open(page, params)
  if (!('html' in answer)) throw new Error(`Expected a page, got ${JSON.stringify(answer)}`)
  return answer.html
}

/** The words on the page, entities undone, as somebody reads them. */
const wordsOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const US_PHONE = '+12055550100'

let h: ReturnType<typeof buildHarness>

beforeEach(() => {
  h = buildHarness(createInMemoryPendingSignups())
  current = h.signUp
  cookie = undefined
  vi.stubEnv('SIGN_UP_OPEN', 'true')
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'a-site-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const atEmailAndPhone = async () => {
  cookie = await h.attempt()
}

const atCode = async (address = anAddress()) => {
  const { token, code } = await h.attemptWithCode(address)
  cookie = token
  return { token, code, address }
}

const atAccount = async () => {
  const { token, code, address } = await atCode()
  await h.signUp.confirmCode({ attempt: token, typed: code })
  return { token, address }
}

describe('while sign-up is shut', () => {
  it.each(PAGES)('%s is a 404 and never reaches the service', async (_path, page) => {
    vi.stubEnv('SIGN_UP_OPEN', '')
    current = null

    expect(await open(page)).toEqual({ notFound: true })
    expect(await open(page, { code: 'EXPO26' })).toEqual({ notFound: true })
  })

  it('holds a live attempt out too, and page one asked to go again', async () => {
    await atAccount()
    vi.stubEnv('SIGN_UP_OPEN', 'false')
    current = null

    for (const [, page] of PAGES) expect(await open(page)).toEqual({ notFound: true })
    expect(await open(HumanCheckPage, { again: '1' })).toEqual({ notFound: true })
  })
})

describe('the title in the head', () => {
  const titles = [humanCheckTitle, emailTitle, codeTitle, accountTitle]

  it('says nothing while sign-up is shut, because the 404 wears it too', () => {
    vi.stubEnv('SIGN_UP_OPEN', '')

    for (const title of titles) expect(title()).toEqual({})
  })

  it('is the mock-up’s while it is open', () => {
    expect(titles.map((title) => title().title)).toEqual([
      'Start your free trial',
      'Start your free trial',
      'Check your email',
      'Set up your account',
    ])
  })
})

describe('which page a visitor belongs on', () => {
  const arrive = {
    '/signup': async () => {},
    '/signup/email': atEmailAndPhone,
    '/signup/code': async () => {
      await atCode()
    },
    '/signup/account': async () => {
      await atAccount()
    },
  } as const

  const here = (path: keyof typeof arrive) => PAGES.filter(([other]) => other !== path)

  describe.each(Object.keys(arrive) as (keyof typeof arrive)[])('standing at %s', (path) => {
    it.each(here(path))('%s sends them there, with what the address carried', async (_other, page) => {
      await arrive[path]()

      expect(await open(page)).toEqual({ redirect: path })
      expect(await open(page, { code: 'EXPO26' })).toEqual({ redirect: `${path}?code=EXPO26` })
    })

    it('its own page opens', async () => {
      await arrive[path]()
      const [, own] = PAGES.find(([other]) => other === path)!

      expect(await open(own)).toHaveProperty('html')
    })
  })

  it('sends a pass that has lapsed back to page one', async () => {
    await atEmailAndPhone()
    h.clock.advanceBy(HUMAN_PASS_LIFETIME_MINUTES * 60_000)

    expect(await open(EmailPage)).toEqual({ redirect: '/signup' })
  })

  it('lets somebody with an attempt go through page one again, for another address', async () => {
    await atCode()

    expect(await open(HumanCheckPage, { again: '1' })).toHaveProperty('html')
  })
})

describe('every page', () => {
  const standing = [
    ['/signup', async () => {}, HumanCheckPage],
    ['/signup/email', atEmailAndPhone, EmailPage],
    ['/signup/code', () => atCode(), CodePage],
    ['/signup/account', atAccount, AccountPage],
  ] as const

  it.each(standing)('%s is subtitled "Create an account"', async (_path, arrive, page) => {
    expect(CREATE_AN_ACCOUNT).toBe('Create an account')
    await arrive()

    expect(await htmlOf(page)).toContain('<p class="sub">Create an account</p>')
  })

  it.each(standing)('%s shows no dollar amount', async (_path, arrive, page) => {
    await arrive()

    expect(wordsOf(await htmlOf(page))).not.toContain('$')
  })
})

describe('the human check, page one', () => {
  it('has no explanatory line, only the widget and the way to sign in', async () => {
    const html = await htmlOf(HumanCheckPage)

    expect(wordsOf(html)).toBe('Discipler Create an account Already have an account? Sign in')
    expect(html).toContain('href="/login"')
    expect(html).not.toContain('class="progress"')
  })

  it('says it cannot go on when no site key is set, rather than drawing an empty box', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')

    expect(wordsOf(await htmlOf(HumanCheckPage))).toContain("We couldn't confirm you're a real person.")
  })
})

describe('email and phone, page two', () => {
  it('asks for both, with the fine print word for word directly under the phone field', async () => {
    await atEmailAndPhone()
    const html = await htmlOf(EmailPage)
    const words = wordsOf(html)

    expect(words).toContain('Step 1 of 3 Your email')
    expect(words).toContain('Email * This will be your login email.')
    expect(words).toContain(`Mobile phone * ${TEXTING_FINE_PRINT}`)
    expect(words).toContain('Email me a code')
    expect(words).toContain('Already have an account? Sign in')
    expect(html).toContain('type="email"')
    expect(html).toContain('type="tel"')
    expect(html).toMatch(/<input[^>]*type="tel"[^>]*\/><p class="fine"/)
  })

  it('offers an address a failed send left behind, so it need not be typed again', async () => {
    const address = anAddress()
    cookie = await h.attempt()
    h.email.failWith(new Error('Resend is down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await h.signUp.sendCode({ attempt: cookie, email: address, phone: US_PHONE, network: aNetworkAddress() })

    expect(await htmlOf(EmailPage)).toContain(`value="${address}"`)
  })
})

describe('the fine print', () => {
  it('is the sentence the spec, the privacy policy and the opt-in page all quote', () => {
    expect(TEXTING_FINE_PRINT).toBe(
      'By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
    for (const quoted of ['docs/legal/privacy-policy.md', 'docs/legal/sms-opt-in-sign-up-section.md']) {
      const doc = readFileSync(fileURLToPath(new URL(`../../${quoted}`, import.meta.url)), 'utf8')
      expect(doc).toContain(TEXTING_FINE_PRINT)
    }
  })
})

describe('the code, page three', () => {
  it('names the address, in the mock-up’s words, with one box', async () => {
    const { address } = await atCode()
    const html = await htmlOf(CodePage)
    const words = wordsOf(html)

    expect(words).toContain('Step 1 of 3 Check your email')
    expect(words).toContain(
      `We sent a ${EMAIL_CODE.digits}-digit code to ${address} . Please enter it below. It works for ${EMAIL_CODE.lifetimeMinutes} minutes.`,
    )
    expect(html).toContain(`<strong>${address}</strong>`)
    expect(words).toContain('Your code')
    expect(words).toContain('Continue')
    expect(words).toContain(
      "Can't find it? Please check your spam or promotions folder. The email comes from notify.trydiscipler.com.",
    )
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).toMatch(/autocomplete="one-time-code"/i)
    expect(html).toMatch(/inputmode="numeric"/i)
  })

  it('takes "Use a different email" through page one, keeping what the address carried', async () => {
    await atCode()

    expect(await htmlOf(CodePage)).toContain('href="/signup?again=1"')
    expect(await htmlOf(CodePage, { code: 'EXPO26' })).toContain('href="/signup?again=1&amp;code=EXPO26"')
  })

  it('counts down to a new code, and only then offers one', async () => {
    await atCode()

    const waiting = await htmlOf(CodePage)
    expect(wordsOf(waiting)).toContain('Send a new code in 1:00')
    expect(waiting).not.toContain('<button type="button"')

    h.clock.advanceBy(18_000)
    expect(wordsOf(await htmlOf(CodePage))).toContain('Send a new code in 0:42')

    h.clock.advanceBy(42_000)
    const ready = await htmlOf(CodePage)
    expect(wordsOf(ready)).not.toContain('Send a new code in')
    expect(ready).toMatch(/<button type="button"[^>]*>Send a new code<\/button>/)
  })

  it('says an expired code has expired, and offers a new one', async () => {
    await atCode()
    h.clock.advanceBy(EMAIL_CODE.lifetimeMinutes * 60_000)

    const html = await htmlOf(CodePage)
    expect(wordsOf(html)).toContain('That code has expired. Please ask for a new one.')
    expect(html).toMatch(/<button type="button"[^>]*>Send a new code<\/button>/)
  })

  it('says when the tries are used, refuses the right code, and a new one can be asked for', async () => {
    const { token, code } = await atCode()
    for (let i = 0; i < EMAIL_CODE.tries; i++) {
      await h.signUp.confirmCode({ attempt: token, typed: notThe(code) })
    }

    expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toEqual({
      refusal: 'signup.too_many_tries',
    })
    h.clock.advanceBy(EMAIL_CODE.resendAfterSeconds * 1000)

    const html = await htmlOf(CodePage)
    expect(wordsOf(html)).toContain('That was too many tries, so this code has stopped working.')
    expect(html).toMatch(/<button type="button"[^>]*>Send a new code<\/button>/)

    const resent = await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })
    expect(resent).toMatchObject({ sent: expect.any(String) })
    const fresh = codeIn(h.email.delivered.at(-1))
    expect(await h.signUp.confirmCode({ attempt: token, typed: fresh })).toMatchObject({ verified: expect.any(String) })
  })

  it('says nothing is wrong while the code is live', async () => {
    await atCode()

    expect(await htmlOf(CodePage)).not.toContain('field-error')
  })
})

describe('after the email is verified, the stopping point until ticket 17', () => {
  it('says the email is confirmed and offers nothing that goes nowhere', async () => {
    const { address } = await atAccount()
    const html = await htmlOf(AccountPage)

    expect(wordsOf(html)).toContain(`Your email is confirmed: ${address} .`)
    expect(wordsOf(html)).toContain('Step 2 of 3 Your account')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('<button')
  })
})

describe('what the address carries', () => {
  it('keeps a referral code and EXPO26 from page to page, both of them', async () => {
    await atEmailAndPhone()

    expect(await open(HumanCheckPage, { code: 'EXPO26', ref: 'k7m2qp9x' })).toEqual({
      redirect: '/signup/email?code=EXPO26&ref=k7m2qp9x',
    })
  })

  it('carries nothing that could not be a code, and nothing else at all', async () => {
    await atEmailAndPhone()

    expect(await open(HumanCheckPage, { code: '"><script>', ref: '', utm_source: 'flyer' })).toEqual({
      redirect: '/signup/email',
    })
  })
})
