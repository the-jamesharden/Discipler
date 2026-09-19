import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import { PairingRefused, type PairingRefusal } from '~/domain/errors'
import { materialId, personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, ticket 03. Asking whether a relationship would be refused,
 * without forming it.
 *
 * Against the database, because that is where most of a pairing is refused: gender,
 * Intake, opt-outs and the participation caps are triggers and indexes on
 * `relationship_member`, and the boundary mirrors none of them. The check forms the
 * relationship in a transaction it always rolls back, so they answer it exactly as
 * they answer formation -- and the thing to prove is that the rollback is total,
 * whatever the answer was.
 */

type Pairing = Extract<Command, { readonly type: 'relationship.create' }>

describe('a pairing checked without being formed, against the database', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-09T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const man = async (name: string, options: { intake?: false } = {}) =>
    personId(await addPerson(ministry, name, { ...options, answers: { gender: 'male' } }))

  const woman = async (name: string) =>
    personId(await addPerson(ministry, name, { answers: { gender: 'female' } }))

  const aPair = (leader: PersonId, participant: PersonId): Pairing => ({
    type: 'relationship.create',
    ministryId: ministry.id,
    leaderIds: [leader],
    participantIds: [participant],
  })

  const aGroup = (leader: PersonId, participants: PersonId[]): Pairing => ({
    type: 'relationship.create',
    ministryId: ministry.id,
    leaderIds: [leader],
    participantIds: participants,
    declaredGender: null,
    name: 'The Tuesday Group',
  })

  const refusalFromForming = async (command: Pairing): Promise<PairingRefusal | null> => {
    try {
      await service().execute(command)
      return null
    } catch (error) {
      if (error instanceof PairingRefused) return error.refusal
      throw error
    }
  }

  /**
   * Every table forming a relationship writes to, counted for this Ministry. Counts
   * rather than emptiness, because putting people on the Roster writes history of
   * its own; what matters is that a check moves none of them.
   */
  const everythingKept = async () => {
    const { rows } = await pool.query<Record<string, string>>(
      `select
         (select count(*) from relationship where ministry_id = $1) as relationships,
         (select count(*) from relationship_member where ministry_id = $1) as memberships,
         (select count(*) from invitation where ministry_id = $1) as invitations,
         (select count(*) from ministry_event where ministry_id = $1) as history,
         (select count(*) from outbound_message where ministry_id = $1) as outbound,
         (select count(*) from follow_up_item where ministry_id = $1) as follow_ups`,
      [ministry.id],
    )
    return rows[0]
  }

  /**
   * The acceptance, whole: the check answers, nothing exists afterwards that did
   * not before, and forming the same command then gives the same answer.
   */
  const checkedThenFormed = async (command: Pairing) => {
    const before = await everythingKept()
    const checked = await service().checkPairing(command)
    expect(await everythingKept()).toEqual(before)

    const formed = await refusalFromForming(command)
    expect(formed).toBe(checked)

    return checked
  }

  it('answers with nothing for a pair that then forms, and writes nothing in answering', async () => {
    const command = aPair(await man('Adam Price'), await man('Ben Quinn'))

    expect(await checkedThenFormed(command)).toBeNull()

    // Formed once, by the forming. A check that had committed would have spent the
    // Disciple's one open one-to-one and the forming would have been refused.
    const { rows } = await pool.query(
      `select 1 from relationship_member where person_id = $1 and ended_at is null`,
      [command.participantIds[0]],
    )
    expect(rows).toHaveLength(1)
  })

  it('answers with nothing for a group with a Material the Ministry holds', async () => {
    const romans = materialId(await addMaterial(ministry, 'Romans, checked first'))
    const command = {
      ...aGroup(await man('Caleb Ross'), [await man('Dan Shaw'), await woman('Eve Tran')]),
      materialId: romans,
    }

    expect(await checkedThenFormed(command)).toBeNull()
  })

  it('is refused across gender, by the trigger the boundary holds no copy of', async () => {
    const command = aPair(await man('Frank Usher'), await woman('Grace Vine'))

    expect(await checkedThenFormed(command)).toBe('relationship.gender_must_match')
  })

  it('is refused for a Disciple who has not completed Intake', async () => {
    const command = aPair(await man('Henry Ward'), await man('Ian Young', { intake: false }))

    expect(await checkedThenFormed(command)).toBe(
      'relationship.participant_has_not_completed_intake',
    )
  })

  it('is refused for a Discipler who has not completed Intake', async () => {
    const command = aPair(await man('Jack Abbot', { intake: false }), await man('Karl Boone'))

    expect(await checkedThenFormed(command)).toBe('relationship.leader_has_not_completed_intake')
  })

  it('is refused for a Disciple who has opted out', async () => {
    const participant = await man('Liam Cole')
    await optOut(ministry, participant)

    expect(await checkedThenFormed(aPair(await man('Mark Dunn'), participant))).toBe(
      'relationship.participant_has_opted_out',
    )
  })

  it('is refused for a Discipler who has opted out', async () => {
    const leader = await man('Noah Eads')
    await optOut(ministry, leader)

    expect(await checkedThenFormed(aPair(leader, await man('Owen Frost')))).toBe(
      'relationship.leader_has_opted_out',
    )
  })

  it('is refused for a Material the Ministry does not hold', async () => {
    const other = await createMinistryWithAdmin('Northgate Church')
    const theirs = materialId(await addMaterial(other, 'Northgate’s own, checked first'))
    const command = { ...aPair(await man('Paul Grant'), await man('Quinn Hale')), materialId: theirs }

    expect(await checkedThenFormed(command)).toBe('relationship.material_is_not_on_the_list')
  })

  it('is refused for an unnamed group', async () => {
    const command = {
      ...aGroup(await man('Reed Irwin'), [await man('Sam Jones'), await man('Tom Kerr')]),
      name: null,
    }

    expect(await checkedThenFormed(command)).toBe('relationship.needs_a_name')
  })

  it('is refused for a group nobody declared', async () => {
    // Left off rather than set: `undefined` is nobody answered, `null` is mixed.
    const { declaredGender: _, ...command } = aGroup(await man('Umar Lane'), [
      await man('Vic Moss'),
      await man('Will Nash'),
    ])

    expect(await checkedThenFormed(command)).toBe('relationship.needs_a_gender_declaration')
  })

  it('is refused by a participation cap, which only an index knows', async () => {
    const participant = await man('Xavier Owen')
    await service().execute(aPair(await man('Yusuf Park'), participant))

    expect(await checkedThenFormed(aPair(await man('Zane Quill'), participant))).toBe(
      'relationship.participant_already_in_a_one_to_one',
    )
  })

  it('leaves a plan an import made open, though forming the same pairing closes it', async () => {
    // The one effect of formation that is an UPDATE, and so the one the counts
    // above cannot see.
    const leader = await man('Felix Wren')
    const participant = await man('Gideon York')
    const planId = crypto.randomUUID()
    await pool.query(
      `insert into intended_pairing (id, ministry_id, leader_id, participant_id, planned_at)
       values ($1, $2, $3, $4, now())`,
      [planId, ministry.id, leader, participant],
    )
    const plan = async () => {
      const { rows } = await pool.query(
        `select outcome, closed_at, relationship_id from intended_pairing where id = $1`,
        [planId],
      )
      return rows[0]
    }

    expect(await service().checkPairing(aPair(leader, participant))).toBeNull()
    expect(await plan()).toEqual({ outcome: null, closed_at: null, relationship_id: null })

    await service().execute(aPair(leader, participant))
    expect(await plan()).toMatchObject({ outcome: 'fulfilled' })
  })

  it('answers for the database as it stands, and so not for a set', async () => {
    // What ticket 04 has to be ready for. Two pairings of one Disciple each pass
    // alone, because neither check leaves anything for the other to meet -- and
    // the second is refused when both are formed.
    const participant = await man('Aaron Reid')
    const first = aPair(await man('Blake Stone'), participant)
    const second = aPair(await man('Colin Tate'), participant)

    expect(await service().checkPairing(first)).toBeNull()
    expect(await service().checkPairing(second)).toBeNull()

    expect(await refusalFromForming(first)).toBeNull()
    expect(await refusalFromForming(second)).toBe(
      'relationship.participant_already_in_a_one_to_one',
    )
  })

  it('holds nothing open afterwards: the same pairing can be checked again at once', async () => {
    const command = aPair(await man('Derek Upton'), await man('Ellis Vance'))
    const before = await everythingKept()

    const answers = await Promise.all([
      service().checkPairing(command),
      service().checkPairing(command),
      service().checkPairing(command),
    ])

    expect(answers).toEqual([null, null, null])
    expect(await everythingKept()).toEqual(before)
  })
})
