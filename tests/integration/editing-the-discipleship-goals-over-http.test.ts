import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The settings screen an Admin edits the list from, driven the way an Admin drives
 * it.
 *
 * The warning is the whole reason this suite exists. Three of the four edits cost
 * nobody anything and could be proved anywhere; removing takes answers off every
 * live surface for good -- history keeps them, but no screen an Admin has will
 * ever show them again -- and *the Admin is told before it happens* is a claim
 * about a screen and a second press. It cannot be proved at the boundary, which
 * has no page to warn anybody on.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Discipleship Goal settings', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
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
    return { response, location: response.headers.get('location') ?? '' }
  }

  /**
   * The page as an Admin sees it. Next serialises the whole query string into the
   * flight payload after `</main>` whatever a page does with it, so an assertion
   * that a screen says nothing about something has to be made against what it
   * rendered rather than against the whole response.
   */
  const asRendered = (html: string) =>
    html.slice(html.indexOf('<main>'), html.indexOf('</main>'))

  const theList = async (of: MinistryFixture = ministry) => {
    const { rows } = await pool.query<{ label: string }>(
      `select label from discipleship_goal where ministry_id = $1 order by position`,
      [of.id],
    )
    return rows.map((row) => row.label)
  }

  const optionCalled = async (label: string, of: MinistryFixture = ministry) => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 and label = $2`,
      [of.id, label],
    )
    const id = rows[0]?.id
    if (!id) throw new Error(`This Ministry offers no option called ${label}`)
    return id
  }

  it('shows the Ministry its own list, in its own order', async () => {
    const { cookie } = await signIn(ministry)

    const { html } = await getPage('/settings/goals', cookie)

    for (const label of await theList()) expect(html).toContain(label)
    // It is reachable from the screen an Admin is already on, or it is a page
    // nobody finds.
    const { html: roster } = await getPage('/roster', cookie)
    expect(roster).toContain('/settings/goals')
  })

  it('adds, rewords and reorders an option from the page', async () => {
    const { cookie } = await signIn(ministry)

    await post('/settings/goals/add', cookie, { label: 'Grief and loss' })
    expect(await theList()).toContain('Grief and loss')

    const added = await optionCalled('Grief and loss')
    await post('/settings/goals/rename', cookie, {
      goalId: added,
      label: 'Grief and bereavement',
    })
    expect(await theList()).toContain('Grief and bereavement')

    const before = await theList()
    await post('/settings/goals/move', cookie, { goalId: added, direction: 'up' })
    const after = await theList()
    expect(after[after.length - 2]).toBe('Grief and bereavement')
    expect(after[after.length - 1]).toBe(before[before.length - 2])
  })

  it('says why an edit was refused, in words rather than in a code', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await post('/settings/goals/add', cookie, {
      label: 'marriage AND family',
    })
    expect(location).toContain('error=goal.already_offered')

    const back = new URL(location)
    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(html).toContain('already offers an option worded like that')
  })

  it('says nothing at all about a refusal it does not recognise', async () => {
    const { cookie } = await signIn(ministry)

    // What arrives in the query string is whatever somebody typed there. The
    // screen renders its own wording from a code it knows, and renders nothing
    // from one it does not -- never the string it was handed.
    const { html } = await getPage(
      `/settings/goals?error=${encodeURIComponent('<b>anything at all</b>')}`,
      cookie,
    )

    expect(asRendered(html)).not.toContain('anything at all')
    expect(asRendered(html)).not.toContain('role="alert"')
  })

  it('still serves the page when the code names something every object has', async () => {
    const { cookie } = await signIn(ministry)

    // `__proto__`, `toString` and `valueOf` are all *in* a plain object without
    // being refusals, so a membership test that walked the prototype chain would
    // hand this page an object or a function to render and take the settings screen
    // down for anybody who followed a mangled link.
    for (const code of ['__proto__', 'toString', 'valueOf', 'constructor']) {
      const { response, html } = await getPage(`/settings/goals?error=${code}`, cookie)

      expect(response.status).toBe(200)
      expect(asRendered(html)).toContain('Discipleship Goals')
      expect(asRendered(html)).not.toContain('role="alert"')
    }
  })

  it('warns how many people chose an option, and removes nothing yet', async () => {
    const { cookie } = await signIn(ministry)

    const goal = await optionCalled('Healing and recovery')
    await addPerson(ministry, 'Nadia Farouk', { phone: number(), answers: { goalId: goal } })
    await addPerson(ministry, 'Omar Haddad', { phone: number(), answers: { goalId: goal } })

    // Pressing Remove opens the warning. It is a link, and reaching this page has
    // removed nothing.
    const { html } = await getPage(`/settings/goals?removing=${goal}`, cookie)

    expect(html).toContain('2 people have chosen')
    expect(html).toContain('Healing and recovery')
    expect(html).toContain('loses their answers for good')
    expect(await theList()).toContain('Healing and recovery')
  })

  it('does nothing until the Admin confirms, even when the form says otherwise', async () => {
    const { cookie } = await signIn(ministry)
    const goal = await optionCalled('Healing and recovery')

    // A post naming the option and nothing else -- a stale form, a copied link, a
    // second tab. It lands on the warning rather than on the removal.
    const { location } = await post('/settings/goals/remove', cookie, { goalId: goal })

    expect(location).toContain(`removing=${goal}`)
    expect(await theList()).toContain('Healing and recovery')
  })

  it('removes it once the Admin has confirmed, and loses those answers', async () => {
    const { cookie } = await signIn(ministry)
    const goal = await optionCalled('Healing and recovery')

    await post('/settings/goals/remove', cookie, { goalId: goal, confirm: 'yes' })

    expect(await theList()).not.toContain('Healing and recovery')

    // The answers that pointed at it are blanked, and the people are still on the
    // Roster with their availability intact.
    const { rows } = await pool.query<{ status: string; goal: string | null }>(
      `select participation_status(p) as status,
              (select i.discipleship_goal_id from intake_submission i
                where i.person_id = p.id
                order by i.submitted_at desc, i.created_at desc, i.id desc
                limit 1) as goal
         from person p
        where p.ministry_id = $1 and p.full_name in ('Nadia Farouk', 'Omar Haddad')`,
      [ministry.id],
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.goal).toBeNull()
      expect(row.status).toBe('ready_to_pair')
    }
  })

  it('offers no way to remove the last option, and says why', async () => {
    const alone = await createMinistryWithAdmin('Northgate Fellowship')
    const { cookie } = await signIn(alone)

    for (const label of (await theList(alone)).slice(0, -1)) {
      await post('/settings/goals/remove', cookie, {
        goalId: await optionCalled(label, alone),
        confirm: 'yes',
      })
    }
    const last = (await theList(alone))[0]!

    const { html } = await getPage('/settings/goals', cookie)
    expect(html).toContain('The only option left')

    // And the refusal is not merely a control that was not rendered: the post an
    // Admin could still make is refused, and says so.
    const { location } = await post('/settings/goals/remove', cookie, {
      goalId: await optionCalled(last, alone),
      confirm: 'yes',
    })
    expect(location).toContain('error=goal.last_one')
    expect(await theList(alone)).toEqual([last])
  })

  it('shows an Admin their own Ministry’s list and never another’s', async () => {
    const other = await createMinistryWithAdmin('Westhill Church')
    await post('/settings/goals/add', (await signIn(other)).cookie, {
      label: 'Something only Westhill offers',
    })

    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/settings/goals', cookie)

    expect(html).toContain(ministry.name)
    expect(html).not.toContain('Something only Westhill offers')
  })
})
