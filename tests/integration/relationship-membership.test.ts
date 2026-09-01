import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  adminAsPerson,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Role is a property of relationship membership, not of a Person, and the
 * participation caps that go with it are held in the database rather than by the
 * command boundary remembering to check. A person quietly holding two one-to-ones is
 * not an error anybody would notice: by the time it surfaces they have two leaders
 * who each believe they are the only one.
 *
 * These run on a superuser connection -- the most privileged caller there is -- so
 * what passes here is what the constraints allow, not what the application chose to
 * send.
 */

describe('relationship membership', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const join = (args: {
    relationshipId: string
    kind: 'one_to_one' | 'group'
    personId: string
    role: 'leader' | 'participant'
    startedAt?: string
    endedAt?: string | null
  }) =>
    pool.query(
      `insert into relationship_member
         (ministry_id, relationship_id, kind, person_id, role, started_at, ended_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        ministry.id,
        args.relationshipId,
        args.kind,
        args.personId,
        args.role,
        args.startedAt ?? '2026-03-02T09:00:00Z',
        args.endedAt ?? null,
      ],
    )

  it('refuses to put the same Person in one relationship twice', async () => {
    const relationshipId = await createRelationship(ministry, 'group')
    const person = await addPerson(ministry, 'Ada Rowe')

    await join({ relationshipId, kind: 'group', personId: person, role: 'participant' })

    await expect(
      join({ relationshipId, kind: 'group', personId: person, role: 'participant' }),
    ).rejects.toThrow(/relationship_member_one_open_per_person/)
  })

  it('refuses to pair a Person with themselves', async () => {
    const relationshipId = await createRelationship(ministry, 'one_to_one')
    const person = await addPerson(ministry, 'Ben Okafor')

    await join({ relationshipId, kind: 'one_to_one', personId: person, role: 'leader' })

    // Self-pairing is a database error rather than a scorer bug: the second role
    // collides with the first membership instead of producing a relationship where
    // one person is both sides of it.
    await expect(
      join({ relationshipId, kind: 'one_to_one', personId: person, role: 'participant' }),
    ).rejects.toThrow(/relationship_member_one_open_per_person/)
  })

  it('refuses a second open Leader on a one-to-one', async () => {
    const relationshipId = await createRelationship(ministry, 'one_to_one')
    const first = await addPerson(ministry, 'Clara Nwosu')
    const second = await addPerson(ministry, 'Dan Levy')

    await join({ relationshipId, kind: 'one_to_one', personId: first, role: 'leader' })

    await expect(
      join({ relationshipId, kind: 'one_to_one', personId: second, role: 'leader' }),
    ).rejects.toThrow(/one_to_one_one_open_leader/)
  })

  it('lets a group be led by several people', async () => {
    // The cap is on the two-person case, not on leading. A group may be led by more
    // than one person, so the index is excluded on kind rather than raised to a
    // higher number -- there is no number of leaders a group is capped at.
    const relationshipId = await createRelationship(ministry, 'group')
    const first = await addPerson(ministry, 'Ife Okonjo')
    const second = await addPerson(ministry, 'Jonas Roth')
    const third = await addPerson(ministry, 'Kiran Mehta')

    await join({ relationshipId, kind: 'group', personId: first, role: 'leader' })
    await join({ relationshipId, kind: 'group', personId: second, role: 'leader' })

    await expect(
      join({ relationshipId, kind: 'group', personId: third, role: 'leader' }),
    ).resolves.toBeDefined()
  })

  it('lets a Leader hold any number of one-to-ones', async () => {
    const leader = await addPerson(ministry, 'Esther Bello')

    for (const _ of [1, 2, 3]) {
      const relationshipId = await createRelationship(ministry, 'one_to_one')
      await join({ relationshipId, kind: 'one_to_one', personId: leader, role: 'leader' })
    }

    const { rows } = await pool.query(
      `select count(*)::int as open from relationship_member
        where person_id = $1 and role = 'leader' and ended_at is null`,
      [leader],
    )
    expect(rows[0].open).toBe(3)
  })

  it('refuses a Leader a second open group', async () => {
    const leader = await addPerson(ministry, 'Frank Amoah')
    const first = await createRelationship(ministry, 'group')
    const second = await createRelationship(ministry, 'group')

    await join({ relationshipId: first, kind: 'group', personId: leader, role: 'leader' })

    await expect(
      join({ relationshipId: second, kind: 'group', personId: leader, role: 'leader' }),
    ).rejects.toThrow(/leader_one_open_group/)
  })

  it('refuses a Participant a second open one-to-one', async () => {
    const participant = await addPerson(ministry, 'Grace Okonkwo')
    const first = await createRelationship(ministry, 'one_to_one')
    const second = await createRelationship(ministry, 'one_to_one')

    await join({ relationshipId: first, kind: 'one_to_one', personId: participant, role: 'participant' })

    await expect(
      join({ relationshipId: second, kind: 'one_to_one', personId: participant, role: 'participant' }),
    ).rejects.toThrow(/participant_one_open_one_to_one/)
  })

  it('lets a Participant hold one one-to-one alongside any number of groups', async () => {
    const participant = await addPerson(ministry, 'Hana Suzuki')
    const oneToOne = await createRelationship(ministry, 'one_to_one')
    await join({ relationshipId: oneToOne, kind: 'one_to_one', personId: participant, role: 'participant' })

    for (const _ of [1, 2]) {
      const group = await createRelationship(ministry, 'group')
      await join({ relationshipId: group, kind: 'group', personId: participant, role: 'participant' })
    }

    const { rows } = await pool.query(
      `select count(*)::int as open from relationship_member
        where person_id = $1 and role = 'participant' and ended_at is null`,
      [participant],
    )
    expect(rows[0].open).toBe(3)
  })

  it('lets a Participant leave and be readmitted, leaving the first membership intact', async () => {
    const relationshipId = await createRelationship(ministry, 'group')
    const participant = await addPerson(ministry, 'Isaac Mensah')

    const { rows: first } = await join({
      relationshipId,
      kind: 'group',
      personId: participant,
      role: 'participant',
      startedAt: '2026-01-05T09:00:00Z',
    })
    await pool.query(`update relationship_member set ended_at = $1 where id = $2`, [
      '2026-03-01T09:00:00Z',
      first[0].id,
    ])

    await join({
      relationshipId,
      kind: 'group',
      personId: participant,
      role: 'participant',
      startedAt: '2026-06-01T09:00:00Z',
    })

    const { rows } = await pool.query(
      `select started_at, ended_at from relationship_member
        where relationship_id = $1 and person_id = $2 order by started_at`,
      [relationshipId, participant],
    )
    expect(rows).toHaveLength(2)
    // The first membership still says when they left. That is what the Week-by-Week
    // History needs in order to attribute a week to the membership open at the time.
    expect(rows[0].ended_at).not.toBeNull()
    expect(rows[1].ended_at).toBeNull()
  })

  it('refuses to change a relationship s kind', async () => {
    const relationshipId = await createRelationship(ministry, 'one_to_one')

    await expect(
      pool.query(`update relationship set kind = 'group' where id = $1`, [relationshipId]),
    ).rejects.toThrow(/kind is immutable/)
  })

  it('refuses a membership whose Person belongs to another Ministry', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')
    const theirs = await addPerson(northgate, 'Jonah Park')
    const relationshipId = await createRelationship(ministry, 'group')

    await expect(
      join({ relationshipId, kind: 'group', personId: theirs, role: 'participant' }),
    ).rejects.toThrow(/relationship_member_person_fk/)
  })

  it('refuses to end a relationship without a recorded reason and outcome', async () => {
    const relationshipId = await createRelationship(ministry, 'one_to_one')

    // An ending carries both or the row is not an ending. The reason is what
    // happened in the Ministry's own words; the outcome is the part it can count,
    // and free text cannot be classified retrospectively once a pilot has written
    // a hundred sentences.
    await expect(
      pool.query(
        `update relationship set ended_at = now(), ended_outcome = 'completed'
          where id = $1`,
        [relationshipId],
      ),
    ).rejects.toThrow(/relationship_ended_carries_reason/)

    await expect(
      pool.query(
        `update relationship set ended_at = now(), ended_reason = 'moved away'
          where id = $1`,
        [relationshipId],
      ),
    ).rejects.toThrow(/relationship_ended_carries_an_outcome/)
  })

  it('lets one Person lead two relationships while being a Participant in a third', async () => {
    // The Ministry's own Admin, whose Person row provisioning created and linked to
    // his login. The point of the case is that one human does all three things, and
    // a fixture that hand-linked a Person to an account would be proving it about a
    // state no product flow produces.
    const greaves = adminAsPerson(ministry)
    // Leading requires Intake, of an Admin exactly as of anybody else. Provisioning
    // does not complete it: Intake is the Person's own act and carries their consent.
    await completeIntake(ministry, greaves.personId)

    for (const _ of [1, 2]) {
      const led = await createRelationship(ministry, 'one_to_one')
      await join({ relationshipId: led, kind: 'one_to_one', personId: greaves.personId, role: 'leader' })
    }

    const discipling = await createRelationship(ministry, 'one_to_one')
    const hisLeader = await addPerson(ministry, 'Karen Whitfield')
    await join({ relationshipId: discipling, kind: 'one_to_one', personId: hisLeader, role: 'leader' })
    await join({
      relationshipId: discipling,
      kind: 'one_to_one',
      personId: greaves.personId,
      role: 'participant',
    })

    const { rows } = await pool.query(
      `select role, count(*)::int as open from relationship_member
        where person_id = $1 and ended_at is null group by role order by role`,
      [greaves.personId],
    )
    expect(rows).toEqual([
      { role: 'leader', open: 2 },
      { role: 'participant', open: 1 },
    ])
  })
})
