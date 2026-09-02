import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PASSWORD_WORDS } from '~/domain/password-words'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The reset as an Admin performs it: from the row they are looking at, through a
 * screen that says what is about to happen, to four words they read out.
 *
 * Driven over HTTP because almost every decision in ticket 28 is a decision about
 * the surface. Whether the affordance appears, whether the password reaches the
 * screen without ever reaching a URL, and whether a refresh sets it a second time
 * are all questions about pages, and none of them is answerable from the port.
 */

describe.skipIf(skipUnlessAppIsRunning)('resetting a password over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Okonkwo')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  let numbered = 0
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const post = async (path: string, cookie: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return {
      response,
      location: response.headers.get('location') ?? '',
      html: await response.text(),
    }
  }

  /**
   * One Person's row and nothing either side of it, so an absent action is
   * assertable and not merely unfound. The name cell is what is matched on: every
   * other Person in a relationship is printed inside this row too.
   */
  const rowFor = (html: string, name: string): string => {
    // The name is inside the row's first cell, beside an avatar, so the match is
    // on the name and not on a bare cell.
    const cell = html.indexOf(`<span>${name}<`)
    if (cell === -1) throw new Error(`No row for ${name}`)
    const end = html.indexOf('</tr>', cell)
    return html.slice(cell, end === -1 ? undefined : end)
  }

  /** The candidate password the reset screen minted into its hidden field. */
  const candidateIn = (html: string): string => {
    const match = /<input type="hidden" name="password" value="([^"]+)"/.exec(html)
    if (!match?.[1]) throw new Error('The reset screen carried no candidate password')
    return match[1]
  }

  const signInAttempt = async (phone: string, password: string) => {
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    return client.auth.signInWithPassword({ phone, password })
  }

  it('offers the action only on rows that hold an account', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPersonWithAccount(ministry, 'Marcus Webb', 'leader', {
      phone: number(),
    })
    // On the Roster and nothing more: an import puts people here and an account
    // arrives only with an accepted Invitation Link.
    const imported = await addPerson(ministry, 'Ruth Adeyemi', { phone: number() })

    const { html } = await getPage('/roster', cookie)

    expect(rowFor(html, 'Marcus Webb')).toContain(`/roster/reset/${leader.personId}`)
    expect(rowFor(html, 'Ruth Adeyemi')).not.toContain('/roster/reset/')
    // Not a control that is always there and refuses most of the time: that teaches
    // an Admin the product does not know its own state.
    expect(rowFor(html, 'Ruth Adeyemi')).not.toContain('Reset password')
  })

  it('offers the Admin their own change instead of a reset on their own row', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/roster', cookie)
    const own = rowFor(html, ministry.adminName)

    // Not a reset: resetting your own password is not a recovery, because you are
    // holding a session as you ask. The row carries the one action that applies to
    // the Admin's own account, so nothing here is blank where every other
    // account-holding row has an action.
    expect(own).not.toContain(`/roster/reset/${ministry.adminPersonId}`)
    expect(own).toContain('href="/account"')
    expect(own).toContain('Your password')
  })

  it('names the Person, warns about the sign-out, and shows no phone number', async () => {
    const { cookie } = await signIn(ministry)
    const leader = await addPersonWithAccount(ministry, 'Sam Doyle', 'leader', {
      phone: number(),
    })

    const { html } = await getPage(`/roster/reset/${leader.personId}`, cookie)

    expect(html).toContain('Reset Sam Doyle’s password')
    expect(html).toContain('will be signed out everywhere')
    // The Roster shows no contact details and a number is reached through
    // `public.contact_to_share` and nowhere else. A reset was asked for by somebody
    // already in contact, so a second reveal path here would quietly widen the one
    // disclosure this product deliberately narrowed.
    expect(html).not.toContain(leader.phone)
    expect(html).not.toContain(leader.phone.replace('+', ''))
  })

  it('mints four words from the wordlist, and takes none from the Admin', async () => {
    const { cookie } = await signIn(ministry)
    const leader = await addPersonWithAccount(ministry, 'Nadia Farouk', 'leader', {
      phone: number(),
    })

    const { html } = await getPage(`/roster/reset/${leader.personId}`, cookie)
    const candidate = candidateIn(html)

    expect(candidate.split('-')).toHaveLength(4)
    for (const word of candidate.split('-')) expect(PASSWORD_WORDS).toContain(word)

    // Nothing on this screen asks an Admin for a password. Discipler chooses it,
    // because an Admin who chooses one holds a working credential in their own
    // habits and a pastor typing one for everybody types the same one for everybody.
    expect(html).not.toContain('type="password"')
  })

  it('sets the password, shows it once, and keeps it out of every URL', async () => {
    const { cookie } = await signIn(ministry)
    const leader = await addPersonWithAccount(ministry, 'Omar Haddad', 'leader', {
      phone: number(),
    })

    const { html: screen } = await getPage(`/roster/reset/${leader.personId}`, cookie)
    const candidate = candidateIn(screen)

    const { response, location, html } = await post(
      `/roster/reset/${leader.personId}/done`,
      cookie,
      { password: candidate },
    )

    // Rendered, not redirected to. There is nowhere a redirect could carry a
    // password that is not a query string, and a query string is written into
    // browser history and server logs.
    expect(response.status).toBe(200)
    expect(location).toBe('')
    expect(html).toContain(candidate)
    expect(html).toContain('Read this out to Omar Haddad')
    // And never cached, in a shared cache or a private one: the next person at this
    // machine pressing Back must not be handed somebody's password.
    expect(response.headers.get('cache-control')).toContain('no-store')

    expect((await signInAttempt(leader.phone, candidate)).error).toBeNull()
    expect((await signInAttempt(leader.phone, leader.password)).error).not.toBeNull()
  })

  it('sets the same password again when the result page is refreshed', async () => {
    const { cookie } = await signIn(ministry)
    const leader = await addPersonWithAccount(ministry, 'Tomas Vidal', 'leader', {
      phone: number(),
    })

    const { html: screen } = await getPage(`/roster/reset/${leader.personId}`, cookie)
    const candidate = candidateIn(screen)

    const first = await post(`/roster/reset/${leader.personId}/done`, cookie, {
      password: candidate,
    })
    // A refresh on a POST response re-sends the same body. The whole point of the
    // hidden candidate is that doing so is idempotent: the same four words are set
    // again, rather than a second reset killing the password just read out.
    const again = await post(`/roster/reset/${leader.personId}/done`, cookie, {
      password: candidate,
    })

    expect(again.response.status).toBe(200)
    expect(again.html).toContain(candidate)
    expect(first.html).toContain(candidate)
    expect((await signInAttempt(leader.phone, candidate)).error).toBeNull()
  })

  it('records the reset in history, naming the Admin and the Person', async () => {
    const { cookie } = await signIn(ministry)
    const leader = await addPersonWithAccount(ministry, 'Uche Nwosu', 'leader', {
      phone: number(),
    })

    const { html: screen } = await getPage(`/roster/reset/${leader.personId}`, cookie)
    await post(`/roster/reset/${leader.personId}/done`, cookie, {
      password: candidateIn(screen),
    })

    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'person.password_reset' and ministry_id = $2`,
      [leader.personId, ministry.id],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload).toEqual({ resetBy: ministry.adminUserId })
  })

  it('resets another Admin, who is a peer with equal power', async () => {
    const { cookie } = await signIn(ministry)
    // Deliberately included. A second Admin holds the same tier and the same reach,
    // and loses their password the same way anybody else does -- so the row offers
    // the action rather than making a peer the one person nobody can put back in.
    const peer = await addPersonWithAccount(ministry, 'Grace Mbeki', 'admin', {
      phone: number(),
    })

    const roster = await getPage('/roster', cookie)
    expect(rowFor(roster.html, 'Grace Mbeki')).toContain(`/roster/reset/${peer.personId}`)

    const { html: screen } = await getPage(`/roster/reset/${peer.personId}`, cookie)
    const candidate = candidateIn(screen)
    const { response } = await post(`/roster/reset/${peer.personId}/done`, cookie, {
      password: candidate,
    })

    expect(response.status).toBe(200)
    expect((await signInAttempt(peer.phone, candidate)).error).toBeNull()
  })

  it('refuses a self-targeted POST and changes nothing', async () => {
    const { cookie } = await signIn(ministry)

    const { html: screen } = await getPage(`/roster/reset/${ministry.adminPersonId}`, cookie)
    expect(screen).toContain('You cannot reset your own password from here')

    // Composed by hand, because the screen offers no button that would produce it.
    // The route refuses it anyway: reaching it through the UI is not a path, and
    // that is exactly why the route still has to be able to say no.
    const { response, location } = await post(
      `/roster/reset/${ministry.adminPersonId}/done`,
      cookie,
      { password: 'lantern-copper-willow-thicket' },
    )

    expect(response.status).toBe(303)
    expect(location).toContain(`/roster/reset/${ministry.adminPersonId}`)
    // Still signed in with what they had. Nothing was touched.
    expect((await signInAttempt(ministry.adminPhone, ministry.adminPassword)).error).toBeNull()
  })

  it('refuses a Person on another Ministry’s Roster before touching the password', async () => {
    const northside = await createMinistryWithAdmin('Northside Fellowship')
    const theirs = await addPersonWithAccount(northside, 'Ezra Kimani', 'leader', {
      phone: number(),
    })

    const { cookie } = await signIn(ministry)

    // The screen says there is nothing here to reset. It says the same thing it says
    // for a Person who holds no account, deliberately: a refusal that told the two
    // apart would disclose that another Ministry holds that Person.
    const { html } = await getPage(`/roster/reset/${theirs.personId}`, cookie)
    // And it says it about this Roster rather than about the Person, because the
    // Person demonstrably does hold an account -- on a Roster this Admin has no
    // business knowing exists.
    expect(html).toContain('There is nothing on this Roster to reset')

    const { response } = await post(`/roster/reset/${theirs.personId}/done`, cookie, {
      password: 'lantern-copper-willow-thicket',
    })

    expect(response.status).toBe(303)
    // The guard runs before the password is touched, so Northside's Leader signs in
    // with exactly what they had.
    expect((await signInAttempt(theirs.phone, theirs.password)).error).toBeNull()

    const { rows } = await pool.query(
      `select 1 from ministry_event where subject_id = $1 and type = 'person.password_reset'`,
      [theirs.personId],
    )
    expect(rows).toHaveLength(0)
  })

  it('signs the Leader out of the session they were holding', async () => {
    const { cookie } = await signIn(ministry)
    const leader: AccountFixture = await addPersonWithAccount(
      ministry,
      'Priya Raman',
      'leader',
      { phone: number() },
    )

    // A session held over HTTP, the way the Leader holds one: signed in through the
    // product's own route, and reaching a page of theirs before anything happens.
    const theirSignIn = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone: leader.phone, password: leader.password }),
    })
    const theirCookie = theirSignIn.headers
      .getSetCookie()
      .map((row) => row.split(';', 1)[0])
      .join('; ')

    const before = await getPage('/relationships', theirCookie)
    expect(before.response.status).toBe(200)

    const { html: screen } = await getPage(`/roster/reset/${leader.personId}`, cookie)
    await post(`/roster/reset/${leader.personId}/done`, cookie, {
      password: candidateIn(screen),
    })

    // The criterion, asserted where a Leader would notice it: the session they were
    // holding no longer opens their own dashboard, and they are sent to sign in.
    const after = await getPage('/relationships', theirCookie)
    expect(after.response.status).toBe(307)
    expect(after.response.headers.get('location')).toContain('/login')
  })
})
