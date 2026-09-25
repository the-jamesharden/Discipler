import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMaterial,
  addPerson,
  assignMaterial,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * Assigning one Material to many relationships, driven the way an Admin drives
 * it (Richer materials, ticket 02; M-3 of `.lavish/richer-materials/mockup.html`):
 * **Assign to more** in the folder's head, the page it opens, one press that
 * starts every ticked relationship on the Material, and the press refused whole
 * when one of them ended while the page was open.
 */

describe.skipIf(skipUnlessAppIsRunning)('assigning a Material to many relationships at once', () => {
  let ministry: MinistryFixture
  let cookie: string
  let pool: pg.Pool

  let romans: string
  let mark: string
  let first: string
  let second: string
  let onMark: string
  let alreadyOnRomans: string
  let womensGroup: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    cookie = (await signIn(ministry)).cookie
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    romans = await addMaterial(ministry, 'Romans', { body: 'Read Romans 8 together.' })
    mark = await addMaterial(ministry, 'Gospel of Mark', { body: 'Mark 1-2 this week.' })

    const man = (name: string) => addPerson(ministry, name, { answers: { gender: 'male' } })
    first = await pairOneToOne(ministry, await man('Cole Alvarez'), await man('Marcus Boyd'))
    second = await pairOneToOne(ministry, await man('Daniel Park'), await man('Jordan Bailey'))
    onMark = await pairOneToOne(ministry, await man('David Chen'), await man('Tom Wilson'))
    await assignMaterial(onMark, mark, ministry.adminUserId)
    alreadyOnRomans = await pairOneToOne(ministry, await man('Luke Grant'), await man('Owen Hale'))
    await assignMaterial(alreadyOnRomans, romans, ministry.adminUserId)

    womensGroup = (
      await formGroup(ministry, {
        name: 'Tuesday women',
        declaredGender: 'female',
        leader: { name: 'Bethany Davis', gender: 'female' },
        disciples: [
          { name: 'Tessa Pham', gender: 'female' },
          { name: 'Kendra Lowe', gender: 'female' },
        ],
      })
    ).id
  })

  afterAll(async () => {
    await pool.end()
  })

  /** A form POST, as the page sends one, with every ticked box as its own field. */
  const post = async (path: string, fields: readonly (readonly [string, string])[]) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields.map(([name, value]) => [name, value])),
    })
    return { response, location: new URL(response.headers.get('location') ?? '/', baseUrl) }
  }

  const ticking = (...relationships: string[]) =>
    relationships.map((id) => ['relationshipId', id] as const)

  /**
   * The page as an Admin sees it, without the flight payload after it, and
   * without the empty comments React puts between two runs of text.
   */
  const asRendered = (html: string) =>
    html.slice(html.indexOf('<main'), html.indexOf('</main>')).replaceAll('<!-- -->', '')

  /** Every period on one relationship, oldest first. */
  const materialsOf = async (relationship: string) =>
    (
      await pool.query<{ material_id: string | null }>(
        `select material_id from material_assignment
          where relationship_id = $1
          order by started_at, ended_at nulls last, (material_id is not null)`,
        [relationship],
      )
    ).rows.map((row) => row.material_id)

  const assignedEventsOf = async (relationship: string) =>
    (
      await pool.query<{ payload: { materialId: string | null; assignedBy: string } }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'relationship.material_assigned'`,
        [relationship],
      )
    ).rows.map((row) => row.payload)

  it("puts Assign to more in the Material's folder head, beside Edit this material, keeping the filter", async () => {
    const rendered = asRendered((await getPage(`/materials/${romans}?gender=male`, cookie)).html)
    expect(rendered).toContain(`href="/materials/${romans}/assign?gender=male">Assign to more</a>`)
    expect(rendered).toContain(`href="/materials/${romans}/edit">Edit this material</a>`)
    expect(rendered).toContain('1 relationship working through it now')
  })

  it('lists everyone not already on it, on no material first, then by the material they are on', async () => {
    const page = await getPage(`/materials/${romans}/assign`, cookie)
    expect(page.response.status).toBe(200)
    const rendered = asRendered(page.html)

    expect(rendered).toContain('Assign Romans to more relationships')
    expect(rendered).toContain(
      'Each one ticked starts on it now. Whatever it was working through ends today and stays in its history. Everyone in it hears about the change, at most once a day.',
    )
    const noMaterial = rendered.indexOf('On no material · 3')
    const onGospel = rendered.indexOf('On Gospel of Mark · 1')
    expect(noMaterial).toBeGreaterThan(-1)
    expect(onGospel).toBeGreaterThan(noMaterial)

    for (const listed of [first, second, womensGroup]) {
      const at = rendered.indexOf(`value="${listed}"`)
      expect(at).toBeGreaterThan(noMaterial)
      expect(at).toBeLessThan(onGospel)
    }
    expect(rendered.indexOf(`value="${onMark}"`)).toBeGreaterThan(onGospel)
    expect(rendered).not.toContain(`value="${alreadyOnRomans}"`)

    expect(rendered).toContain('Cole Alvarez <span>with Marcus Boyd</span>')
    expect(rendered).toContain('Tuesday women <span>led by Bethany Davis</span>')
    expect(rendered).toMatch(/Group of 2 · started \d{1,2} [A-Z][a-z]{2} \d{4}/)
    expect(rendered).toMatch(/One-to-one · on Gospel of Mark since \d{1,2} [A-Z][a-z]{2} \d{4}/)
    expect(rendered).toContain('<span class="pill healthy">Healthy</span>')
    // Before script counts, the button promises no number and is not disabled.
    expect(rendered).toMatch(/<button type="submit">Assign Romans to the ticked relationships<\/button>/)
    expect(rendered).toContain(`action="/materials/${romans}/assign/save"`)
  })

  it("keeps the filter's relationships only, and carries it on the form", async () => {
    const rendered = asRendered((await getPage(`/materials/${romans}/assign?gender=female`, cookie)).html)
    expect(rendered).toContain('On no material · 1')
    expect(rendered).toContain(`value="${womensGroup}"`)
    expect(rendered).not.toContain(`value="${first}"`)
    expect(rendered).not.toContain('On Gospel of Mark')
    expect(rendered).toContain('<input type="hidden" name="gender" value="female"/>')
    expect(rendered).toContain(`aria-current="true" href="/materials/${romans}/assign?gender=female">Women`)
  })

  it('refuses a press with nothing ticked, and says so', async () => {
    const { response, location } = await post(`/materials/${romans}/assign/save`, [['gender', 'male']])
    expect(response.status).toBe(303)
    expect(location.pathname).toBe(`/materials/${romans}/assign`)
    expect(location.searchParams.get('assignError')).toBe('material.none_ticked')
    expect(location.searchParams.get('gender')).toBe('male')

    const rendered = asRendered((await getPage(`${location.pathname}${location.search}`, cookie)).html)
    expect(rendered).toContain('Tick at least one relationship to assign it to.')
  })

  it('assigns three at once, each with its own period and event, and the folder shows the new count', async () => {
    const { response, location } = await post(
      `/materials/${romans}/assign/save`,
      ticking(first, second, onMark),
    )
    expect(response.status).toBe(303)
    expect(location.pathname).toBe(`/materials/${romans}`)
    expect(location.searchParams.get('assignError')).toBeNull()

    expect(await materialsOf(first)).toEqual([null, romans])
    expect(await materialsOf(second)).toEqual([null, romans])
    expect(await materialsOf(onMark)).toEqual([null, mark, romans])
    for (const relationship of [first, second]) {
      expect(await assignedEventsOf(relationship)).toEqual([
        { materialId: romans, assignedBy: ministry.adminUserId },
      ])
    }

    const folder = asRendered((await getPage(location.pathname, cookie)).html)
    expect(folder).toContain('4 relationships working through it now')

    // And off the page they were assigned from, with only the group left on it.
    const page = asRendered((await getPage(`/materials/${romans}/assign`, cookie)).html)
    expect(page).toContain('On no material · 1')
    expect(page).not.toContain('On Gospel of Mark')
  })

  it('refuses the lot when one ended between load and press, and names it', async () => {
    const man = (name: string) => addPerson(ministry, name, { answers: { gender: 'male' } })
    const staying = await pairOneToOne(ministry, await man('Samuel Reyes'), await man('Ethan Moore'))
    const ending = await pairOneToOne(ministry, await man('Nathan Price'), await man('Caleb Ford'))

    const before = asRendered((await getPage(`/materials/${romans}/assign`, cookie)).html)
    expect(before).toContain(`value="${ending}"`)

    // Ended in another tab, through the product's own act.
    const ended = await post('/follow-up/relationship/end', [
      ['relationshipId', ending],
      ['outcome', 'discontinued'],
      ['reason', 'Moved away'],
    ])
    expect(ended.response.status).toBe(303)

    const { location } = await post(
      `/materials/${romans}/assign/save`,
      ticking(staying, ending, womensGroup),
    )
    expect(location.pathname).toBe(`/materials/${romans}/assign`)
    expect(location.searchParams.get('assignError')).toBe('material.relationship_ended')
    expect(location.searchParams.get('refused')).toBe(ending)

    // Nothing for anybody: the one ticked before it and the one after it too.
    expect(await materialsOf(staying)).toEqual([null])
    expect(await materialsOf(womensGroup)).toEqual([null])
    expect(await assignedEventsOf(staying)).toEqual([])

    const after = asRendered((await getPage(`${location.pathname}${location.search}`, cookie)).html)
    expect(after).toContain(
      'Nothing was assigned. Nathan Price with Caleb Ford has ended since this page was opened, so it is no longer listed. Tick the others again to assign them.',
    )
    expect(after).toContain(`value="${staying}"`)
    expect(after).not.toContain(`value="${ending}"`)
  })

  it("names nobody for a relationship that is not this Ministry's", async () => {
    const other = await createMinistryWithAdmin('The Chapel Next Door')
    const theirs = await pairOneToOne(other, await addPerson(other, 'Ann Other'), await addPerson(other, 'Bea Other'))

    const rendered = asRendered(
      (
        await getPage(
          `/materials/${romans}/assign?assignError=material.relationship_not_found&refused=${theirs}`,
          cookie,
        )
      ).html,
    )
    expect(rendered).toContain('Nothing was assigned. One of the ticked relationships is not on this Roster any more')
    expect(rendered).not.toContain('Ann Other')
  })
})
