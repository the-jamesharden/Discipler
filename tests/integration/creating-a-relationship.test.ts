import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Pairing, driven through the real command boundary against the real database. The
 * participation caps are the interesting part: the domain cannot judge them, because
 * they depend on the Ministry's other relationships, so the database refuses and the
 * refusal has to reach the Admin as something they can act on rather than as a
 * constraint name or, worse, as nothing at all.
 */

describe('creating a relationship', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  // Real identifiers rather than the sequential test source: these rows outlive the
  // test file, so a second run of the suite against the same stack would collide with
  // the first on a deterministic id.
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () => createCommandService({ clock, ids, store,   appBaseUrl: 'https://discipler.test', })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const roster = async (name: string): Promise<PersonId> =>
    personId(await addPerson(ministry, name))

  const pair = (leaderId: PersonId, participantIds: PersonId[]) =>
    service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [leaderId],
      participantIds,
      // Mixed, so the shape under test is the only thing being asserted. What a
      // group declares, and what happens when somebody crosses it, is ticket 25's
      // own file.
      declaredGender: null,
    })

  const membersOf = async (relationshipId: string) => {
    const { rows } = await pool.query(
      `select role, person_id, started_at, ended_at from relationship_member
        where relationship_id = $1 order by role, person_id`,
      [relationshipId],
    )
    return rows
  }

  it('pairs two people, and does not activate what it created', async () => {
    const david = await roster('David Ellis')
    const emily = await roster('Emily Johnson')

    const outcome = await pair(david, [emily])
    const created = outcome.effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    const { rows } = await pool.query(
      `select kind, accepted_at, ended_at from relationship where id = $1`,
      [created.relationship.id],
    )

    // Awaiting Leader Acceptance is the absence of an acceptance, not a stored status.
    expect(rows[0]).toMatchObject({ kind: 'one_to_one', accepted_at: null, ended_at: null })
    expect(await membersOf(created.relationship.id)).toHaveLength(2)
  })

  it('sends nothing to a Participant, because the Leader has not agreed yet', async () => {
    const david = await roster('David Two')
    const emily = await roster('Emily Two')

    await pair(david, [emily])

    // Scoped to these two: other suites share the stack and run alongside this one.
    const { rows } = await pool.query(
      `select person_id, discloses_person_id from outbound_message
        where ministry_id = $1 and person_id = any($2::uuid[])`,
      [ministry.id, [david, emily]],
    )

    // The Leader is invited; the Participant hears nothing at all until every
    // Leader has agreed to lead them.
    expect(rows.map((row) => row.person_id)).toEqual([david])
    // And nothing bound for a Leader offers to disclose anybody's number.
    expect(rows[0].discloses_person_id).toBeNull()
  })

  it('forms a group from several people selected together, with no group entity', async () => {
    const leader = await roster('Grace Leader')
    const first = await roster('Group One')
    const second = await roster('Group Two')
    const third = await roster('Group Three')

    const outcome = await pair(leader, [first, second, third])
    const created = outcome.effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    // One relationship with N=3, reached by the same command and the same tables as
    // the one-to-one above.
    const members = await membersOf(created.relationship.id)
    expect(members.filter((m) => m.role === 'participant')).toHaveLength(3)
    expect(members.filter((m) => m.role === 'leader')).toHaveLength(1)
    expect(members.every((m) => m.ended_at === null)).toBe(true)
  })

  it('refuses a Participant a second one-to-one, in words an Admin can act on', async () => {
    const first = await roster('First Leader')
    const second = await roster('Second Leader')
    const emily = await roster('Emily Spoken For')

    await pair(first, [emily])

    await expect(pair(second, [emily])).rejects.toThrow(
      new PairingRefused('relationship.participant_already_in_a_one_to_one'),
    )
  })

  it('leaves nothing behind when it refuses', async () => {
    const first = await roster('Third Leader')
    const second = await roster('Fourth Leader')
    const emily = await roster('Emily Also Spoken For')

    await pair(first, [emily])
    const countEvents = `select count(*)::int as events from ministry_event where ministry_id = $1`
    const before = await pool.query(countEvents, [ministry.id])

    await expect(pair(second, [emily])).rejects.toThrow(PairingRefused)

    const after = await pool.query(countEvents, [ministry.id])
    // Rows before facts: history never claims a pairing the caps refused.
    expect(after.rows[0].events).toBe(before.rows[0].events)
  })

  it('refuses a Leader a second group and still lets them take one-to-ones', async () => {
    const leader = await roster('Busy Leader')
    const a = await roster('Group A One')
    const b = await roster('Group A Two')
    const c = await roster('Group B One')
    const d = await roster('Group B Two')
    const solo = await roster('Solo Participant')

    await pair(leader, [a, b])

    await expect(pair(leader, [c, d])).rejects.toThrow(
      new PairingRefused('relationship.leader_already_leads_a_group'),
    )

    // The cap is on groups, not on leading. One-to-ones stay uncapped.
    await expect(pair(leader, [solo])).resolves.toBeDefined()
  })

  it('refuses to pair someone from another Ministry', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')
    const ours = await roster('Ours')
    const theirs = personId(await addPerson(northgate, 'Theirs'))

    await expect(pair(ours, [theirs])).rejects.toThrow(
      new PairingRefused('relationship.person_belongs_to_another_ministry'),
    )
  })

  it('records the pairing in history, where everything else is derived from', async () => {
    const leader = await roster('Recorded Leader')
    const emily = await roster('Recorded Participant')

    const outcome = await pair(leader, [emily])
    const created = outcome.effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    const { rows } = await pool.query(
      `select type, subject_type, payload from ministry_event where subject_id = $1`,
      [created.relationship.id],
    )

    expect(rows[0]).toMatchObject({ type: 'relationship.created', subject_type: 'relationship' })
    expect(rows[0].payload).toMatchObject({ leaderIds: [leader], participantCount: 1 })
  })
})
