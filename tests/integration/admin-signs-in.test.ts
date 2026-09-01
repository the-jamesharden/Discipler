import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
  serviceRoleClient,
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
 * every user -- the Admin included, and the account holds no email at all, because
 * provisioning mints none. See
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
    //
    // A literal, because there is no address to reach for: provisioning creates a
    // phone identity and no email, so the account this Admin holds has none.
    const response = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        phone: 'admin@riverside.example',
        password: riverside.adminPassword,
      }),
    })

    expect(response.headers.get('location')).toContain('/login?error=unreadable-phone')
  })

  it('is turned away with an address that really would sign them in underneath', async () => {
    // The test above proves an email-shaped string is unreadable as a number. It
    // cannot prove the stronger thing, because the address it posts belongs to
    // nobody: an account holding one is a state provisioning no longer produces.
    //
    // So one is made by hand -- the shape a pilot account minted before ticket 24
    // would have -- and it is shown to be a working credential at Supabase before
    // the front door is asked about it. What is asserted is that the door does not
    // open: not that the address is unknown, but that it is never carried to
    // somewhere that knows it.
    const email = `pilot-${Date.now()}@riverside.example`
    const password = 'a-long-enough-password'

    const admin = serviceRoleClient()
    const { data: created, error: mintError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (mintError) throw new Error(`Could not mint the email account: ${mintError.message}`)

    try {
      const { apiUrl, anonKey } = localSupabase()
      const supabase = createClient(apiUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { error: underneath } = await supabase.auth.signInWithPassword({ email, password })
      expect(underneath).toBeNull()

      const response = await fetch(`${baseUrl}/auth/sign-in`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: email, password }),
      })

      expect(response.headers.get('location')).toContain('/login?error=unreadable-phone')

      // And no session came back with the refusal, which is the part that would
      // matter if the reading above ever stopped happening.
      const { response: roster } = await getRoster(cookiesFrom(response))
      expect(roster.status).toBe(307)
    } finally {
      await admin.auth.admin.deleteUser(created.user.id)
    }
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
