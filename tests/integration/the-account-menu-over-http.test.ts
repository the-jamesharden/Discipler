import { beforeAll, describe, expect, it } from 'vitest'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  type MinistryFixture,
} from '../support/local-supabase'
import { getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Account menu of ticket 32: one control on every signed-in header, holding
 * the places that are not the page's own, in two groups named for what they act on.
 *
 * Over HTTP because every decision it records is about the rendered page: what the
 * header carries beside the menu, what the menu offers an Admin and what it offers
 * a Leader, and where Discipleship Goals went.
 */

/** The header, which is everything before `<main`. */
const header = (html: string) => html.slice(0, html.indexOf('<main'))

/** The menu alone. */
const menu = (html: string) => {
  const start = html.indexOf('<details class="account"')
  if (start === -1) throw new Error('The page has no Account menu')
  return html.slice(start, html.indexOf('</details>', start))
}

describe.skipIf(skipUnlessAppIsRunning)('the Account menu', () => {
  let ministry: MinistryFixture
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    cookie = (await signIn(ministry)).cookie
  })

  it('is on every Admin page, beside the one visible way to the Leader surface', async () => {
    for (const path of ['/overview', '/roster', '/settings', '/settings/goals', '/intake-forms', '/account']) {
      const { html } = await getPage(path, cookie)
      const head = header(html)

      // A native details element, so it opens and closes with no script.
      expect(head).toContain('<details class="account"')
      expect(head).toContain('<summary')
      expect(head).toContain('Account')
    }

    const { html: roster } = await getPage('/roster', cookie)
    const head = header(roster)
    // The surface switch is a place and not a setting, so it stays visible and
    // sits before the menu rather than inside it.
    expect(head.indexOf('The relationships you lead')).toBeLessThan(head.indexOf('<details'))
    expect(menu(roster)).not.toContain('The relationships you lead')
  })

  it('offers an Admin the Ministry’s places and their own, in two named groups', async () => {
    const { html } = await getPage('/roster', cookie)
    const offered = menu(html)

    expect(offered).toContain('This Ministry')
    expect(offered).toContain('href="/settings"')
    expect(offered).toContain('href="/intake-forms"')
    expect(offered).toContain('Intake forms')
    expect(offered).toContain('You')
    expect(offered).toContain('href="/account"')
    expect(offered).toContain('Change your password')
    // Signing out is a POST, and stays one inside the menu.
    expect(offered).toContain('action="/auth/sign-out"')
    expect(offered).toContain('Sign out')

    // The header groups what it links to, and does not repeat what the menu holds.
    expect(header(html).match(/href="\/settings"/g)).toHaveLength(1)
  })

  it('leaves Discipleship Goals to the Settings page it belongs under', async () => {
    const { html: roster } = await getPage('/roster', cookie)
    expect(header(roster)).not.toContain('/settings/goals')

    const { html: settings } = await getPage('/settings', cookie)
    expect(header(settings)).toContain('href="/settings/goals"')
    expect(header(settings)).toContain('Discipleship Goals')
  })

  it('offers a Leader only what is theirs, with no group to name', async () => {
    const leader = await addPersonWithAccount(ministry, 'Tomas Vidal', 'leader', {
      phone: aTestPhoneNumber(),
    })
    const { cookie: leadersCookie } = await signInAs(leader)

    for (const path of ['/relationships', '/account']) {
      const { html } = await getPage(path, leadersCookie)
      const offered = menu(html)

      expect(offered).toContain('href="/account"')
      expect(offered).toContain('action="/auth/sign-out"')
      expect(offered).not.toContain('This Ministry')
      expect(offered).not.toContain('href="/settings"')
      expect(offered).not.toContain('href="/intake-forms"')
      // One group needs no label.
      expect(offered).not.toContain('account-label')
    }
  })
})
