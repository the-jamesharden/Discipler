import { beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  createMinistryWithAdmin,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  baseUrl,
  cookiesFrom,
  getPage,
  signIn,
  skipUnlessAppIsRunning,
} from '../support/app'

const getRoster = (cookie: string) => getPage('/roster', cookie)

/**
 * The walking skeleton's surface: an Admin signs in and reaches a Roster scoped to
 * their own Ministry, and only their own Ministry.
 */

describe.skipIf(skipUnlessAppIsRunning)('an Admin signing in', () => {
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
