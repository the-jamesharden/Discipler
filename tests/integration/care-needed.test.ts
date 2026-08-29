import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { readOpenFollowUpItems } from '~/platform/supabase/care-needed-reader'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Care Needed, as far as ticket 07 builds it. The view proper unions three sources
 * -- derived relationship states, Concerns, and Follow-Up Items -- and the first
 * two arrive with ticket 10, so what is asserted here is the third source and the
 * isolation every source has to obey.
 */

describe('Care Needed', () => {
  let ministry: MinistryFixture
  let elsewhere: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const createdAt = new Date('2026-03-02T09:00:00Z')
  const clock = createTestClock(createdAt)
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    elsewhere = await createMinistryWithAdmin('Northgate Fellowship')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const roster = async (fixture: MinistryFixture, fullName: string) =>
    personId(await addPerson(fixture, fullName, { phone: aNumber() }))

  const raiseIn = async (fixture: MinistryFixture, fullName: string) => {
    const leader = await roster(fixture, `${fullName} the Leader`)
    const participant = await roster(fixture, fullName)
    const relationship = await pairOneToOne(fixture, leader, participant)

    await store.transact(fixture.id, (unit) =>
      unit.raiseFollowUp({
        ministryId: fixture.id,
        kind: 'match_declined',
        relationshipId: relationshipId(relationship),
        personId: participant,
        raisedAt: createdAt,
      }),
    )

    return { relationship, participant }
  }

  const careNeededFor = async (fixture: MinistryFixture) =>
    readOpenFollowUpItems(await signInAs(fixture), fixture.id)

  it('lists open items for the Admin\'s Ministry and no other', async () => {
    const mine = await raiseIn(ministry, 'Emily Johnson')
    await raiseIn(elsewhere, 'Someone Else')

    const items = await careNeededFor(ministry)

    expect(items.map((item) => item.personName)).toEqual(['Emily Johnson'])
    expect(items[0]?.kind).toBe('match_declined')
    expect(items[0]?.relationshipId).toBe(mine.relationship)
    expect(items[0]?.payload).toEqual({ kind: 'match_declined' })
  })

  it('shows a relationship nobody accepted, and how long it has waited now', async () => {
    const leader = await roster(ministry, 'Isaac Prince')
    const participant = await roster(ministry, 'Julia North')

    await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [leader],
      participantIds: [participant],
    })
    clock.advanceTo(new Date(createdAt.getTime() + days(5)))
    await service().execute({ type: 'scheduled.tick', ministryId: ministry.id })

    const items = await careNeededFor(ministry)
    const unaccepted = items.find((item) => item.kind === 'relationship_unaccepted')

    // The duration is read off the relationship, not off a number frozen into the
    // payload -- which is why an item raised on day five still reads correctly on
    // day twenty.
    expect(unaccepted?.relationshipCreatedAt).toEqual(createdAt)
    expect(unaccepted?.raisedAt).toEqual(new Date(createdAt.getTime() + days(5)))
  })

  it('drops an item once an Admin has resolved it', async () => {
    const { relationship } = await raiseIn(ministry, 'Kofi Mensah')

    const before = await careNeededFor(ministry)
    expect(before.map((item) => item.relationshipId)).toContain(relationship)

    const item = before.find((row) => row.relationshipId === relationship)!
    await service().execute({
      type: 'follow_up.resolve',
      ministryId: ministry.id,
      itemId: item.id,
      resolvedBy: ministry.adminUserId,
    })

    const after = await careNeededFor(ministry)
    expect(after.map((row) => row.relationshipId)).not.toContain(relationship)

    // Gone from the view, still in the table. How many care items a Ministry
    // raised and how fast it closed them is a question it can still ask.
    const { rows } = await pool.query(`select 1 from follow_up_item where id = $1`, [item.id])
    expect(rows).toHaveLength(1)
  })

  it('shows a Leader nothing at all', async () => {
    // Care Needed is an Admin surface by definition. A Leader holds a session and
    // a `ministry_member` row in the same Ministry, and still reads nothing here.
    await raiseIn(ministry, 'Leah Osei')

    const leader = await addPersonWithAccount(ministry, 'Marcus Webb', 'leader')
    const asLeader = await signInWith(leader)

    const { data, error } = await asLeader.from('follow_up_item').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
