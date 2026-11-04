import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinkSent } from '../../app/login/forgot/form'
import ForgotPasswordPage from '../../app/login/forgot/page'
import { generateMetadata } from '../../app/login/forgot/[token]/page'
import NewPasswordPage from '../../app/login/forgot/[token]/page'
import { newPasswordProblem } from '../../app/login/forgot/[token]/copy'
import LoginPage from '../../app/login/page'
import { SHORTEST_PASSWORD } from '~/domain/accounts'

/**
 * "Forgot your password?"'s four pages as the server renders them, in the words of
 * mock-up 6, which are James's (Exponential launch, ticket 22). What they do is
 * `tests/integration/forgot-password.test.ts` and `forgot-password-over-http.test.ts`.
 */

let live = true

vi.mock('~/service/container', () => ({
  getForgotPassword: () => ({ linkIsLive: async () => live }),
}))

const TOKEN = 'a'.repeat(43)

const wordsOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const linkPage = async (error?: string) =>
  renderToStaticMarkup(
    await NewPasswordPage({
      params: Promise.resolve({ token: TOKEN }),
      searchParams: Promise.resolve(error ? { error } : {}),
    }),
  )

afterEach(() => {
  live = true
  vi.unstubAllEnvs()
})

describe('the sign-in page', () => {
  it('links to the request page under the password box, as drawn', async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('<p class="hint"><a href="/login/forgot">Forgot your password?</a></p>')
    expect(html.indexOf('name="password"')).toBeLessThan(html.indexOf('Forgot your password?'))
    expect(html.indexOf('Forgot your password?')).toBeLessThan(html.indexOf('>Sign in</button>'))
  })
})

describe('asking for a link', () => {
  const html = () => renderToStaticMarkup(createElement(ForgotPasswordPage))

  it('asks for one thing, in James\'s words', () => {
    const page = html()

    expect(wordsOf(page)).toContain("Discipler Reset your password")
    expect(page).toMatch(/<label[^>]*for="email"[^>]*>Email<\/label>/)
    expect(page).toContain('We&#x27;ll email you a link to choose a new password.')
    expect(page).toMatch(/<button type="submit" class="full">Send me the link<\/button>/)
    expect(page).toContain('<p class="card-note"><a href="/login">Back to sign in</a></p>')
    expect(page.match(/<input/g)).toHaveLength(1)
  })

  it('posts, so a press before the page has come alive puts no address in an address bar', () => {
    expect(html()).toMatch(/<form[^>]*method="post"/)
  })

  it('says what it needs where a browser runs no script', () => {
    expect(html()).toContain('This page needs JavaScript.')
  })
})

describe('after the button', () => {
  it('says the mock-up\'s words, and the address is text', () => {
    const page = renderToStaticMarkup(createElement(LinkSent, { email: 'pastor.dan@gracechurch.org' }))

    expect(wordsOf(page)).toBe(
      "Email sent. The link to choose a new password is in your inbox at pastor.dan@ gracechurch.org . It works for 30 minutes. Can't find it? Please check your spam or promotions folder. The email comes from notify.trydiscipler.com. Back to sign in",
    )
    expect(page).toContain('<div class="sent-to" role="status">')
    expect(page).toContain('<strong>pastor.dan@<wbr/>gracechurch.org</strong>')
  })
})

describe('the link', () => {
  it('asks for a new password while it is live, and only that', async () => {
    const page = await linkPage()

    expect(wordsOf(page)).toBe(
      `Discipler Reset your password Choose a new password (minimum ${SHORTEST_PASSWORD} characters) Use at least ${SHORTEST_PASSWORD} characters. Save new password`,
    )
    expect(page).toContain(`action="/login/forgot/${TOKEN}/save"`)
    expect(page).toMatch(/<form[^>]*method="post"/)
    expect(page).toContain('autoComplete="new-password"')
  })

  it('says it has run out when it has, with the way to a new one', async () => {
    live = false
    const page = await linkPage()

    expect(wordsOf(page)).toBe(
      'Discipler Reset your password This link has run out or has already been used. Send me a new link Back to sign in',
    )
    expect(page).toContain('<p class="toast error" role="alert">')
    expect(page).toContain('<a class="btn full" href="/login/forgot">Send me a new link</a>')
    expect(page).not.toContain('<form')
  })

  it.each([
    [true, 'Choose a new password'],
    [false, 'This link has run out'],
  ])('is titled for what it is: live %j', async (isLive, title) => {
    live = isLive
    expect((await generateMetadata({ params: Promise.resolve({ token: TOKEN }) })).title).toBe(title)
  })

  it.each([
    ['account.password_too_short', `Choose a password of at least ${SHORTEST_PASSWORD} characters.`],
    ['account.password_too_common', 'That password is one of the most common, so it is easy to guess. Choose another.'],
    ['account.password_too_long', 'Choose a password of no more than 72 characters.'],
    ['forgot.not_saved', "We couldn't save your new password just now. Please try again in a minute."],
  ])('words %s, above the form', async (code, sentence) => {
    const page = await linkPage(code)

    expect(newPasswordProblem(code)).toBe(sentence)
    expect(wordsOf(page)).toContain(sentence)
    expect(page.indexOf('toast error')).toBeLessThan(page.indexOf('<form'))
  })

  it.each(['__proto__', 'toString', '<script>', 'forgot.link_dead'])('renders nothing for %j on the query string', async (code) => {
    const page = await linkPage(code)

    expect(page).not.toContain('toast')
    expect(page).not.toContain('<script>')
  })
})
