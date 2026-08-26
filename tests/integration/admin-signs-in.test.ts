import { beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  createMinistryWithAdmin,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The walking skeleton's surface: an Admin signs in and reaches a Roster scoped to
 * their own Ministry, and only their own Ministry. Driven over HTTP against the
 * running app rather than through a browser, so it is repeatable and lives in the
 * suite rather than in someone's memory of having clicked it once.
 *
 * Requires the app to be running (`npm run build && npm start`). Skipped otherwise
 * so a plain `npm test` does not fail for a reason unrelated to the code -- but
 * never skipped under CI, where a silent pass would hide the only proof that an
 * Admin can reach their Roster at all.
 */

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:3210'

const appIsRunning = await fetch(`${baseUrl}/login`, { redirect: 'manual' })
  .then((response) => response.ok)
  .catch(() => false)

const cookiesFrom = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ')

const signIn = async (ministry: MinistryFixture) => {
  const response = await fetch(`${baseUrl}/auth/sign-in`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: ministry.adminEmail,
      password: ministry.adminPassword,
    }),
  })

  return { response, cookie: cookiesFrom(response) }
}

const getRoster = async (cookie: string) => {
  const response = await fetch(`${baseUrl}/roster`, {
    redirect: 'manual',
    headers: { cookie },
  })
  return { response, html: await response.text() }
}

describe.skipIf(!appIsRunning && !process.env.CI)('an Admin signing in', () => {
  let riverside: MinistryFixture
  let northgate: MinistryFixture

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    northgate = await createMinistryWithAdmin('Northgate Community Church')
    await addPerson(northgate, 'Ben Okafor')
  })

  it('is sent to sign in before seeing any Roster', async () => {
    const response = await fetch(`${baseUrl}/roster`, { redirect: 'manual' })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('reaches the Roster once signed in', async () => {
    const { response, cookie } = await signIn(riverside)

    expect(response.headers.get('location')).toContain('/roster')
    expect(cookie).not.toBe('')

    const { response: roster, html } = await getRoster(cookie)

    expect(roster.status).toBe(200)
    expect(html).toContain('Roster')
  })

  it('sees their own Ministry named on it', async () => {
    const { cookie } = await signIn(riverside)
    const { html } = await getRoster(cookie)

    expect(html).toContain('Riverside Chapel')
    expect(html).not.toContain('Northgate Community Church')
  })

  it('sees an empty Roster', async () => {
    const { cookie } = await signIn(riverside)
    const { html } = await getRoster(cookie)

    expect(html).toContain('Nobody is on this Roster yet')
  })

  it('never sees a Person belonging to another Ministry', async () => {
    const { cookie } = await signIn(riverside)
    const { html } = await getRoster(cookie)

    expect(html).not.toContain('Ben Okafor')
  })

  it('sees their own Roster fill up, so the emptiness above means something', async () => {
    await addPerson(riverside, 'Ada Rowe')

    const { cookie } = await signIn(riverside)
    const { html } = await getRoster(cookie)

    expect(html).toContain('Ada Rowe')
    expect(html).not.toContain('Ben Okafor')
  })

  it('is turned away when the password is wrong, and told nothing useful', async () => {
    const response = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: riverside.adminEmail,
        password: 'not the password',
      }),
    })

    const location = response.headers.get('location') ?? ''
    expect(location).toContain('/login?error=')
    expect(decodeURIComponent(location)).not.toContain(riverside.adminEmail)

    const { response: roster } = await getRoster(cookiesFrom(response))
    expect(roster.status).toBe(307)
  })
})
