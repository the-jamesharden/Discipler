import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signInFailureMessage } from '../../app/login/failures'
import LoginPage from '../../app/login/page'

/**
 * The sign-in page as the server renders it (Exponential launch, ticket 21). A built
 * server runs with sign-up shut, so that side is also in
 * `tests/integration/sign-up-is-shut-over-http.test.ts`, and signing in through it is
 * `tests/integration/signing-in-with-email-or-phone-over-http.test.ts`.
 */

const htmlOf = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }))

/** The words on the page, entities undone, as somebody reads them. */
const wordsOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the form', () => {
  it('is a plain post, so it works before any JavaScript has loaded', async () => {
    expect(await htmlOf()).toContain('<form action="/auth/sign-in" method="post">')
  })

  it('asks for "Email or phone", in a box a password manager knows, and a password', async () => {
    const html = await htmlOf()

    expect(html).toMatch(/<label[^>]*for="login"[^>]*>Email or phone<\/label>/)
    expect(html).toMatch(/<input[^>]*name="login"[^>]*type="text"|<input[^>]*type="text"[^>]*name="login"/)
    expect(html).toContain('autoComplete="username"')
    expect(html).toContain('name="password"')
    expect(html).not.toContain('name="phone"')
    expect(wordsOf(html)).not.toContain('Phone number')
  })

  it('draws "Sign in" as the plain button, full width', async () => {
    expect(await htmlOf()).toMatch(/<button type="submit" class="full sec">Sign in<\/button>/)
  })

  it('carries the note, word for word', async () => {
    expect(wordsOf(await htmlOf())).toContain(
      "People being discipled have no account and no dashboard. They take part entirely over text. Leaders who sign in with a phone number: if you've forgotten your password, ask whoever runs Discipler at your church to reset it.",
    )
  })
})

describe('"Create an account"', () => {
  it('opens sign-up, after the form and before the note, while sign-up is open', async () => {
    vi.stubEnv('SIGN_UP_OPEN', 'true')
    const html = await htmlOf()

    expect(html).toContain('<a class="btn full" href="/signup">Create an account</a>')

    const words = wordsOf(html)
    const order = ['Sign in', 'new to Discipler?', 'Create an account', 'People being discipled'].map((part) =>
      words.lastIndexOf(part),
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order).not.toContain(-1)
  })

  it.each(['', 'false', 'TRUE'])('is not offered with the switch at %j', async (value) => {
    vi.stubEnv('SIGN_UP_OPEN', value)
    const html = await htmlOf()

    expect(html).not.toContain('Create an account')
    expect(html).not.toContain('new to Discipler?')
    expect(html).not.toContain('/signup')
  })

  it('is not offered on a Vercel Preview, whatever the switch says', async () => {
    vi.stubEnv('SIGN_UP_OPEN', 'true')
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview')

    expect(await htmlOf()).not.toContain('Create an account')
  })
})

describe('what a failure says', () => {
  it.each([
    ['missing-credentials', 'Enter your email or phone and your password.'],
    ['no-such-account', 'That email or phone and password did not match.'],
    ['unreadable-phone', 'That does not look like an email or a phone number. Include the area code.'],
  ])('%s says the ticket\'s sentence', async (code, sentence) => {
    expect(signInFailureMessage(code)).toBe(sentence)
    expect(wordsOf(await htmlOf({ error: code }))).toContain(sentence)
  })

  it('names no phone number, in any sentence that could be about an email too', () => {
    for (const code of ['missing-credentials', 'no-such-account']) {
      expect(signInFailureMessage(code)).not.toMatch(/phone number/i)
    }
  })
})

describe('the styles it needs', () => {
  it('are in the stylesheet the app serves', () => {
    const css = readFileSync(fileURLToPath(new URL('../../public/discipler.css', import.meta.url)), 'utf8')

    for (const rule of ['.divider-or {', '.divider-or::before', 'a.btn.full {', 'button.full, a.btn.full {']) {
      expect(css).toContain(rule)
    }
  })
})
