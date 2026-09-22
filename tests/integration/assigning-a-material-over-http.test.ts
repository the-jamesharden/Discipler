import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMaterial,
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * Assigning a Material, driven the way an Admin drives it (Materials, ticket
 * 03): the assign row at the foot of a folder's cards, and the Material field on
 * a group's card on Intake forms -- and what each changes where somebody else
 * reads it, on the Leader dashboard and on the group form's step three.
 */

describe.skipIf(skipUnlessAppIsRunning)('assigning a Material', () => {
  let ministry: MinistryFixture
  let cookie: string
  let pool: pg.Pool

  let leader: AccountFixture
  let oneToOne: string
  let running: { id: string }
  let waiting: { id: string }
  let romans: string
  let mark: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    cookie = (await signIn(ministry)).cookie
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    romans = await addMaterial(ministry, 'Romans', { body: 'Read Romans 1 together.' })
    mark = await addMaterial(ministry, 'Gospel of Mark reading plan', { body: 'Mark 1-2 this week.' })

    leader = await addPersonWithAccount(ministry, 'Karen Whitfield', 'leader')
    oneToOne = await pairOneToOne(ministry, leader.personId, await addPerson(ministry, 'Emily Johnson'))

    running = await formGroup(ministry, {
      name: "Tuesday women's group",
      declaredGender: 'female',
      leader: { name: 'Maria Garcia', gender: 'female' },
      disciples: [{ name: 'Tessa Pham', gender: 'female' }],
    })
    waiting = await formGroup(ministry, {
      name: 'Thursday evening group',
      declaredGender: 'female',
      leader: { name: 'Claire Delgado', gender: 'female' },
      disciples: [],
      acceptedAt: null,
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  /** A form POST, as the page sends one. */
  const post = async (path: string, fields: Record<string, string>) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  /** The page as an Admin sees it, without the flight payload after it. */
  const asRendered = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'))

  /** Every period on one relationship, oldest first. */
  const periodsOf = async (relationship: string) =>
    (
      await pool.query<{ material_id: string | null; ended_at: Date | null; assigned_by: string | null }>(
        `select material_id, ended_at, assigned_by
           from material_assignment
          where relationship_id = $1
          order by started_at, ended_at nulls last, (material_id is not null)`,
        [relationship],
      )
    ).rows

  const runningMaterialOf = async (relationship: string) =>
    (await periodsOf(relationship)).find((period) => period.ended_at === null)?.material_id ?? null

  const dashboard = async () => {
    const { cookie: theirs } = await signInAs(leader)
    return (await getPage('/relationships', theirs)).html
  }

  const stepThree = async () => {
    const query = new URLSearchParams({ step: '3', ageBand: '25-34', gender: 'female' })
    query.append('availability', 'monday:12')
    const response = await fetch(`${baseUrl}/intake/${ministry.id}?${query}`, { redirect: 'manual' })
    return response.text()
  }

  it('draws the assign row on the no-material folder, opening on "Choose a material…"', async () => {
    const page = await getPage('/materials/none', cookie)
    expect(page.response.status).toBe(200)
    const rendered = asRendered(page.html)

    expect(rendered).toContain('action="/materials/assign"')
    expect(rendered).toContain(`name="relationshipId" value="${oneToOne}"`)
    expect(rendered).toContain('Choose a material…')
    expect(rendered).toContain('>Assign</button>')
    // "No material" is not offered where everybody is on none already.
    expect(rendered).not.toContain('value="none">No material')
    // The leader's name is the only link on a card, and only to a Follow-Up item.
    expect(rendered).not.toMatch(/<a [^>]*class="rel-card/)
  })

  it('assigns from a card, starting now, under the Admin who pressed it', async () => {
    const before = Date.now()
    const { response, location } = await post('/materials/assign', {
      relationshipId: oneToOne,
      folder: 'none',
      materialId: romans,
    })
    expect(response.status).toBe(303)
    expect(new URL(location).pathname).toBe('/materials/none')

    const periods = await periodsOf(oneToOne)
    expect(periods.map((period) => period.material_id)).toEqual([null, romans])
    expect(periods[1]?.assigned_by).toBe(ministry.adminUserId)
    const { rows } = await pool.query<{ started_at: Date }>(
      `select started_at from material_assignment where relationship_id = $1 and ended_at is null`,
      [oneToOne],
    )
    expect(rows[0]!.started_at.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('shows the change on the Leader dashboard', async () => {
    const html = await dashboard()
    expect(html).toContain('Romans')
    expect(html).toContain('Read Romans 1 together.')
  })

  it("draws the row on a Material's folder with every live Material and No material, on the current one", async () => {
    const rendered = asRendered((await getPage(`/materials/${romans}`, cookie)).html)
    expect(rendered).toContain(`<option value="${romans}" selected="">Romans</option>`)
    expect(rendered).toContain(`<option value="${mark}">Gospel of Mark reading plan</option>`)
    expect(rendered).toContain('<option value="none">No material</option>')
    expect(rendered).toContain('>Save</button>')
  })

  it('swaps to another Material, keeping the filter on the way back', async () => {
    const { location } = await post('/materials/assign', {
      relationshipId: oneToOne,
      folder: romans,
      gender: 'female',
      materialId: mark,
    })
    const back = new URL(location)
    expect(back.pathname).toBe(`/materials/${romans}`)
    expect(back.searchParams.get('gender')).toBe('female')

    expect((await periodsOf(oneToOne)).map((period) => period.material_id)).toEqual([null, romans, mark])
    expect(await dashboard()).toContain('Mark 1-2 this week.')
  })

  it('refuses the Material already running, writes nothing, and says so', async () => {
    const { location } = await post('/materials/assign', {
      relationshipId: oneToOne,
      folder: mark,
      materialId: mark,
    })
    expect(new URL(location).searchParams.get('assignError')).toBe('material.already_running')
    expect(await periodsOf(oneToOne)).toHaveLength(3)

    const page = await getPage(`${new URL(location).pathname}${new URL(location).search}`, cookie)
    expect(asRendered(page.html)).toContain(
      'It is already working through that material, so nothing changed.',
    )
  })

  it('un-assigns with No material, as a later period with no Material in it', async () => {
    await post('/materials/assign', { relationshipId: oneToOne, folder: mark, materialId: 'none' })

    expect((await periodsOf(oneToOne)).map((period) => period.material_id)).toEqual([
      null,
      romans,
      mark,
      null,
    ])
    expect(await dashboard()).toContain('No material assigned yet')

    // Back in the dashed folder, with the swap and the un-assign on its history line.
    const rendered = asRendered((await getPage('/materials/none', cookie)).html)
    expect(rendered).toContain('Previously: No material')
    expect(rendered).toContain('Romans (')
  })

  it('refuses a Material that has been removed since the page was drawn', async () => {
    const gone = await addMaterial(ministry, 'Galatians')
    await pool.query(`update material set removed = now() where id = $1`, [gone])

    const { location } = await post('/materials/assign', {
      relationshipId: oneToOne,
      folder: 'none',
      materialId: gone,
    })
    expect(new URL(location).searchParams.get('assignError')).toBe('material.not_found')
    expect(await runningMaterialOf(oneToOne)).toBeNull()
  })

  it('draws the Material field on an accepted group, and the sentence on an unaccepted one', async () => {
    const rendered = asRendered((await getPage('/intake-forms', cookie)).html)

    expect(rendered).toContain(`id="material:${running.id}"`)
    expect(rendered).toContain('<option value="none" selected="">No material</option>')
    expect(rendered).toContain("Shown beneath the group&#x27;s name on the link, and on the leader&#x27;s dashboard.")

    expect(rendered).not.toContain(`id="material:${waiting.id}"`)
    expect(rendered).toContain(
      'A material can be assigned once Claire has accepted. The group is not on the link until then either.',
    )
  })

  it('assigns from the groups card in the same press as the name', async () => {
    const { location } = await post('/intake-forms/groups/configure', {
      relationshipId: running.id,
      name: "Tuesday women's group",
      materialId: romans,
    })
    expect(new URL(location).searchParams.get('configured')).toBe(running.id)
    expect(await runningMaterialOf(running.id)).toBe(romans)

    const rendered = asRendered((await getPage('/intake-forms', cookie)).html)
    expect(rendered).toContain(`<option value="${romans}" selected="">Romans</option>`)
    expect(rendered).toMatch(/Working through it since \d{1,2} [A-Z][a-z]{2} \d{4}\./)
  })

  it('writes nothing when the groups card is saved on the Material already running', async () => {
    const before = (await periodsOf(running.id)).length
    const { location } = await post('/intake-forms/groups/configure', {
      relationshipId: running.id,
      name: "Tuesday women's group",
      materialId: romans,
    })
    expect(new URL(location).searchParams.get('groupError')).toBeNull()
    expect(await periodsOf(running.id)).toHaveLength(before)
  })

  it('shows the title beneath the group on the form, and drops it after an un-assign', async () => {
    expect(await stepThree()).toContain('Working through Romans')

    await post('/intake-forms/groups/configure', {
      relationshipId: running.id,
      name: "Tuesday women's group",
      materialId: 'none',
    })
    expect(await runningMaterialOf(running.id)).toBeNull()

    const html = await stepThree()
    expect(html).toContain("Tuesday women&#x27;s group")
    expect(html).not.toContain('Working through')
  })

  it('refuses a Material for a group nobody has accepted, and writes no period', async () => {
    const { location } = await post('/intake-forms/groups/configure', {
      relationshipId: waiting.id,
      name: 'Thursday evening group',
      materialId: romans,
    })
    expect(new URL(location).searchParams.get('groupError')).toBe('material.relationship_not_accepted')
    expect(await periodsOf(waiting.id)).toEqual([])

    const rendered = asRendered((await getPage(`/intake-forms?groupError=material.relationship_not_accepted`, cookie)).html)
    expect(rendered).toContain('The name was saved. A material can be assigned once the leader has accepted.')
  })
})
