import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upcomingOfficeHours } from '~/domain/office-hours'
import { readPageDocument, resolutionOf } from '~/platform/supabase/page'
import { NEXT_OFFICE_HOURS } from '../../app/help/office-hours'
import { WHATS_NEW } from '../../app/help/whats-new'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  signInAs as signInToSupabase,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The What's new and office hours cards at the top of Overview, and the Help menu's two
 * items that follow them (Exponential launch, ticket 30).
 *
 * Over HTTP because the rule is about what one Admin sees and another does not: pressing
 * the close button on the card hides it for them alone, and the tag in the menu on every
 * page goes with it.
 */

const ENTRY = WHATS_NEW[0]!
const CARD = 'class="news-card"'

/** The Help menu, from its summary to the end of its `details`. */
const helpMenu = (html: string) => {
  const summary = html.indexOf('aria-label="Help and feedback"')
  return html.slice(summary, html.indexOf('</details>', summary))
}

const dismiss = async (cookie: string, fields: Record<string, string>) =>
  fetch(`${baseUrl}/overview/whats-new/dismiss`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })

describe.skipIf(skipUnlessAppIsRunning)('What’s new and office hours on the Overview', () => {
  let pool: pg.Pool
  let riverside: MinistryFixture
  let second: AccountFixture
  let leader: AccountFixture
  let northgate: MinistryFixture

  const dismissals = async (ministry: MinistryFixture) =>
    (
      await pool.query<{ user_id: string; entry_id: string }>(
        'select user_id, entry_id from whats_new_dismissal where ministry_id = $1',
        [ministry.id],
      )
    ).rows

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    riverside = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
    second = await addPersonWithAccount(riverside, 'Tom Halloran', 'admin')
    leader = await addPersonWithAccount(riverside, 'Lena Marsh', 'leader')
    northgate = await createMinistryWithAdmin('Northgate')
  })

  afterAll(async () => {
    await pool.end()
  })

  it('shows the launch entry above the numbers, and tags the Help menu’s item', async () => {
    const { html, response } = await getPage('/overview', (await signIn(riverside)).cookie)

    expect(response.status).toBe(200)
    expect(html).toContain(ENTRY.title)
    expect(html).toContain('⌘K')
    expect(html.indexOf(CARD)).toBeGreaterThan(-1)
    expect(html.indexOf(CARD)).toBeLessThan(html.indexOf('class="stats"'))
    expect(helpMenu(html)).toMatch(/href="\/help\/whats-new"[^>]*>.*What&#x27;s new.*<span class="top-menu-tag">New<\/span>/s)
  })

  it('hides a dismissed entry for that Admin alone, on every page, and for good', async () => {
    const graceCookie = (await signIn(riverside)).cookie
    const tomCookie = (await signInAs(second)).cookie
    const northgateCookie = (await signIn(northgate)).cookie

    const pressed = await dismiss(graceCookie, { entry: ENTRY.id })
    expect(pressed.status).toBe(303)
    expect(new URL(pressed.headers.get('location')!).pathname).toBe('/overview')

    const grace = await getPage('/overview', graceCookie)
    expect(grace.html).not.toContain(CARD)
    expect(grace.html).not.toContain(ENTRY.title)
    expect(helpMenu(grace.html)).toContain('href="/help/whats-new"')
    expect(helpMenu(grace.html)).not.toContain('top-menu-tag')

    // The tag follows on a page that has no card.
    expect(helpMenu((await getPage('/roster', graceCookie)).html)).not.toContain('top-menu-tag')

    // Another Admin of the same church, and an Admin of another, still have it.
    for (const cookie of [tomCookie, northgateCookie]) {
      const { html } = await getPage('/overview', cookie)
      expect(html).toContain(ENTRY.title)
      expect(helpMenu(html)).toContain('top-menu-tag')
    }

    // A fresh sign-in is the same Admin.
    expect((await getPage('/overview', (await signIn(riverside)).cookie)).html).not.toContain(CARD)
  })

  it('treats a second press as the first, as a double click or a second tab sends', async () => {
    const church = await createMinistryWithAdmin('Two presses')
    const { cookie } = await signIn(church)

    expect((await dismiss(cookie, { entry: ENTRY.id })).status).toBe(303)
    expect((await dismiss(cookie, { entry: ENTRY.id })).status).toBe(303)

    expect(await dismissals(church)).toEqual([{ user_id: church.adminUserId, entry_id: ENTRY.id }])
  })

  it('stores nothing for an id the file does not hold', async () => {
    const church = await createMinistryWithAdmin('An odd id')
    const { cookie } = await signIn(church)

    const pressed = await dismiss(cookie, { entry: 'not-an-entry' })

    expect(pressed.status).toBe(303)
    expect(await dismissals(church)).toEqual([])
  })

  it('lands back on the growth chart the Admin was reading, and on nothing from outside', async () => {
    const church = await createMinistryWithAdmin('Reading the chart')
    const { cookie } = await signIn(church)

    const kept = await dismiss(cookie, { entry: ENTRY.id, growth: 'groups', by: 'months' })
    const location = new URL(kept.headers.get('location')!)
    expect(location.pathname).toBe('/overview')
    expect(location.searchParams.get('growth')).toBe('groups')
    expect(location.searchParams.get('by')).toBe('months')

    const typed = await dismiss(cookie, { entry: ENTRY.id, growth: 'https://example.com', back: 'https://example.com' })
    expect(new URL(typed.headers.get('location')!).pathname).toBe('/overview')
    expect(typed.headers.get('location')).not.toContain('example.com')
  })

  it('takes nothing from a Leader or from nobody at all', async () => {
    const before = await dismissals(riverside)

    const fromLeader = await dismiss((await signInAs(leader)).cookie, { entry: ENTRY.id })
    expect(fromLeader.status).toBe(303)
    expect(new URL(fromLeader.headers.get('location')!).pathname).toBe('/login')

    const fromNobody = await dismiss('', { entry: ENTRY.id })
    expect(fromNobody.status).toBe(303)
    expect(new URL(fromNobody.headers.get('location')!).pathname).toBe('/login')

    expect(await dismissals(riverside)).toEqual(before)
  })

  it('gives a Leader no card and no Help menu', async () => {
    const { html } = await getPage('/relationships', (await signInAs(leader)).cookie)

    expect(html).not.toContain(CARD)
    expect(html).not.toContain('aria-label="Help and feedback"')
  })

  it('draws the office hours card and the Help menu’s item only as the file says', async () => {
    const church = await createMinistryWithAdmin('Whatever the file says')
    const { cookie } = await signIn(church)
    const upcoming = upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date())

    const overview = await getPage('/overview', cookie)
    const roster = await getPage('/roster', cookie)

    expect(overview.html.includes('id="office-hours"')).toBe(upcoming !== null)
    expect(overview.html.includes('Join on Zoom')).toBe(upcoming !== null)
    for (const { html } of [overview, roster]) {
      expect(helpMenu(html).includes('Office hours')).toBe(upcoming !== null)
    }
  })

  it('takes away the whole row once the Admin has closed the last card there is', async () => {
    const church = await createMinistryWithAdmin('Nothing left')
    const { cookie } = await signIn(church)
    for (const { id } of WHATS_NEW) await dismiss(cookie, { entry: id })

    const { html } = await getPage('/overview', cookie)

    expect(html.includes('class="news-row"')).toBe(upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date()) !== null)
  })

  it('opens the entries from the Help menu, on a page that reads no session', async () => {
    const { html, response } = await getPage('/help/whats-new', '')

    expect(response.status).toBe(200)
    expect(html).toContain(ENTRY.title)
    expect(html).toContain(ENTRY.sentence)
  })
})

describe('the Admin’s dismissals in the page session', () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const closed = (ministry: MinistryFixture, userId: string, entry: string) =>
    pool.query(
      `insert into whats_new_dismissal (ministry_id, user_id, entry_id, dismissed_at) values ($1, $2, $3, now())`,
      [ministry.id, userId, entry],
    )

  it('come with the one read, as this Admin’s own and nobody else’s', async () => {
    const church = await createMinistryWithAdmin('Dismissals in the session')
    const other = await addPersonWithAccount(church, 'Tom Halloran', 'admin')
    await closed(church, church.adminUserId, 'one')
    await closed(church, church.adminUserId, 'two')
    await closed(church, other.userId, 'three')

    const session = await signInToSupabase(church)
    const resolution = resolutionOf(await readPageDocument(session, 'signed_in_admin'))

    expect(resolution.status === 'admin' && resolution.admin.whatsNewDismissed).toEqual(['one', 'two'])
    // Row-level security says the same as the function does.
    const { data, error } = await session.from('whats_new_dismissal').select('entry_id').order('entry_id')
    expect(error).toBeNull()
    expect(data).toEqual([{ entry_id: 'one' }, { entry_id: 'two' }])
  })

  it('are empty, not missing, for an Admin who has closed nothing', async () => {
    const church = await createMinistryWithAdmin('Closed nothing')
    const doc = await readPageDocument(await signInToSupabase(church), 'signed_in_admin')

    expect((doc.admin as { whats_new_dismissed: unknown }).whats_new_dismissed).toEqual([])
  })

  it('cannot be written from a signed-in session, and go with the membership', async () => {
    const church = await createMinistryWithAdmin('Writes go through the command boundary')
    const other = await addPersonWithAccount(church, 'Tom Halloran', 'admin')
    const session = await signInWith(other)

    const { error } = await session
      .from('whats_new_dismissal')
      .insert({ ministry_id: church.id, user_id: other.userId, entry_id: 'sneaked', dismissed_at: new Date().toISOString() })
    expect(error).not.toBeNull()

    await closed(church, other.userId, 'one')
    await pool.query('update person set user_id = null where user_id = $1', [other.userId])
    await pool.query('delete from ministry_member where ministry_id = $1 and user_id = $2', [church.id, other.userId])
    const { rows } = await pool.query('select 1 from whats_new_dismissal where user_id = $1', [other.userId])
    expect(rows).toEqual([])
  })
})
