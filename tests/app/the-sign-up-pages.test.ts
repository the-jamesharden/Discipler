import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHORTEST_PASSWORD } from '~/domain/accounts'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '~/domain/consent'
import { EMAIL_CODE } from '~/domain/launch-terms'
import { HUMAN_PASS_LIFETIME_MINUTES } from '~/domain/sign-up-attempt'
import { isKnownTimezone } from '~/domain/week'
import type { SignUp } from '~/service/sign-up'
import { createInMemoryPendingSignups } from '../support/pending-signups-in-memory'
import { aNetworkAddress, anAddress, buildHarness, codeIn, notThe } from '../support/sign-up-scenarios'
import AccountPage, { generateMetadata as accountTitle } from '../../app/signup/account/page'
import { PlantQuestions } from '../../app/signup/account/plant-questions'
import CodePage, { generateMetadata as codeTitle } from '../../app/signup/code/page'
import { ALREADY_HAS_AN_ACCOUNT_SENTENCE, CREATE_AN_ACCOUNT, TEXTING_FINE_PRINT } from '../../app/signup/copy'
import EmailPage, { generateMetadata as emailTitle } from '../../app/signup/email/page'
import { canStartFreeTrial, stepAfterOpenRefusal } from '../../app/signup/flow'
import HumanCheckPage, { generateMetadata as humanCheckTitle } from '../../app/signup/page'
import { SIGN_UP_TIMEZONE_BEFORE_ASKING, signUpTimezones } from '../../app/timezones'

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

  // "Set up your account" is the one place a price appears, and is tested below.
  const beforeThePrice = standing.filter(([path]) => path !== '/signup/account')

  it.each(beforeThePrice)('%s shows no dollar amount', async (_path, arrive, page) => {
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

describe('"Set up your account"', () => {
  const NEXT = "Next, you'll add a card or bank account. You won't be charged today."

  /** Whichever option is drawn selected, by the words a person reads. */
  const selectedIn = (html: string, select: string): string | null => {
    const inSelect = new RegExp(`<select[^>]*id="${select}"[^>]*>(.*?)</select>`, 's').exec(html)?.[1] ?? ''
    return /<option[^>]* selected=""[^>]*>([^<]*)</.exec(inSelect)?.[1]?.replace(/&#x27;/g, "'") ?? null
  }

  it('asks in the mock-up\'s order, in the mock-up\'s words, with the attempt\'s address', async () => {
    const { address } = await atAccount()
    const html = await htmlOf(AccountPage)
    const words = wordsOf(html)

    expect(html).toContain('<h2 class="req-heading">Set up your account</h2>')
    expect(words).toContain('Step 2 of 3 Your account')
    expect(words).toContain('* indicates required information')

    const labels = [
      'Church or organization name *',
      'Full name *',
      'Where did you hear about us? (optional)',
      'Login email',
      'Choose a password (minimum 8 characters) *',
      'Use at least 8 characters.',
      'Timezone (optional)',
      'We picked this from your device. Check-ins go out in this timezone.',
      'Is your church a church plant? (optional)',
      'Church plants that launched in the last 3 years, or are launching in the next 12 months, can apply for a year of Discipler free.',
      'Yes, we are',
      'How would you like to pay? *',
      'Monthly',
      'Yearly Save 20%',
      // `wordsOf` leaves a space where a tag was, so the links' edges show here.
      'I agree to the Terms of Service and Privacy Policy . *',
      'Start free trial',
    ]
    const places = labels.map((label) => words.indexOf(label))
    expect(places.every((place) => place >= 0), JSON.stringify(labels.filter((label) => !words.includes(label)))).toBe(true)
    expect(places).toEqual([...places].sort((a, b) => a - b))

    const email = /<input[^>]*id="loginEmail"[^>]*>/.exec(html)![0]
    expect(email).toContain(`value="${address}"`)
    expect(email).toContain('readOnly=""')
    expect(email).toContain('class="locked"')
    expect(email, 'the attempt holds the address, so the form must not send one').not.toContain('name=')
  })

  it('offers where they heard about us with no help line, and nothing chosen', async () => {
    await atAccount()
    const html = await htmlOf(AccountPage)
    const select = /<select[^>]*id="heardFrom"[^>]*>(.*?)<\/select>/s.exec(html)![1]!

    expect(wordsOf(select)).toBe('Choose one Instagram Online (Google) A friend Another ministry Conferences Other media')
    expect(selectedIn(html, 'heardFrom')).toBe('Choose one')
    expect(html).not.toContain('Help us')
  })

  it('preselects Conferences for EXPO26, and Another ministry for a referral', async () => {
    await atAccount()

    expect(selectedIn(await htmlOf(AccountPage, { code: 'EXPO26' }), 'heardFrom')).toBe('Conferences')
    expect(selectedIn(await htmlOf(AccountPage, { ref: 'k7m2qp9x' }), 'heardFrom')).toBe('Another ministry')
    expect(selectedIn(await htmlOf(AccountPage, { code: 'EXPO26', ref: 'k7m2qp9x' }), 'heardFrom')).toBe('Conferences')
    expect(selectedIn(await htmlOf(AccountPage, { code: 'NOTACODE' }), 'heardFrom')).toBe('Choose one')
  })

  it('draws the timezones as the mock-up does, with Eastern Time showing before the device is asked', async () => {
    await atAccount()
    const html = await htmlOf(AccountPage)
    const select = /<select[^>]*id="timezone"[^>]*>(.*?)<\/select>/s.exec(html)![1]!

    expect([...select.matchAll(/<optgroup label="([^"]*)"/g)].map((match) => match[1])).toEqual(['United States', 'Other'])
    expect(wordsOf(select)).toBe(
      'Eastern Time (New York) Central Time (Chicago) Mountain Time (Denver) Mountain Time, no daylight saving (Phoenix) ' +
        'Pacific Time (Los Angeles) Alaska Time (Anchorage) Hawaii Time (Honolulu) ' +
        'Atlantic Time (Puerto Rico) Toronto London',
    )
    expect(selectedIn(html, 'timezone')).toBe('Eastern Time (New York)')
  })

  describe('the one place a price appears', () => {
    const WHILE_THE_OFFER_RUNS = new Date('2026-11-04T12:00:00Z')
    const AFTER_THE_OFFER = new Date('2026-12-12T12:00:00Z')

    /** The page's own clock, and none of the attempt's. */
    const pageOn = async (day: Date, params: Params) => {
      await atAccount()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(day)
      try {
        return wordsOf(await htmlOf(AccountPage, params))
      } finally {
        vi.useRealTimers()
      }
    }

    const NO_OFFER = {
      month: 'Monthly $97 a month',
      year: 'Yearly Save 20% $931.20 a year',
      under: `30 days free. ${NEXT}`,
    }

    it('holds the special offer for EXPO26, still valid', async () => {
      const words = await pageOn(WHILE_THE_OFFER_RUNS, { code: 'EXPO26' })

      expect(words).toContain('Monthly $97 a month, 20% off your first year')
      expect(words).toContain('Yearly Save 20% $931.20 a year, 20% off your first year')
      expect(words).toContain(`Start free trial 60 days free with the Exponential special offer. ${NEXT}`)
    })

    it.each([
      ['no code', WHILE_THE_OFFER_RUNS, {}],
      ['EXPO26 after it ended', AFTER_THE_OFFER, { code: 'EXPO26' }],
      ['a code that means nothing', WHILE_THE_OFFER_RUNS, { code: 'NOTACODE' }],
      ['a referral', WHILE_THE_OFFER_RUNS, { ref: 'k7m2qp9x' }],
    ] as const)('holds the plain price for %s', async (_arrived, day, params) => {
      const words = await pageOn(day, params)

      expect(words).toContain(NO_OFFER.month)
      expect(words).toContain(NO_OFFER.year)
      expect(words).toContain(`Start free trial ${NO_OFFER.under}`)
      expect(words).not.toContain('off your first year')
      expect(words).not.toContain('special offer')
    })

    it('is read from the launch terms, never typed', () => {
      const source = readFileSync(fileURLToPath(new URL('../../app/signup/copy.ts', import.meta.url)), 'utf8')
      expect(source).not.toMatch(/\$97|931\.20|60 days|30 days|20%/)
    })

    it('starts on Monthly', async () => {
      await atAccount()
      const html = await htmlOf(AccountPage)

      expect(/<input[^>]*value="month"[^>]*>/.exec(html)![0]).toContain('checked=""')
      expect(/<input[^>]*value="year"[^>]*>/.exec(html)![0]).not.toContain('checked=""')
    })
  })

  it('links the two agreements, in a new tab, and leaves the box unticked', async () => {
    await atAccount()
    const html = await htmlOf(AccountPage)

    expect(html).toContain(`<a href="${TERMS_OF_SERVICE_URL}" target="_blank" rel="noopener noreferrer">Terms of Service</a>`)
    expect(html).toContain(`<a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>`)
    expect(/<input[^>]*name="agreedToTerms"[^>]*>/.exec(html)![0]).not.toContain('checked=""')
  })

  it('starts with the button off, and holds nothing that belongs to a later ticket', async () => {
    await atAccount()
    const html = await htmlOf(AccountPage)
    const words = wordsOf(html)

    expect(/<button[^>]*type="submit"[^>]*>/.exec(html)![0]).toContain('disabled=""')
    expect(words).not.toContain('know we joined')
    expect(words).not.toContain("isn't open yet")
  })

  describe('the church-plant questions', () => {
    const answers = {
      launchDate: 'September 2025',
      sendingChurch: 'First Baptist',
      averageAttendance: '120',
      leadPastor: 'Dan Whitfield',
      anythingElse: '',
    }
    const silently = () => {}
    const drawn = (isPlant: boolean) =>
      renderToStaticMarkup(
        createElement(PlantQuestions, {
          isPlant,
          onIsPlant: silently,
          answers,
          onAnswer: {
            launchDate: silently,
            sendingChurch: silently,
            averageAttendance: silently,
            leadPastor: silently,
            anythingElse: silently,
          },
          refusedField: null,
          refusalFor: () => null,
          describedBy: () => undefined,
        }),
      )

    it('preselects No, and draws no application behind it', async () => {
      await atAccount()
      const html = await htmlOf(AccountPage)

      expect(/<input[^>]*value="no"[^>]*>/.exec(html)![0]).toContain('checked=""')
      expect(/<input[^>]*value="yes"[^>]*>/.exec(html)![0]).not.toContain('checked')
      expect(html).not.toContain('plant-app')
      expect(wordsOf(html)).not.toContain('Lead pastor')
    })

    it('opens the application behind Yes, in the mock-up\'s order and words', () => {
      const html = drawn(true)
      const words = wordsOf(html)

      const labels = [
        'Launch date, or planned launch date *',
        'Sending or partner church *',
        'Average weekly attendance *',
        'Lead pastor *',
        "Anything else you'd like us to know? (optional)",
        'James or Lerone will follow up by email. Your trial starts either way, and your free year begins once your application is approved.',
      ]
      const places = labels.map((label) => words.indexOf(label))
      expect(places.every((place) => place >= 0), JSON.stringify(labels.filter((label) => !words.includes(label)))).toBe(true)
      expect(places).toEqual([...places].sort((a, b) => a - b))

      expect(html).toContain('placeholder="For example, September 2025"')
      expect(html).toContain('inputMode="numeric"')
    })

    it('sits between the timezone and how to pay', async () => {
      await atAccount()
      const words = wordsOf(await htmlOf(AccountPage))

      expect(words.indexOf('Check-ins go out in this timezone.')).toBeLessThan(words.indexOf('Is your church a church plant?'))
      expect(words.indexOf('Is your church a church plant?')).toBeLessThan(words.indexOf('How would you like to pay?'))
    })
  })

  describe('whether the button is on', () => {
    const filled = { churchName: 'Grace Church', fullName: 'Dan Whitfield', password: 'grace shepherds 1', agreedToTerms: true }

    it('is on when every required field holds a real entry', () => {
      expect(canStartFreeTrial(filled, SHORTEST_PASSWORD)).toBe(true)
    })

    it.each([
      ['no church name', { churchName: '' }],
      ['a church name of nothing but spaces', { churchName: '   ' }],
      ['no full name', { fullName: '' }],
      ['a full name of nothing but spaces', { fullName: ' \t ' }],
      ['no password', { password: '' }],
      ['a short password', { password: 'x'.repeat(SHORTEST_PASSWORD - 1) }],
      ['the box unticked', { agreedToTerms: false }],
    ])('is off with %s', (_why, change) => {
      expect(canStartFreeTrial({ ...filled, ...change }, SHORTEST_PASSWORD)).toBe(false)
    })

    describe('while "Yes, we are" is chosen', () => {
      const plant = {
        launchDate: 'September 2025',
        sendingChurch: 'First Baptist',
        averageAttendance: '120',
        leadPastor: 'Dan Whitfield',
      }

      it('is on with all four answers', () => {
        expect(canStartFreeTrial({ ...filled, plant }, SHORTEST_PASSWORD)).toBe(true)
      })

      it.each(['launchDate', 'sendingChurch', 'averageAttendance', 'leadPastor'])('is off with %s empty or only spaces', (answer) => {
        expect(canStartFreeTrial({ ...filled, plant: { ...plant, [answer]: '' } }, SHORTEST_PASSWORD)).toBe(false)
        expect(canStartFreeTrial({ ...filled, plant: { ...plant, [answer]: '  ' } }, SHORTEST_PASSWORD)).toBe(false)
      })

      it('asks for none of them behind No', () => {
        expect(canStartFreeTrial({ ...filled, plant: null }, SHORTEST_PASSWORD)).toBe(true)
      })
    })

    it('takes a password of exactly the shortest length, spaces and all', () => {
      expect(canStartFreeTrial({ ...filled, password: ' '.repeat(SHORTEST_PASSWORD) }, SHORTEST_PASSWORD)).toBe(true)
    })
  })

  describe('the timezone choices', () => {
    it('adds the device\'s zone to Other when it is on neither list', () => {
      const groups = signUpTimezones('Asia/Kolkata')
      expect(groups.at(-1)!.zones.at(-1)).toEqual({ value: 'Asia/Kolkata', label: 'Asia/Kolkata' })
      expect(signUpTimezones('America/Indiana/Indianapolis').at(-1)!.zones.at(-1)!.value).toBe('America/Indiana/Indianapolis')
    })

    it('adds nothing for a zone already offered, or for none', () => {
      const plain = signUpTimezones(null)
      expect(signUpTimezones('America/Chicago')).toEqual(plain)
      expect(signUpTimezones('Europe/London')).toEqual(plain)
    })

    it('offers only zones the server reads, and Eastern before the device is asked', () => {
      const zones = signUpTimezones(null).flatMap((group) => group.zones.map((zone) => zone.value))
      expect(zones.every(isKnownTimezone)).toBe(true)
      expect(zones[0]).toBe(SIGN_UP_TIMEZONE_BEFORE_ASKING)
    })
  })

  describe('reading a refused answer', () => {
    it('sends a lapsed proof to page one', () => {
      expect(stepAfterOpenRefusal('signup.not_verified')).toEqual({ step: 'human_check', again: true })
      expect(stepAfterOpenRefusal('account.already_exists')).toBeNull()
      expect(stepAfterOpenRefusal(null)).toBeNull()
    })

    it('words the taken account as the draft says', () => {
      expect(ALREADY_HAS_AN_ACCOUNT_SENTENCE).toBe(
        'That phone number or email already has a Discipler account. Sign in, or start again with a different one.',
      )
    })
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
