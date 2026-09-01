import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * A person changing their own password, the way they do it: from a link beside
 * their name, through a form that says what pressing the button will do, to a
 * sign-in page that tells them why they are looking at it.
 *
 * Over HTTP because the decisions in ticket 30 are decisions about the surface:
 * what the form asks and in what order, which refusals come back together and
 * which come back alone, what the response does with the dead session cookie, and
 * where the page is linked from.
 */

describe.skipIf(skipUnlessAppIsRunning)('changing your own password over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Okonkwo')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  const created: string[] = []

  afterAll(async () => {
    for (const userId of created) {
      await serviceRoleClient().auth.admin.deleteUser(userId).catch(() => undefined)
    }
    await pool.end()
  })

  let numbered = 0
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const NEW_PASSWORD = 'harbinger-lantern-copper-fern'

  const post = async (cookie: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/account/change`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    const location = response.headers.get('location') ?? ''
    return {
      response,
      location,
      /** What came back on the query string, decoded, so a comma is a comma. */
      query: location ? new URL(location).searchParams : new URLSearchParams(),
    }
  }

  const change = (cookie: string, current: string, fresh: string, again = fresh) =>
    post(cookie, { currentPassword: current, newPassword: fresh, newPasswordAgain: again })

  const signInAttempt = async (phone: string, password: string) => {
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    return client.auth.signInWithPassword({ phone, password })
  }

  /** A Leader with an account of their own, signed in through the product's door. */
  const aSignedInLeader = async (name: string) => {
    const leader: AccountFixture = await addPersonWithAccount(ministry, name, 'leader', {
      phone: number(),
    })
    const { cookie } = await signInAs(leader)
    return { leader, cookie }
  }

  /** The Set-Cookie rows on a response that clear a cookie rather than set one. */
  const cookiesClearedBy = (response: Response): string[] =>
    response.headers
      .getSetCookie()
      .filter((row) => /^[^=]+=;/.test(row) || /max-age=0/i.test(row))
      .map((row) => row.split('=', 1)[0]!)

  /** One Person's row and nothing either side of it. */
  const rowFor = (html: string, name: string): string => {
    const cell = html.indexOf(`<td>${name}</td>`)
    if (cell === -1) throw new Error(`No row for ${name}`)
    const end = html.indexOf('</tr>', cell)
    return html.slice(cell, end === -1 ? undefined : end)
  }

  it('asks for the current password and the new one twice, and nothing else', async () => {
    const { cookie } = await signIn(ministry)
    const { response, html } = await getPage('/account', cookie)

    expect(response.status).toBe(200)
    expect(html).toContain('Change your password')

    // Three fields, in this order, and every one of them a password. Nothing about
    // the person: a name and a number are Roster facts an Admin owns.
    const fields = [...html.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/g)].map((m) => m[1])
    expect(fields).toEqual(['currentPassword', 'newPassword', 'newPasswordAgain'])
    expect(html.match(/type="password"/g)).toHaveLength(3)
    expect(html).not.toContain(ministry.adminName)
    expect(html).not.toContain(ministry.adminPhone)
    expect(html).not.toContain(ministry.adminPhone.replace('+', ''))
  })

  it('warns before the button that success signs them out everywhere, including here', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/account', cookie)

    const warning = html.indexOf('signs you out everywhere, including here')
    expect(warning).toBeGreaterThan(-1)
    expect(warning).toBeLessThan(html.indexOf('<button'))
  })

  it('sends a visitor with no session to sign in', async () => {
    const page = await fetch(`${baseUrl}/account`, { redirect: 'manual' })
    expect(page.status).toBe(307)
    expect(page.headers.get('location')).toContain('/login')

    const { response } = await change('', 'whatever-it-was', NEW_PASSWORD)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('changes the password, ends every session, and says so on the sign-in page', async () => {
    const { leader, cookie: onThePhone } = await aSignedInLeader('Marcus Webb')
    const { cookie: onTheLaptop } = await signInAs(leader)
    expect((await getPage('/relationships', onTheLaptop)).response.status).toBe(200)

    const { response, location, query } = await change(onThePhone, leader.password, NEW_PASSWORD)

    expect(response.status).toBe(303)
    expect(location).toContain('/login')
    expect(query.get('notice')).toBe('password-changed')
    // The dead session cookie is cleared on the way out, rather than left for the
    // next request to be refused on.
    const sessionCookie = onThePhone.split('=', 1)[0]!
    expect(cookiesClearedBy(response)).toContain(sessionCookie)

    // Both sessions refused, the one that made the change included.
    expect((await getPage('/relationships', onThePhone)).response.status).toBe(307)
    expect((await getPage('/relationships', onTheLaptop)).response.status).toBe(307)

    expect((await signInAttempt(leader.phone, leader.password)).error).not.toBeNull()
    expect((await signInAttempt(leader.phone, NEW_PASSWORD)).error).toBeNull()

    // And the person can get back in through the front door with what they chose.
    const { response: again } = await signInAs({ phone: leader.phone, password: NEW_PASSWORD })
    expect(again.headers.get('location')).not.toContain('error=')
  })

  it('records nothing and sends nothing', async () => {
    const { leader, cookie } = await aSignedInLeader('Ruth Adeyemi')

    const before = await pool.query<{ events: string; messages: string }>(
      `select
         (select count(*) from ministry_event where subject_id = $1) as events,
         (select count(*) from outbound_message where person_id = $1) as messages`,
      [leader.personId],
    )

    await change(cookie, leader.password, NEW_PASSWORD)

    // `person.password_reset` exists to answer *did somebody else change this
    // person's credential*, and a self-change is the case where the answer is no.
    // Recording both under one type would destroy the distinction it carries.
    const after = await pool.query<{ events: string; messages: string }>(
      `select
         (select count(*) from ministry_event where subject_id = $1) as events,
         (select count(*) from outbound_message where person_id = $1) as messages`,
      [leader.personId],
    )
    expect(after.rows[0]).toEqual(before.rows[0])
  })

  it('refuses a wrong current password alone, and touches nothing', async () => {
    const { leader, cookie } = await aSignedInLeader('Sam Doyle')

    const { response, location, query } = await change(cookie, 'not-what-they-have', NEW_PASSWORD)

    expect(response.status).toBe(303)
    expect(location).toContain('/account')
    expect(query.get('error')).toBe('account.current_password_wrong')

    // Still signed in, still with the password they had.
    expect((await getPage('/account', cookie)).response.status).toBe(200)
    expect((await signInAttempt(leader.phone, leader.password)).error).toBeNull()
    expect((await signInAttempt(leader.phone, NEW_PASSWORD)).error).not.toBeNull()

    const { html } = await getPage(`/account?${query}`, cookie)
    expect(html).toContain('That is not your current password.')
  })

  it('refuses a short new password and a mismatched repeat together, before asking the platform', async () => {
    const { leader, cookie } = await aSignedInLeader('Nadia Farouk')

    // The current password is wrong here too, and is not reported: the form's own
    // rules are checked first and together, so a form that was going to be refused
    // anyway spends nothing against the sign-in rate limit.
    const { query } = await change(cookie, 'not-what-they-have', 'short', 'shorter')

    expect(query.get('error')).toBe('account.password_too_short,account.passwords_differ')

    const { html } = await getPage(`/account?${query}`, cookie)
    const tooShort = html.indexOf('at least')
    const differ = html.indexOf('The two new passwords do not match.')
    expect(tooShort).toBeGreaterThan(-1)
    expect(differ).toBeGreaterThan(tooShort)
    expect(html).not.toContain('That is not your current password.')

    expect((await getPage('/account', cookie)).response.status).toBe(200)
    expect((await signInAttempt(leader.phone, leader.password)).error).toBeNull()
  })

  it('checks the current password against the session’s own account, never a number on the form', async () => {
    // Two accounts. Every fixture is minted with the same password, so the one
    // making the change is first given a password of its own -- otherwise a check
    // against the wrong account would pass by coincidence and prove nothing.
    const theirs = await addPersonWithAccount(ministry, 'Priya Raman', 'leader', {
      phone: number(),
    })
    const own: AccountFixture = await addPersonWithAccount(ministry, 'Uche Nwosu', 'leader', {
      phone: number(),
    })
    await supabaseAccounts.setPassword(own.userId, 'a-password-of-their-own')
    const { cookie } = await signInAs({ phone: own.phone, password: 'a-password-of-their-own' })

    // The other account's number and the other account's password, posted by hand.
    // If the route read a number off the form this would verify against Priya and
    // succeed; it verifies against the session's account and is refused.
    const { query } = await post(cookie, {
      phone: theirs.phone,
      currentPassword: theirs.password,
      newPassword: NEW_PASSWORD,
      newPasswordAgain: NEW_PASSWORD,
    })

    expect(query.get('error')).toBe('account.current_password_wrong')
    expect((await signInAttempt(own.phone, 'a-password-of-their-own')).error).toBeNull()
    expect((await signInAttempt(theirs.phone, theirs.password)).error).toBeNull()
    expect((await signInAttempt(theirs.phone, NEW_PASSWORD)).error).not.toBeNull()
  })

  it('carries nothing typed across the round trip', async () => {
    const { leader, cookie } = await aSignedInLeader('Omar Haddad')
    const typed = 'lantern-copper-willow-thicket'

    const { location } = await change(cookie, leader.password, typed, `${typed}x`)

    expect(location).not.toContain(typed)
    const { html } = await getPage(new URL(location).pathname + new URL(location).search, cookie)
    expect(html).not.toContain(typed)
  })

  it('tells the sign-in page why they are there, and says nothing for a code it does not know', async () => {
    const { html } = await getPage('/login?notice=password-changed', '')
    expect(html).toContain('Your password has changed. Sign in with the new one.')

    // What the page renders, as distinct from the router payload Next appends,
    // which carries the request URL and is not something a person reads.
    const rendered = (html: string) => html.slice(html.indexOf('<main>'), html.indexOf('</main>'))
    const { html: unknown } = await getPage('/login?notice=anything-at-all', '')
    expect(rendered(unknown)).not.toContain('Your password has changed')
    expect(rendered(unknown)).not.toContain('anything-at-all')
    expect(rendered(unknown)).not.toContain('role="status"')

    // A query string is whatever somebody typed there. Object.prototype is not a
    // notice and not a failure, and neither may take the page down.
    for (const code of ['__proto__', 'constructor', 'toString']) {
      expect((await getPage(`/login?notice=${code}`, '')).response.status).toBe(200)
      expect((await getPage(`/login?error=${code}`, '')).response.status).toBe(200)
    }
  })

  it('is linked from the Roster, from the Admin’s own row, and from the relationships a Leader sees', async () => {
    const { cookie } = await signIn(ministry)
    const { html: roster } = await getPage('/roster', cookie)

    expect(roster).toContain('href="/account"')
    expect(roster).toContain('Change your password')

    // Where 28 rendered plain text saying they cannot reset their own password,
    // because there was nowhere to point. There is now.
    const own = rowFor(roster, ministry.adminName)
    expect(own).toContain('href="/account"')
    expect(own).toContain('Change your password')
    expect(own).not.toContain('You cannot reset your own password')

    const { cookie: leadersCookie } = await aSignedInLeader('Tomas Vidal')
    const { html: relationships } = await getPage('/relationships', leadersCookie)
    expect(relationships).toContain('href="/account"')
    expect(relationships).toContain('Change your password')
  })

  it('points an Admin who reaches their own reset screen at the page instead', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage(`/roster/reset/${ministry.adminPersonId}`, cookie)

    expect(html).toContain('You cannot reset your own password from here')
    // A hand-crafted GET is exactly the reader who follows the words on the screen,
    // so the words point somewhere true: not *ask another Admin*, which was the only
    // advice available when 28 shipped and is now false.
    expect(html).not.toContain('Ask another Admin')
    expect(html).toContain('href="/account"')
  })

  it('serves a session that resolves to no Ministry membership at all', async () => {
    // Somebody whose Person row was removed. The credential is theirs and not the
    // Ministry's, and a membership check would leave an orphaned account with a
    // password it can never change.
    const phone = aTestPhoneNumber()
    const minted = await supabaseAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in minted)) throw new Error(`the account was refused: ${minted.refusal}`)
    created.push(minted.userId)

    const { cookie } = await signInAs({ phone, password: 'a-long-enough-password' })
    expect((await getPage('/account', cookie)).response.status).toBe(200)

    const { query } = await change(cookie, 'a-long-enough-password', NEW_PASSWORD)

    expect(query.get('notice')).toBe('password-changed')
    expect((await signInAttempt(phone, NEW_PASSWORD)).error).toBeNull()
  })
})
