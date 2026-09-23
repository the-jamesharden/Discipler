import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '~/domain/clock'
import { DepartureRefused, PairingRefused, RemovalRefused } from '~/domain/errors'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { REMOVED_FROM_THE_ROSTER, type PairingToLetGo } from '~/domain/removal'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import {
  aTestPhoneNumber,
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
 * Remove from the Roster, ticket 01 (James, 2026-09-22), against the database.
 * A removal is a dated fact beside the Person and never a delete; their pairings
 * go by the Unpair acts in the same transaction; they leave every live list, are
 * sent nothing and cannot be paired; a removed Discipler's account goes with
 * them; and an Intake from them brings the same Person back.
 */

describe('removing a Person from the Roster', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // The process's own clock, read at every call: the fixtures stamp acceptance
  // with it as they go, and an ending must not land before what it ends.
  const clock = systemClock
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () => createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const woman = async (name: string, phone = aTestPhoneNumber()) =>
    personId(await addPerson(ministry, name, { phone, answers: { gender: 'female' } }))

  const remove = (person: string, pairings: readonly PairingToLetGo[] = []) =>
    service().removePerson({
      ministryId: ministry.id,
      personId: personId(person),
      removedBy: ministry.adminUserId,
      pairings,
    })

  const removal = async (person: string) =>
    (
      await pool.query<{ removed_by: string | null; restored: boolean }>(
        `select removed_by, restored_at is not null as restored from person_removal where person_id = $1`,
        [person],
      )
    ).rows

  const rosterPage = async () => {
    const { data, error } = await (await signInAs(ministry)).rpc('roster_page')
    if (error) throw new Error(error.message)
    return data as {
      roster: {
        rows: { person_id: string; is_admin: boolean }[]
        removed: { person_id: string; full_name: string; phone: string | null }[]
      }
    }
  }

  const openMembers = async (relationship: string) =>
    (
      await pool.query<{ person_id: string }>(
        `select person_id from relationship_member where relationship_id = $1 and ended_at is null`,
        [relationship],
      )
    ).rows.map((row) => row.person_id)

  const statusOf = async (person: string) =>
    (await pool.query<{ status: string }>(`select participation_status(p) as status from person p where p.id = $1`, [person]))
      .rows[0]?.status

  it('takes an unpaired Person off the Roster, keeps them, and says who did it', async () => {
    const hannah = await woman('Hannah Brooks')

    await remove(hannah)

    expect(await removal(hannah)).toEqual([{ removed_by: ministry.adminUserId, restored: false }])
    // Nothing is deleted.
    expect((await pool.query(`select 1 from person where id = $1`, [hannah])).rowCount).toBe(1)

    const page = await rosterPage()
    expect(page.roster.rows.map((row) => row.person_id)).not.toContain(hannah)
    expect(page.roster.removed).toContainEqual(
      expect.objectContaining({ person_id: hannah, full_name: 'Hannah Brooks' }),
    )

    const { rows: events } = await pool.query<{ payload: { removedBy: string; fullName: string } }>(
      `select payload from ministry_event where subject_id = $1 and type = 'person.removed'`,
      [hannah],
    )
    expect(events).toEqual([
      { payload: expect.objectContaining({ removedBy: ministry.adminUserId, fullName: 'Hannah Brooks' }) },
    ])
  })

  it('leaves them out of Suggested Pairs', async () => {
    const hannah = await woman('Hannah Suggested')
    await remove(hannah)

    const { data, error } = await (await signInAs(ministry)).rpc('suggested_pairs_page')
    if (error) throw new Error(error.message)
    // Its pools are drawn from the Roster's own rows, which carry this document.
    const rows = (data as { roster: { rows: { person_id: string }[] } }).roster.rows
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((row) => row.person_id)).not.toContain(hannah)
  })

  it('says who on the Roster is an Admin, which is who the page offers no Remove to', async () => {
    const hannah = await woman('Hannah Not Admin')
    const rows = (await rosterPage()).roster.rows
    expect(rows.find((row) => row.person_id === ministry.adminPersonId)?.is_admin).toBe(true)
    expect(rows.find((row) => row.person_id === hannah)?.is_admin).toBe(false)
  })

  it('ends a one-to-one they are discipled in, and the other side goes back to unpaired', async () => {
    const grace = await woman('Grace Lee')
    const emily = await woman('Emily Davis')
    const pairing = relationshipId(await pairOneToOne(ministry, grace, emily))

    await remove(emily, [{ relationshipId: pairing, act: 'end' }])

    const { rows } = await pool.query<{ outcome: string; reason: string; by: string }>(
      `select ended_outcome as outcome, ended_reason as reason, ended_by as by from relationship where id = $1`,
      [pairing],
    )
    expect(rows).toEqual([{ outcome: 'discontinued', reason: REMOVED_FROM_THE_ROSTER, by: ministry.adminUserId }])
    expect(await openMembers(pairing)).toEqual([])
    expect(await statusOf(grace)).toBe('ready_to_pair')
    expect(await removal(emily)).toHaveLength(1)
  })

  it('does nothing at all where a pairing changed under the page', async () => {
    const grace = await woman('Grace Stale')
    const emily = await woman('Emily Stale')
    const pairing = relationshipId(await pairOneToOne(ministry, grace, emily))

    // A departure is what a group would take; on a one-to-one it would leave nobody.
    await expect(remove(emily, [{ relationshipId: pairing, act: 'leave' }])).rejects.toThrow(DepartureRefused)

    expect(await openMembers(pairing)).toHaveLength(2)
    expect(await removal(emily)).toEqual([])
  })

  it('refuses somebody still holding a pairing it was not told about', async () => {
    const grace = await woman('Grace Unsaid')
    const emily = await woman('Emily Unsaid')
    await pairOneToOne(ministry, grace, emily)

    await expect(remove(emily)).rejects.toThrow(new RemovalRefused('removal.still_in_a_pairing'))
    expect(await removal(emily)).toEqual([])
  })

  it('refuses an Admin', async () => {
    await expect(remove(ministry.adminPersonId)).rejects.toThrow(new RemovalRefused('removal.person_is_an_admin'))
  })

  it('refuses somebody already removed', async () => {
    const hannah = await woman('Hannah Twice')
    await remove(hannah)
    await expect(remove(hannah)).rejects.toThrow(new RemovalRefused('removal.not_on_the_roster'))
    expect(await removal(hannah)).toHaveLength(1)
  })

  it('removes a Discipler’s account with them, so they can no longer sign in', async () => {
    const leader = await addPersonWithAccount(ministry, 'Diane Leader', 'leader', { answers: { gender: 'female' } })
    const emily = await woman('Emily Led')
    const pairing = relationshipId(await pairOneToOne(ministry, leader.personId, emily))

    await remove(leader.personId, [{ relationshipId: pairing, act: 'end' }])

    const { rows: person } = await pool.query(`select user_id from person where id = $1`, [leader.personId])
    expect(person).toEqual([{ user_id: null }])
    expect((await pool.query(`select 1 from ministry_member where user_id = $1`, [leader.userId])).rowCount).toBe(0)
    expect((await pool.query(`select 1 from auth.users where id = $1`, [leader.userId])).rowCount).toBe(0)

    await expect(signInWith(leader)).rejects.toThrow()
  })

  it('keeps an account another Ministry’s Roster still holds', async () => {
    const leader = await addPersonWithAccount(ministry, 'Dual Ministry', 'leader')
    const elsewhere = await createMinistryWithAdmin('Hillside Church')
    await pool.query(
      `insert into person (ministry_id, full_name, phone, user_id) values ($1, $2, $3, $4)`,
      [elsewhere.id, 'Dual Ministry', leader.phone, leader.userId],
    )

    await remove(leader.personId)

    expect((await pool.query(`select 1 from auth.users where id = $1`, [leader.userId])).rowCount).toBe(1)
    expect((await pool.query(`select 1 from person where id = $1 and user_id is null`, [leader.personId])).rowCount).toBe(1)
  })

  it('withholds what was queued for them, resolves their items and closes their plans', async () => {
    const hannah = await woman('Hannah Loose Ends')
    const ruth = await woman('Ruth Planned')
    const { rows: queued } = await pool.query<{ id: string }>(
      `insert into outbound_message
         (ministry_id, carries_rates_line, person_id, to_phone, body, enqueued_at, message_kind)
       select ministry_id, false, id, phone, 'hello', now(), 'no_reply' from person where id = $1
       returning id`,
      [hannah],
    )
    const { rows: item } = await pool.query<{ id: string }>(
      `insert into follow_up_item (ministry_id, kind, person_id, raised_at, payload)
       values ($1, 'group_placement_wanted', $2, now(), '{}') returning id`,
      [ministry.id, hannah],
    )
    const plan = crypto.randomUUID()
    await pool.query(
      `insert into intended_pairing (id, ministry_id, leader_id, participant_id, planned_at)
       values ($1, $2, $3, $4, now())`,
      [plan, ministry.id, ruth, hannah],
    )

    await remove(hannah)

    const { rows: message } = await pool.query(
      `select withheld_reason, sent_at from outbound_message where id = $1`,
      [queued[0]!.id],
    )
    expect(message).toEqual([{ withheld_reason: 'recipient_was_removed', sent_at: null }])
    const { rows: resolved } = await pool.query(
      `select resolved_at is not null as resolved, resolved_by from follow_up_item where id = $1`,
      [item[0]!.id],
    )
    expect(resolved).toEqual([{ resolved: true, resolved_by: ministry.adminUserId }])
    const { rows: closed } = await pool.query(
      `select outcome, refusal from intended_pairing where id = $1`,
      [plan],
    )
    expect(closed).toEqual([{ outcome: 'refused', refusal: 'relationship.participant_was_removed' }])
  })

  it('withholds, at the moment of sending, anything queued for them afterwards', async () => {
    const hannah = await woman('Hannah Later Text')
    const queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    try {
      expect(await queue.mayReceive(ministry.id, hannah)).toBeNull()
      await remove(hannah)
      expect(await queue.mayReceive(ministry.id, hannah)).toBe('recipient_was_removed')
    } finally {
      await queue.close()
    }
  })

  it('refuses to pair them afterwards, whoever asks', async () => {
    const grace = await woman('Grace Later')
    const hannah = await woman('Hannah Later')
    await remove(hannah)

    await expect(
      service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [grace],
        participantIds: [personId(hannah)],
      }),
    ).rejects.toThrow(new PairingRefused('relationship.participant_was_removed'))
    await expect(
      service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [personId(hannah)],
        participantIds: [grace],
      }),
    ).rejects.toThrow(new PairingRefused('relationship.leader_was_removed'))
  })

  it('brings them back as the same Person when they fill in Intake again', async () => {
    const phone = aTestPhoneNumber()
    const hannah = await woman('Hannah Returns', phone)
    await remove(hannah)

    const { rows: goal } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    const form: IntakeFormFields = {
      fullName: 'Hannah Returns',
      phone,
      email: null,
      ageBand: '25-34',
      gender: 'female',
      goalId: goal[0]!.id,
      availability: ['monday:12'],
      smsConsent: true,
      contactSharing: 'granted',
      source: 'pastor_link',
      intakePath: null,
      declaredSide: null,
      experience: null,
      groupId: null,
    }
    await service().execute({ type: 'intake.submit', ministryId: ministry.id, form })

    expect(await removal(hannah)).toEqual([{ removed_by: ministry.adminUserId, restored: true }])
    expect(
      (await pool.query(`select 1 from person where ministry_id = $1 and phone = $2`, [ministry.id, phone])).rowCount,
    ).toBe(1)
    expect((await rosterPage()).roster.rows.map((row) => row.person_id)).toContain(hannah)
    expect(await statusOf(hannah)).toBe('ready_to_pair')
  })

  it('hears a text from a number a removed Person shared, as the one still on the Roster', async () => {
    const phone = aTestPhoneNumber()
    const removed = await woman('Sam Shared', phone)
    const stays = await woman('Alex Shared', phone)
    await remove(removed)

    const sender = async (): Promise<PersonId | undefined> => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        const { rows } = await client.query<{ person_id: string }>(
          `select person_id from app.sender_of_inbound($1)`,
          [phone],
        )
        await client.query('rollback')
        return rows[0] ? personId(rows[0].person_id) : undefined
      } finally {
        client.release()
      }
    }

    expect(await sender()).toBe(stays)
  })
})
