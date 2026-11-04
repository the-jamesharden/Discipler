import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { upcomingOfficeHours } from '~/domain/office-hours'
import { NEXT_OFFICE_HOURS } from '../../app/help/office-hours'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * The top nav (Exponential launch, ticket 23): every Admin page's header carries Help,
 * the Settings gear and a circle with the Admin's initials, and a Leader's pages carry
 * the Account menu they always did.
 *
 * Over HTTP because every decision it records is about the rendered page: what the
 * header carries, what each menu offers an Admin and what a Leader is offered, and
 * where Discipleship Goals went.
 */

/** The header, which is everything before `<main`. */
const header = (html: string) => html.slice(0, html.indexOf('<main'))

/** One `details` menu of the header, by what its summary is labelled. */
const topMenu = (html: string, label: string) => {
  const summary = html.indexOf(`aria-label="${label}"`)
  if (summary === -1) throw new Error(`The page has no menu labelled ${label}`)
  return html.slice(summary, html.indexOf('</details>', summary))
}

/** The Account menu a Leader's pages carry. */
const menu = (html: string) => {
  const start = html.indexOf('<details class="account"')
  if (start === -1) throw new Error('The page has no Account menu')
  return html.slice(start, html.indexOf('</details>', start))
}

/** The words a menu shows, in order, without their markup. */
const wordsIn = (markup: string) =>
  [...markup.matchAll(/>([^<>]+)</g)].map(([, words]) => words!.trim()).filter((words) => words !== '')

describe.skipIf(skipUnlessAppIsRunning)('the top nav', () => {
  let ministry: MinistryFixture
  let cookie: string
  let aPersonPage: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
    cookie = (await signIn(ministry)).cookie
    aPersonPage = `/roster/${ministry.adminPersonId}`
  })

  const ADMIN_PAGES = () => [
    '/overview',
    '/check-ins',
    '/suggested-pairs',
    '/follow-up',
    '/materials',
    '/materials/new',
    '/roster',
    aPersonPage,
    '/settings',
    '/intake-forms',
    '/account',
    '/relationships',
  ]

  it('is on every Admin page: Help, the gear and the circle with their initials', async () => {
    for (const path of ADMIN_PAGES()) {
      const { html, response } = await getPage(path, cookie)
      expect(response.status, path).toBe(200)
      const head = header(html)

      expect(head, path).toContain('class="top-nav"')
      expect(head, path).toMatch(/<summary class="icon-btn" aria-label="Help and feedback"/)
      expect(head, path).toMatch(/<a [^>]*class="icon-btn"[^>]*href="\/settings"/)
      expect(head, path).toContain('aria-label="Settings"')
      expect(head, path).toMatch(/<summary class="initials-btn" aria-label="Your account"[^>]*>GA<\/summary>/)
      // The Account menu is a Leader's now.
      expect(head, path).not.toContain('<details class="account"')
    }
  })

  it('opens the circle on their name, their church, and the four places of theirs', async () => {
    const { html } = await getPage('/roster', cookie)
    const opened = topMenu(html, 'Your account')

    expect(wordsIn(opened)).toEqual([
      'GA',
      'Grace Adeyemi',
      'Admin, Riverside Chapel',
      'The relationships you lead',
      'Intake forms',
      'Change your password',
      'Sign out',
    ])
    expect(opened).toContain('href="/relationships"')
    expect(opened).toContain('href="/intake-forms"')
    expect(opened).toContain('href="/account"')
    // Signing out is a POST, and stays one inside the menu.
    expect(opened).toContain('action="/auth/sign-out"')
  })

  it('moves The relationships you lead off the header and Ministry settings onto the gear', async () => {
    const { html } = await getPage('/roster', cookie)
    const head = header(html)

    // Once, in the menu, and no longer a button beside it.
    expect(head.match(/The relationships you lead/g)).toHaveLength(1)
    expect(head).not.toContain('Ministry settings')
    expect(head.match(/href="\/settings"/g)).toHaveLength(1)
  })

  it('offers in the Help menu only what works today, and nothing that goes nowhere', async () => {
    const { html, response } = await getPage('/overview', cookie)
    expect(response.status).toBe(200)

    // Office hours is the office hours file's to say, and its own suite holds that.
    const officeHours = upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date()) ? ['Office hours'] : []
    expect(wordsIn(topMenu(html, 'Help and feedback'))).toEqual([
      'Help and feedback',
      'Help center',
      'What&#x27;s new',
      'New',
      ...officeHours,
      'Contact support',
    ])
    expect(topMenu(html, 'Help and feedback')).toContain('href="/help"')
    expect((await getPage('/help', '')).response.status).toBe(200)

    const head = header(html)
    for (const notYet of [
      'Ask Discipler',
      'Restart onboarding',
      'Setup videos',
      'Blog',
    ]) {
      expect(head, notYet).not.toContain(notYet)
    }
    expect(head).toContain('href="/refer"')
    // No control anywhere in the nav is a link to nowhere.
    expect(head).not.toContain('href="#"')
  })

  it('lets only one of its menus be open at a time, with no script', async () => {
    const { html } = await getPage('/overview', cookie)
    const menus = [...header(html).matchAll(/<details class="top-menu"([^>]*)>/g)]

    expect(menus).toHaveLength(2)
    for (const [, attributes] of menus) expect(attributes).toContain('name="top-nav"')
  })

  it('offers the arrows that slide the tabs, hidden until a script says there is more', async () => {
    const { html } = await getPage('/roster', cookie)

    // Drawn as hidden on the server: without a script they could do nothing, and the
    // row still slides under a thumb.
    expect(html).toMatch(/<button type="button" class="tab-arrow prev" aria-label="Earlier tabs">/)
    expect(html).toMatch(/<button type="button" class="tab-arrow next" aria-label="More tabs">/)
  })

  it('draws a plain mark for an Admin the Roster holds no row for', async () => {
    const chapel = await createMinistryWithAdmin('The Chapel With No Row')
    const { cookie: theirs } = await signIn(chapel)

    const pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query('update person set user_id = null where id = $1', [chapel.adminPersonId])
    await pool.end()

    const { html, response } = await getPage('/settings', theirs)
    expect(response.status).toBe(200)

    const opened = topMenu(html, 'Your account')
    expect(wordsIn(opened)).toEqual([
      'Admin, The Chapel With No Row',
      'The relationships you lead',
      'Intake forms',
      'Change your password',
      'Sign out',
    ])
    expect(opened).not.toContain('<strong>')
  })

  it('carries no link to the goals list, which is a card on Intake forms', async () => {
    // Ticket 32 left Discipleship Goals under Ministry Settings; ticket 34 made it
    // the goals question on Intake forms, so no header anywhere points at a page
    // of its own.
    for (const path of ['/roster', '/settings', '/intake-forms']) {
      const { html } = await getPage(path, cookie)
      expect(header(html)).not.toContain('/settings/goals')
      expect(header(html)).not.toContain('Discipleship Goals')
    }
    const { html: forms } = await getPage('/intake-forms', cookie)
    expect(forms).toContain('id="goals"')
  })

  it('leaves a Leader’s pages as they were: the Account menu, and none of the top nav', async () => {
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

      const head = header(html)
      expect(head).toContain('Account')
      expect(head).not.toContain('top-nav')
      expect(head).not.toContain('top-menu')
      expect(head).not.toContain('icon-btn')
      expect(head).not.toContain('initials-btn')
      expect(head).not.toContain('aria-label="Settings"')
    }
  })
})
