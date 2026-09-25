import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { materialId, materialItemId, relationshipId, type IdSource } from '~/domain/ids'
import type { MaterialFile } from '~/domain/materials'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  aTestPhoneNumber,
  addMaterial,
  addMembership,
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  optOut,
  pairOneToOne,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Who the text about a Material change reaches, and what holds it back, against
 * the real database (Richer materials, tickets 03 and 04, and the review after
 * them). Each case has a Ministry of its own, so one case's texts and notices
 * are never another's.
 *
 * - Somebody who texted STOP is left out, and the tick goes on for everybody
 *   else. Before, their text reached the outbound queue, which refuses it, and
 *   the tick is one transaction: every check-in in the Ministry went with it.
 * - Correcting a title while a change settles does not start the hour again.
 * - Somebody who joins a relationship hears about its Material once the join
 *   has settled like any other change.
 * - A file removed and uploaded again is the Material put back, and tells
 *   nobody anything.
 */
describe('what a Material change waits for, and who it reaches', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const serviceAt = (at: Date) =>
    createCommandService({ clock: createTestClock(at), ids, store, appBaseUrl: 'https://discipler.test' })

  // Wednesday 19 August 2026, in Chicago: 9am, and minutes after.
  const nineAm = new Date('2026-08-19T14:00:00Z')
  const at = (minutesAfterNine: number) => new Date(nineAm.getTime() + minutesAfterNine * 60_000)
  const firstOfAugust = new Date('2026-08-01T15:00:00Z')

  const textsTo = async (person: string) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message
        where person_id = $1 and body like '%material%'
        order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  /** A Ministry in Chicago, a Leader who can be texted, and a one-to-one they began on 1 August. */
  const aMinistry = async (disciple: { phone?: string } = {}) => {
    const ministry = await createMinistryWithAdmin('Riverside Chapel')
    await pool.query(`update ministry set timezone = 'America/Chicago' where id = $1`, [ministry.id])
    const leader = await addPersonWithAccount(ministry, 'Grace Lee', 'leader')
    const emily = await addPerson(ministry, 'Emily Davis', { phone: disciple.phone ?? aTestPhoneNumber() })
    const relationship = await pairOneToOne(ministry, leader.personId, emily, {
      createdAt: firstOfAugust,
      acceptedAt: firstOfAugust,
      joinedAt: firstOfAugust,
    })
    return { ministry, leader, emily, relationship }
  }

  const assign = (ministry: MinistryFixture, relationship: string, material: string, when: Date) =>
    serviceAt(when).execute({
      type: 'relationship.assign_material',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      materialId: materialId(material),
      assignedBy: ministry.adminUserId,
    })

  const tick = (ministry: MinistryFixture, when: Date) =>
    serviceAt(when).execute({ type: 'scheduled.tick', ministryId: ministry.id })

  beforeAll(() => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  it('leaves out a Disciple who texted STOP, and texts their Leader as usual', async () => {
    const { ministry, leader, emily, relationship } = await aMinistry()
    const romans = await addMaterial(ministry, 'Romans', { body: 'Read one chapter a week.' })
    await optOut(ministry, emily)

    await assign(ministry, relationship, romans, at(0))
    await tick(ministry, at(61))

    expect(await textsTo(leader.personId)).toEqual([
      expect.stringMatching(/^Riverside Chapel: The material for your discipleship is now Romans\./),
    ])
    expect(await textsTo(emily)).toEqual([])
    // Nothing recorded for her either: a change still pending when she can be
    // texted again goes then.
    const { rows } = await pool.query(`select 1 from material_notice where person_id = $1 and texted`, [emily])
    expect(rows).toEqual([])
  })

  it('leaves out a Disciple with no number, with nothing to send it to', async () => {
    const ministry = await createMinistryWithAdmin('Riverside Chapel')
    await pool.query(`update ministry set timezone = 'America/Chicago' where id = $1`, [ministry.id])
    const leader = await addPersonWithAccount(ministry, 'Grace Lee', 'leader')
    const numberless = await addPerson(ministry, 'Emily Davis')
    const relationship = await pairOneToOne(ministry, leader.personId, numberless, {
      createdAt: firstOfAugust,
      acceptedAt: firstOfAugust,
      joinedAt: firstOfAugust,
    })
    const romans = await addMaterial(ministry, 'Romans', { body: 'Read one chapter a week.' })

    await assign(ministry, relationship, romans, at(0))
    await tick(ministry, at(61))

    expect(await textsTo(leader.personId)).toHaveLength(1)
    const { rows } = await pool.query(`select 1 from outbound_message where person_id = $1`, [numberless])
    expect(rows).toEqual([])
  })

  it('does not start the hour again for a title corrected while a change settles', async () => {
    const { ministry, leader, relationship } = await aMinistry()
    const romans = await addMaterial(ministry, 'Romans', { body: 'Read one chapter a week.' })

    await assign(ministry, relationship, romans, at(0))
    await serviceAt(at(50)).execute({
      type: 'material.edit',
      ministryId: ministry.id,
      materialId: materialId(romans),
      title: 'Romans, weeks 1-6',
      body: 'Read one chapter a week.',
      removeItems: [],
      files: [],
      links: [],
      changedBy: ministry.adminUserId,
    })
    await tick(ministry, at(61))

    expect(await textsTo(leader.personId)).toEqual([
      expect.stringMatching(/is now Romans, weeks 1-6\./),
    ])
  })

  it('texts somebody who joins a relationship once their joining has settled', async () => {
    const ministry = await createMinistryWithAdmin('Riverside Chapel')
    await pool.query(`update ministry set timezone = 'America/Chicago' where id = $1`, [ministry.id])
    const leader: AccountFixture = await addPersonWithAccount(ministry, 'Grace Lee', 'leader')
    const group = await createRelationship(ministry, 'group', { createdAt: firstOfAugust, acceptedAt: firstOfAugust })
    await addMembership({
      ministry,
      relationshipId: group,
      kind: 'group',
      personId: leader.personId,
      role: 'leader',
      startedAt: firstOfAugust,
      acceptedAt: firstOfAugust,
    })
    const romans = await addMaterial(ministry, 'Romans', { body: 'Read one chapter a week.' })
    await assign(ministry, group, romans, new Date('2026-08-03T14:00:00Z'))
    await tick(ministry, new Date('2026-08-03T16:00:00Z'))
    expect(await textsTo(leader.personId)).toHaveLength(1)

    // Weeks later a Disciple joins the group, which has been on Romans all along.
    const newcomer = await addPerson(ministry, 'Ruth Owens', { phone: aTestPhoneNumber() })
    await addMembership({
      ministry,
      relationshipId: group,
      kind: 'group',
      personId: newcomer,
      role: 'participant',
      startedAt: at(0),
    })

    await tick(ministry, at(30))
    expect(await textsTo(newcomer)).toEqual([])

    await tick(ministry, at(61))
    expect(await textsTo(newcomer)).toEqual([
      expect.stringMatching(/^Riverside Chapel: Your discipleship material with Grace Lee is now Romans\./),
    ])
    // The Leader's Material did not change, so the Leader hears nothing more.
    expect(await textsTo(leader.personId)).toHaveLength(1)
  })

  it('tells nobody anything when a file is removed and the same file uploaded again', async () => {
    const { ministry, leader, relationship } = await aMinistry()
    const guide: Omit<MaterialFile, 'path'> = {
      kind: 'file',
      filename: 'Romans guide.pdf',
      contentType: 'application/pdf',
      bytes: 2048,
    }
    const romans = await addMaterial(ministry, 'Romans', {
      body: null,
      files: [{ path: `${ministry.id}/${crypto.randomUUID()}.pdf`, filename: guide.filename, bytes: guide.bytes }],
      links: [{ url: 'https://bibleproject.com/romans', label: null }],
    })
    await assign(ministry, relationship, romans, at(0))
    await tick(ministry, at(61))
    expect(await textsTo(leader.personId)).toHaveLength(1)

    // The next morning the Admin removes the guide and uploads it again: a new
    // object under a new path, and now after the link rather than before it.
    const { rows } = await pool.query<{ id: string }>(
      `select id from material_item where material_id = $1 and kind = 'file'`,
      [romans],
    )
    const nextMorning = new Date('2026-08-20T14:00:00Z')
    await serviceAt(nextMorning).execute({
      type: 'material.edit',
      ministryId: ministry.id,
      materialId: materialId(romans),
      title: 'Romans',
      body: null,
      removeItems: [materialItemId(rows[0]!.id)],
      files: [{ ...guide, path: `${ministry.id}/${crypto.randomUUID()}.pdf` }],
      links: [],
      changedBy: ministry.adminUserId,
    })
    await tick(ministry, new Date(nextMorning.getTime() + 61 * 60_000))

    expect(await textsTo(leader.personId)).toHaveLength(1)
  })
})
