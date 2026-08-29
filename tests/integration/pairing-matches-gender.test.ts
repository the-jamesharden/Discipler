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
 * Three rules that are easy to collapse into one, so all three directions are
 * asserted here.
 *
 * **Gender binds a one-to-one.** Men with men and women with women, for the pilot,
 * and manual pairing may never cross it.
 *
 * **Gender does not bind a group.** A group is people who meet together, and may hold
 * Leaders and Participants of any gender. A check that read "everyone in a
 * relationship shares a gender" would be a coherent rule and the wrong one.
 *
 * **The age band binds nothing.** It governs *suggestion only*, so an Admin pairing by
 * hand crosses it freely and gets no refusal at all.
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
    pairLed([leaderId], participantIds)

  const pairLed = (leaderIds: PersonId[], participantIds: PersonId[]) =>
    service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds,
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

  it('lets a group hold Participants of more than one gender', async () => {
    // The same three people the one-to-one rule would refuse two at a time. A group
    // is people who meet together, not several pairings with the leader, and the
    // safeguarding rule Discipler has is about the two-person case.
    const leader = await man('Evan Turner')
    const first = await man('Frank Usher')
    const second = await woman('Grace Vine')

    const outcome = await pairLed([leader], [first, second])

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
  })

  it('lets a group be led by a man and a woman together', async () => {
    const first = await man('Isaac Moss')
    const second = await woman('Jane Nolan')
    const participant = await woman('Kate Oyelaran')
    const other = await man('Luke Pike')

    const outcome = await pairLed([first, second], [participant, other])

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
  })

  it('binds two Leaders over one Participant, because that is a group and not a pair', async () => {
    // Three people, so the kind is a group and gender does not apply -- the case that
    // would have been called a one-to-one had the kind come from the Participant
    // count alone, and would then have been refused by the one-leader cap instead.
    const first = await man('Micah Quaye')
    const second = await woman('Nia Roberts')
    const participant = await man('Owen Sands')

    const outcome = await pairLed([first, second], [participant])

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
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
          and payload->'leaderIds' ? $2`,
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

  it('refuses a reopened membership that would leave the relationship mismatched', async () => {
    // Nothing in Discipler reopens a membership -- readmission is a second row, which
    // is why the primary key is a surrogate. The guarantee is written against the
    // database rather than against the write paths that exist today, so the rule has
    // to hold for the update as well as the insert.
    const leader = await woman('Nadia Peters')
    const participant = await woman('Orla Quinn')
    await pair(leader, [participant])

    await pool.query(
      `update relationship_member set ended_at = now() where person_id = $1`,
      [participant],
    )

    // Her Intake is corrected, and now she does not match the Leader she left.
    await pool.query(`update intake_submission set gender = 'male' where person_id = $1`, [
      participant,
    ])

    await expect(
      pool.query(
        `update relationship_member set ended_at = null where person_id = $1`,
        [participant],
      ),
    ).rejects.toThrow(/same gender/i)
  })

  it('reads the latest Intake, because a correction is the answer that counts', async () => {
    const leader = await man('Peter Rowe')
    const participant = await woman('Quinn Steele')

    // She corrects what she first submitted. The pairing that follows is legitimate,
    // and a check reading any submission at all would refuse it.
    await pool.query(
      `insert into intake_submission (ministry_id, person_id, submitted_at, age_band, gender)
       values ($1, $2, now(), '25-34', 'male')`,
      [ministry.id, participant],
    )

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
