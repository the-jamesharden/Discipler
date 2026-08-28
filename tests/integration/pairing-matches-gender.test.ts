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
 * The two constraints on pairing differ in a way that is easy to lose: gender is a
 * safeguarding policy and manual pairing may never cross it, while the age band
 * governs *suggestion only* and an Admin pairing by hand may cross it freely. A
 * design that treated them uniformly -- as two toggles, or as two filters on the
 * same list -- would misrepresent one of them, so both directions are asserted here.
 *
 * Gender is enforced in the database for the reason the participation caps are: an
 * application-side check holds only until the first write path that forgets it, and
 * this is the one rule in Discipler that exists to protect people rather than to
 * keep the product tidy.
 */

describe('pairing and the two constraints', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-09T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () => createCommandService({ clock, ids, store })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const pair = (leaderId: PersonId, participantIds: PersonId[]) =>
    service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderId,
      participantIds,
    })

  const man = async (name: string, ageBand: '18-24' | '25-34' | '65+' = '25-34') =>
    personId(await addPerson(ministry, name, { answers: { gender: 'male', ageBand } }))

  const woman = async (name: string, ageBand: '18-24' | '25-34' | '65+' = '25-34') =>
    personId(await addPerson(ministry, name, { answers: { gender: 'female', ageBand } }))

  const refusalFrom = async (attempt: Promise<unknown>): Promise<string> => {
    try {
      await attempt
    } catch (error) {
      if (error instanceof PairingRefused) return error.refusal
      throw error
    }
    throw new Error('That pairing was expected to be refused, and was not')
  }

  it('refuses a manual pairing that crosses gender', async () => {
    const leader = await man('Adam Price')
    const participant = await woman('Beth Quinn')

    expect(await refusalFrom(pair(leader, [participant]))).toBe(
      'relationship.gender_must_match',
    )
  })

  it('refuses it whichever side the mismatch is on', async () => {
    const leader = await woman('Clara Reed')
    const participant = await man('Daniel Shaw')

    expect(await refusalFrom(pair(leader, [participant]))).toBe(
      'relationship.gender_must_match',
    )
  })

  it('refuses a group where one Participant does not match the rest', async () => {
    const leader = await man('Evan Turner')
    const first = await man('Frank Usher')
    const odd = await woman('Grace Vine')

    expect(await refusalFrom(pair(leader, [first, odd]))).toBe(
      'relationship.gender_must_match',
    )
  })

  it('leaves no relationship and no history behind when it refuses', async () => {
    const leader = await man('Henry Ward')
    const participant = await woman('Iris Young')

    await refusalFrom(pair(leader, [participant]))

    // The membership rows are written before the history event, so a refusal that
    // rolled back badly would leave either a half-built relationship or history
    // claiming a pairing that never happened. Neither may survive.
    const { rows: members } = await pool.query(
      `select 1 from relationship_member where person_id = any($1)`,
      [[leader, participant]],
    )
    expect(members).toEqual([])

    const { rows: events } = await pool.query(
      `select 1 from ministry_event
        where ministry_id = $1 and type = 'relationship.created'
          and payload->>'leaderId' = $2`,
      [ministry.id, leader],
    )
    expect(events).toEqual([])
  })

  it('pairs across the age band, because the age constraint governs suggestion only', async () => {
    // Two bands apart, and in the direction the suggestion rule excludes: an Admin
    // who knows this is right is never subordinate to the list.
    const leader = await woman('Judith Adams', '18-24')
    const participant = await woman('Karen Booth', '65+')

    const outcome = await pair(leader, [participant])

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
  })

  it('pairs two people of the same gender', async () => {
    const leader = await man('Liam Carter')
    const participant = await man('Marcus Dean')

    const outcome = await pair(leader, [participant])

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
  })
})
