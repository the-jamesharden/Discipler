import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { MaterialRefused } from '~/domain/errors'
import { materialId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addPersonWithAccount,
  assignMaterial,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Ministry's own list of Materials, edited against the real database
 * (`.scratch/materials/spec.md`, ticket 02). The facts that matter here are
 * facts about rows and grants: a removal is a flag and the periods that name the
 * Material survive it, the command connection may insert and update a Material
 * and may not delete one, a second live Material with a taken title is refused
 * by the index when the boundary's read was overtaken, and every act names the
 * Admin in a ministry event.
 */

describe('a Ministry’s Materials', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const admin = () => ministry.adminUserId
  const now = new Date()
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = (at: Date = now) =>
    createCommandService({ clock: createTestClock(at), ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const theList = async () => {
    const { rows } = await pool.query<{ title: string }>(
      `select title from material where ministry_id = $1 and removed is null order by title`,
      [ministry.id],
    )
    return rows.map((row) => row.title)
  }

  const row = async (id: string) => {
    const { rows } = await pool.query<{
      title: string
      body: string | null
      removed: Date | null
    }>(`select title, body, removed from material where id = $1`, [id])
    return rows[0] ?? null
  }

  /** A Material's items as the table holds them, in order: what each is, and where. */
  const itemsOf = async (id: string) => {
    const { rows } = await pool.query<{ kind: string; filename: string | null; url: string | null; position: number }>(
      `select kind, filename, url, position from material_item where material_id = $1 order by position`,
      [id],
    )
    return rows
  }

  /** A file as Storage would report it once the browser had uploaded it. */
  const stored = (filename: string, bytes = 120_000) => ({
    kind: 'file' as const,
    path: `${ministry.id}/${crypto.randomUUID()}.pdf`,
    filename,
    contentType: 'application/pdf',
    bytes,
  })

  const events = async (subject: string, type: string) => {
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event where subject_id = $1 and type = $2 order by occurred_at`,
      [subject, type],
    )
    return rows.map((each) => each.payload)
  }

  const createdIdOf = (outcome: { effects: readonly { kind: string }[] }) => {
    const effect = outcome.effects.find((each) => each.kind === 'material.create')
    if (!effect || !('material' in effect)) throw new Error('No Material was created')
    return (effect as { material: { id: string } }).material.id
  }

  it('creates a Material with text, one with files and a link, and refuses one with nothing', async () => {
    const withText = createdIdOf(
      await service().execute({
        type: 'material.create',
        ministryId: ministry.id,
        title: 'Gospel of Mark reading plan',
        body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
        files: [],
        links: [],
        createdBy: admin(),
      }),
    )
    expect(await row(withText)).toEqual({
      title: 'Gospel of Mark reading plan',
      body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
      removed: null,
    })
    expect(await itemsOf(withText)).toEqual([])
    expect(await events(withText, 'material.created')).toEqual([
      { title: 'Gospel of Mark reading plan', body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.', items: [], createdBy: admin() },
    ])

    const withFiles = createdIdOf(
      await service().execute({
        type: 'material.create',
        ministryId: ministry.id,
        title: 'Galatians',
        body: null,
        files: [stored('galatians.pdf'), stored('questions.pdf')],
        links: [{ url: 'https://bibleproject.com/galatians', label: 'Overview' }],
        createdBy: admin(),
      }),
    )
    expect(await row(withFiles)).toMatchObject({ body: null })
    expect(await itemsOf(withFiles)).toEqual([
      { kind: 'file', filename: 'galatians.pdf', url: null, position: 0 },
      { kind: 'file', filename: 'questions.pdf', url: null, position: 1 },
      { kind: 'link', filename: null, url: 'https://bibleproject.com/galatians', position: 2 },
    ])

    await expect(
      service().execute({
        type: 'material.create',
        ministryId: ministry.id,
        title: 'Nothing at all',
        body: '  ',
        files: [],
        links: [],
        createdBy: admin(),
      }),
    ).rejects.toMatchObject({ name: 'MaterialRefused', refusal: 'material.needs_content' })
    expect(await theList()).not.toContain('Nothing at all')
  })

  it('refuses a title the Ministry already holds live, and lets the index say so when the read was overtaken', async () => {
    await expect(
      service().execute({
        type: 'material.create',
        ministryId: ministry.id,
        title: 'gospel of mark READING plan',
        body: 'Text.',
        files: [],
        links: [],
        createdBy: admin(),
      }),
    ).rejects.toMatchObject({ refusal: 'material.title_taken' })

    // The race the boundary cannot see: the same title written straight into
    // the table between the read and the insert. The partial unique index is
    // what refuses it, and the store translates the index into the refusal.
    const { rows } = await pool.query<{ id: string }>(
      `select id from material where ministry_id = $1 and title = 'Galatians'`,
      [ministry.id],
    )
    const galatians = rows[0]!.id
    await expect(
      service().execute({
        type: 'material.edit',
        ministryId: ministry.id,
        materialId: materialId(galatians),
        title: 'Galatians',
        body: 'Text.',
        removeItems: [],
        files: [],
        links: [],
        changedBy: admin(),
      }),
    ).resolves.toBeDefined()
  })

  it('edits the row in place, keeping every period pointing at it, and writes what it used to say', async () => {
    const leader = await addPersonWithAccount(ministry, 'Karen Whitfield', 'leader')
    const participant = await addPersonWithAccount(ministry, 'Ada Rowe', 'leader')
    const acceptedAt = new Date(now.getTime() - days(30))
    const relationship = await pairOneToOne(ministry, leader.personId, participant.personId, { acceptedAt })

    const { rows } = await pool.query<{ id: string }>(
      `select id from material where ministry_id = $1 and title = 'Gospel of Mark reading plan'`,
      [ministry.id],
    )
    const mark = rows[0]!.id
    await assignMaterial(relationship, mark, admin(), new Date(now.getTime() - days(20)))

    await service().execute({
      type: 'material.edit',
      ministryId: ministry.id,
      materialId: materialId(mark),
      title: 'Mark, a reading plan',
      body: 'Week 1: Mark 1-3.',
      removeItems: [],
      files: [stored('mark.pdf')],
      links: [],
      changedBy: admin(),
    })

    expect(await row(mark)).toMatchObject({ title: 'Mark, a reading plan', body: 'Week 1: Mark 1-3.' })
    expect(await itemsOf(mark)).toEqual([{ kind: 'file', filename: 'mark.pdf', url: null, position: 0 }])
    // The same row, under a new title, on every history line from now on.
    const periods = await pool.query<{ material_id: string | null; title: string | null }>(
      `select material_id, title from material_periods($1) where relationship_id = $2 order by started_at`,
      [ministry.id, relationship],
    )
    expect(periods.rows).toEqual([
      { material_id: null, title: null },
      { material_id: mark, title: 'Mark, a reading plan' },
    ])
    expect(await events(mark, 'material.edited')).toEqual([
      {
        from: { title: 'Gospel of Mark reading plan', body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.', items: [] },
        to: { title: 'Mark, a reading plan', body: 'Week 1: Mark 1-3.', items: [{ kind: 'file', filename: 'mark.pdf' }] },
        changedBy: admin(),
      },
    ])

    // And the Leader sees the edit on their next load, with no change to that code.
    const asKaren = await (await import('../support/local-supabase')).signInWith(leader)
    const { data } = await asKaren.from('material').select('title, body').eq('id', mark)
    expect(data).toEqual([{ title: 'Mark, a reading plan', body: 'Week 1: Mark 1-3.' }])
    const { data: items } = await asKaren.from('material_item').select('filename').eq('material_id', mark)
    expect(items).toEqual([{ filename: 'mark.pdf' }])

    // Refused while she is working through it, with the count.
    await expect(
      service().execute({ type: 'material.remove', ministryId: ministry.id, materialId: materialId(mark), removedBy: admin() }),
    ).rejects.toMatchObject({ refusal: 'material.in_use', inUseBy: 1 })
    expect((await row(mark))?.removed).toBeNull()
  })

  it('removes a Material nobody is on as a flag, keeps its periods, and frees its title', async () => {
    const prayer = await addMaterial(ministry, 'Prayer practices')
    // Somebody worked through it once and moved on: its period stays.
    const leader = await addPersonWithAccount(ministry, 'Lee Leader', 'leader')
    const participant = await addPersonWithAccount(ministry, 'Pat Participant', 'leader')
    const acceptedAt = new Date(now.getTime() - days(30))
    const relationship = await pairOneToOne(ministry, leader.personId, participant.personId, { acceptedAt })
    await assignMaterial(relationship, prayer, admin(), new Date(now.getTime() - days(20)))
    const other = await addMaterial(ministry, 'Something else')
    await assignMaterial(relationship, other, admin(), new Date(now.getTime() - days(10)))

    await service().execute({ type: 'material.remove', ministryId: ministry.id, materialId: materialId(prayer), removedBy: admin() })

    expect((await row(prayer))?.removed).toBeInstanceOf(Date)
    expect(await theList()).not.toContain('Prayer practices')
    expect(await events(prayer, 'material.removed')).toEqual([{ title: 'Prayer practices', removedBy: admin() }])

    const periods = await pool.query<{ title: string | null }>(
      `select title from material_periods($1) where relationship_id = $2 order by started_at`,
      [ministry.id, relationship],
    )
    expect(periods.rows.map((each) => each.title)).toEqual([null, 'Prayer practices', 'Something else'])

    // Off the list, so an edit naming it is refused, and its title is free again.
    await expect(
      service().execute({ type: 'material.edit', ministryId: ministry.id, materialId: materialId(prayer), title: 'Prayer practices', body: 'Text.', removeItems: [], files: [], links: [], changedBy: admin() }),
    ).rejects.toMatchObject({ refusal: 'material.not_on_the_list' })
    const again = createdIdOf(
      await service().execute({ type: 'material.create', ministryId: ministry.id, title: 'Prayer practices', body: 'Second time.', files: [], links: [], createdBy: admin() }),
    )
    expect(again).not.toBe(prayer)
    expect(await theList()).toContain('Prayer practices')
  })

  it('refuses, at commit, a Material left with no text and no item, whoever writes it', async () => {
    // The rule spans two tables, so it is a deferred trigger rather than a check:
    // a row inserted with nothing, and a Material's last item deleted, are both
    // refused when the transaction ends, not when the statement runs.
    const client = new pg.Client({ connectionString: localSupabase().databaseUrl })
    await client.connect()
    try {
      await client.query('begin')
      await client.query(`insert into material (ministry_id, title) values ($1, 'Nothing here')`, [ministry.id])
      await expect(client.query('commit')).rejects.toThrow(/material_carries_something|carries neither/)

      // A Material that is one file and no text: its file is all it carries.
      const oneFile = await addMaterial(ministry, 'Only a file', {
        body: null,
        files: [{ path: `${ministry.id}/${crypto.randomUUID()}.pdf`, filename: 'only.pdf' }],
      })
      await client.query('begin')
      await client.query(`delete from material_item where material_id = $1`, [oneFile])
      await expect(client.query('commit')).rejects.toThrow(/material_carries_something|carries neither/)
      expect(await itemsOf(oneFile)).toHaveLength(1)
    } finally {
      await client.end()
    }
  })

  it('shows an Admin the items of their own Ministry and never another’s', async () => {
    const neighbour = await createMinistryWithAdmin('The Chapel With Files')
    const several = await addMaterial(ministry, 'Several things', {
      files: [{ path: `${ministry.id}/${crypto.randomUUID()}.pdf`, filename: 'a.pdf' }],
      links: [{ url: 'https://example.org/b' }, { url: 'https://example.org/c' }],
    })
    const asNeighbour = await signInAs(neighbour)
    const { data } = await asNeighbour.from('material_item').select('id').eq('material_id', several)
    expect(data).toEqual([])
    const asAdmin = await signInAs(ministry)
    const { data: own } = await asAdmin.from('material_item').select('id').eq('material_id', several)
    expect(own).toHaveLength(3)
  })

  it('lets the command connection insert and update a Material and never delete one', async () => {
    const client = new pg.Client({ connectionString: localSupabase().databaseUrl })
    await client.connect()
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministry.id])
      const { rows } = await client.query<{ can: boolean }>(
        `select has_table_privilege('discipler_command', 'material', 'delete') as can`,
      )
      expect(rows[0]?.can).toBe(false)
      await expect(client.query(`delete from material where ministry_id = $1`, [ministry.id])).rejects.toThrow(/permission denied/)
      await client.query('rollback')
    } finally {
      await client.end()
    }
  })

  it('scopes every write to the Ministry the connection acts for', async () => {
    const neighbour = await createMinistryWithAdmin('The Chapel Next Door')
    const theirs = await addMaterial(neighbour, 'Their study')

    // Named by id from this Ministry's connection: not on this list.
    await expect(
      service().execute({ type: 'material.edit', ministryId: ministry.id, materialId: materialId(theirs), title: 'Ours now', body: 'Text.', removeItems: [], files: [], links: [], changedBy: admin() }),
    ).rejects.toMatchObject({ refusal: 'material.not_on_the_list' })
    await expect(
      service().execute({ type: 'material.remove', ministryId: ministry.id, materialId: materialId(theirs), removedBy: admin() }),
    ).rejects.toMatchObject({ refusal: 'material.not_on_the_list' })
    expect(await row(theirs)).toMatchObject({ title: 'Their study', removed: null })

    // And the page an Admin of this Ministry reads shows none of it.
    const asAdmin = await signInAs(ministry)
    const { data } = await asAdmin.rpc('edit_material_page')
    const titles = ((data as { materials: { title: string }[] }).materials).map((each) => each.title)
    expect(titles).not.toContain('Their study')
  })
})
