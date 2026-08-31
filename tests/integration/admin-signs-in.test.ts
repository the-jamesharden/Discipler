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
  signInAs,
  skipUnlessAppIsRunning,
} from '../support/app'

const getRoster = (cookie: string) => getPage('/roster', cookie)

/**
 * The walking skeleton's surface: an Admin signs in and reaches a Roster scoped to
 * their own Ministry, and only their own Ministry.
 *
 * They sign in with a phone number and a password, which is the credential for
 * every user since ticket 15 -- the Admin included, and the account here holds an
 * email address it is not asked for. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
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

    // Sign-in lands on `/`, which asks what this session holds before it sends them
    // anywhere: an Admin gets the Roster, and everybody else gets their own
    // relationships. Following the redirect is how the test asks the same question.
    expect(response.headers.get('location')).toContain('/')
    expect(cookie).not.toBe('')

    const { response: home } = await getPage('/', cookie)
    expect(home.headers.get('location')).toContain('/roster')

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
        phone: riverside.adminPhone,
        password: 'not the password',
      }),
    })

    const location = response.headers.get('location') ?? ''
    expect(location).toContain('/login?error=')
    expect(decodeURIComponent(location)).not.toContain(riverside.adminPhone)

    const { response: roster } = await getRoster(cookiesFrom(response))
    expect(roster.status).toBe(307)
  })

  it('is turned away with an email address, which is no longer a credential', async () => {
    // Ticket 01's login page shipped and is superseded rather than extended. Email
    // is optional at Intake, so a Person may lead a relationship without Discipler
    // ever learning one -- which is why the identifier moved to the phone.
    const response = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        phone: riverside.adminEmail,
        password: riverside.adminPassword,
      }),
    })

    expect(response.headers.get('location')).toContain('/login?error=unreadable-phone')
  })

  it('reads a number typed the way somebody would type it', async () => {
    // The sign-in form reads a number through `asPhoneNumber`, the same function the
    // spreadsheet importer and the Intake form read one through. A second reading
    // here would drift, and the way it would fail is an account reachable by SMS and
    // not through the front door.
    const asTyped = riverside.adminPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    expect(asTyped).not.toBe(riverside.adminPhone)

    const { response } = await signInAs({ phone: asTyped, password: riverside.adminPassword })
    expect(response.headers.get('location')).not.toContain('/login')
  })
})
