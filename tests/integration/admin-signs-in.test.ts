import { beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  createMinistryWithAdmin,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  aNetwork,
  baseUrl,
  cookiesFrom,
  getPage,
  signIn,
  signInAs,
  skipUnlessAppIsRunning,
} from '../support/app'

// The one list (Roles per pairing, ticket 02): an Admin is on their own Roster
// like anybody else, and so is everybody an upload adds.
const getRoster = (cookie: string) => getPage('/roster', cookie)

/**
 * The walking skeleton's surface: an Admin signs in and reaches a Roster scoped to
 * their own Ministry, and only their own Ministry.
 *
 * These Admins sign in with a phone number and a password, and their accounts hold no
 * email at all, because nothing proved one: the same as an Admin from a Setup Link. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`. An Admin who signed up
 * with an email is `signing-in-with-email-or-phone-over-http.test.ts`.
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

  it('reaches the Overview once signed in', async () => {
    const { response, cookie } = await signIn(riverside)

    // Sign-in lands on `/`, which asks what this session holds before it sends them
    // anywhere: an Admin gets the Overview, and everybody else gets their own
    // relationships. Following the redirect is how the test asks the same question.
    expect(response.headers.get('location')).toContain('/')
    expect(cookie).not.toBe('')

    const { response: home } = await getPage('/', cookie)
    expect(home.headers.get('location')).toContain('/overview')

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

  it('sees themselves on a new Roster, and nobody else', async () => {
    // Not an empty page. Provisioning gives the Admin a Person row in their own
    // Ministry, so they are on the Roster from the first day like everybody else --
    // which is what `docs/adr/0009-one-account-per-human.md` means by one human
    // holding one login and their roles being derived from what they are part of.
    const { cookie } = await signIn(riverside)
    const { html } = await getRoster(cookie)

    expect(html).toContain(riverside.adminName)
    expect(html).not.toContain('Nobody is on this Roster yet')
    expect(html).not.toContain('Ada Rowe')
  })

  it('never sees a Person belonging to another Ministry', async () => {
    const { cookie } = await signIn(riverside)
    const { html } = await getRoster(cookie)

    expect(html).not.toContain('Ben Okafor')
  })

  it('sees their own Roster fill up, so the row above means something', async () => {
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
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': aNetwork() },
      body: new URLSearchParams({
        login: riverside.adminPhone,
        password: 'not the password',
      }),
    })

    const location = response.headers.get('location') ?? ''
    expect(location).toContain('/login?error=')
    expect(decodeURIComponent(location)).not.toContain(riverside.adminPhone)

    const { response: roster } = await getRoster(cookiesFrom(response))
    expect(roster.status).toBe(307)
  })

  it('is turned away with an email address when their account holds none', async () => {
    // Ticket 01's login page shipped and was superseded, and ADR-0030 opened the door
    // again for an Admin who signed up with an email. This one came from a fixture, as
    // from a Setup Link, so their account holds no address and none can sign them in:
    // the address goes to Supabase Auth, and comes back as any wrong entry does.
    const response = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': aNetwork() },
      body: new URLSearchParams({
        login: 'admin@riverside.example',
        password: riverside.adminPassword,
      }),
    })

    expect(response.headers.get('location')).toContain('/login?error=no-such-account')
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
