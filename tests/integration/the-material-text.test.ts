import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { materialId, relationshipId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The text a Leader gets when their Material changes, against the real database
 * (Richer materials, ticket 03): an Admin assigns, the tick an hour and more later
 * texts once, a second change the same day waits for tomorrow, and a title-only
 * edit texts nobody. What the rows hold is what this proves: the running period,
 * the `material.edited` event, and `material_notice`.
 */
describe('the text when a Material changes', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  let grace: AccountFixture
  let relationship: string
  let romans: string
  let multiply: string

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const serviceAt = (at: Date) =>
    createCommandService({ clock: createTestClock(at), ids, store, appBaseUrl: 'https://discipler.test' })
  const tickAt = (at: Date) => serviceAt(at).execute({ type: 'scheduled.tick', ministryId: ministry.id })

  // Wednesday 19 August 2026, in Chicago: 9am, and hours after.
  const nineAm = new Date('2026-08-19T14:00:00Z')
  const at = (minutesAfterNine: number) => new Date(nineAm.getTime() + minutesAfterNine * 60_000)

  const materialTexts = async () => {
    const { rows } = await pool.query<{ body: string; enqueued_at: Date }>(
      `select body, enqueued_at from outbound_message
        where person_id = $1 and body like '%material%'
        order by enqueued_at, created_at`,
      [grace.personId],
    )
    return rows
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query(`update ministry set timezone = 'America/Chicago' where id = $1`, [ministry.id])
    grace = await addPersonWithAccount(ministry, 'Grace Lee', 'leader')
    const emily = await addPerson(ministry, 'Emily Davis')
    relationship = await pairOneToOne(ministry, grace.personId, emily, {
      createdAt: new Date('2026-08-01T15:00:00Z'),
      acceptedAt: new Date('2026-08-01T15:00:00Z'),
    })
    romans = await addMaterial(ministry, 'Romans', { body: 'Read one chapter a week.' })
    multiply = await addMaterial(ministry, 'Multiply', { body: 'Session one.' })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  it('texts the Leader once, an hour after the last change, and records what they were told', async () => {
    await serviceAt(at(0)).execute({
      type: 'relationship.assign_material',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      materialId: materialId(romans),
      assignedBy: ministry.adminUserId,
    })

    await tickAt(at(30))
    expect(await materialTexts()).toEqual([])

    await tickAt(at(61))
    expect((await materialTexts()).map((row) => row.body)).toEqual([
      expect.stringMatching(
        /^Riverside Chapel: The material for your discipleship is now Romans\. See it at https:\/\/discipler\.test\/relationships/,
      ),
    ])

    const { rows } = await pool.query<{ material_id: string; texted: boolean }>(
      `select material_id, texted from material_notice
        where person_id = $1 and relationship_id = $2 order by told_at desc, created_at desc limit 1`,
      [grace.personId, relationship],
    )
    expect(rows[0]).toEqual({ material_id: romans, texted: true })

    // Nothing new: the next tick says nothing.
    await tickAt(at(120))
    expect(await materialTexts()).toHaveLength(1)
  })

  it('holds a second change the same day until tomorrow morning', async () => {
    await serviceAt(at(180)).execute({
      type: 'relationship.assign_material',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      materialId: materialId(multiply),
      assignedBy: ministry.adminUserId,
    })
    await tickAt(at(300))
    expect(await materialTexts()).toHaveLength(1)

    // 8am Chicago the next day.
    await tickAt(new Date('2026-08-20T13:00:00Z'))
    const texts = await materialTexts()
    expect(texts).toHaveLength(2)
    expect(texts[1]?.body).toMatch(/^Riverside Chapel: The material for your discipleship is now Multiply\./)
  })

  it('texts nobody for a title-only edit, and says updated when what the Material holds changes', async () => {
    const edit = (minutes: number, title: string, body: string) =>
      serviceAt(new Date(new Date('2026-08-20T13:00:00Z').getTime() + minutes * 60_000)).execute({
        type: 'material.edit',
        ministryId: ministry.id,
        materialId: materialId(multiply),
        title,
        body,
        removeItems: [],
        files: [],
        links: [],
        changedBy: ministry.adminUserId,
      })

    // Thursday, and Grace has had today's text. Friday morning checks.
    await edit(60, 'Multiply, revised', 'Session one.')
    await tickAt(new Date('2026-08-21T13:30:00Z'))
    expect(await materialTexts()).toHaveLength(2)

    await edit(1500, 'Multiply, revised', 'Session one, with questions.')
    await tickAt(new Date('2026-08-21T15:30:00Z'))
    const texts = await materialTexts()
    expect(texts).toHaveLength(3)
    expect(texts[2]?.body).toMatch(
      /^Riverside Chapel: Multiply, revised, the material for your discipleship, has been updated\./,
    )
  })
})
