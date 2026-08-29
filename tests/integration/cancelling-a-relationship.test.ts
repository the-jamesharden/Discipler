import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { CancellationRefused } from '~/domain/errors'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Cancelling a relationship nobody accepted. The point of it is the pool: people
 * are never held out of pairing by a decision nobody made, so the test that
 * matters is what their Participation Status says afterwards.
 */

describe('cancelling a relationship nobody accepted', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const createdAt = new Date('2026-03-02T09:00:00Z')
  let clock = createTestClock(createdAt)
  const restart = () => {
    clock = createTestClock(createdAt)
  }
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

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const roster = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aNumber() }))

  const pair = async (leader: PersonId, participant: PersonId) => {
    await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [leader],
      participantIds: [participant],
    })
    const { rows } = await pool.query<{ id: string }>(
      `select r.id from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1 and m.role = 'leader' and r.ministry_id = $2`,
      [leader, ministry.id],
    )
    return relationshipId(rows[0]!.id)
  }

  /** As the Roster shows it, derived rather than stored. */
  const statusOf = async (person: PersonId) => {
    const client = await signInAs(ministry)
    const { data, error } = await client
      .from('person')
      .select('participation_status')
      .eq('id', person)
      .single()
    if (error) throw new Error(error.message)
    return (data as { participation_status: string }).participation_status
  }

  it('returns everyone in it to the suggestion pool', async () => {
    restart()
    const leader = await roster('David Ellis')
    const participant = await roster('Emily Johnson')
    const relationship = await pair(leader, participant)

    expect(await statusOf(participant)).toBe('paired')

    clock.advanceTo(new Date(createdAt.getTime() + days(6)))
    await service().execute({
      type: 'relationship.cancel',
      ministryId: ministry.id,
      relationshipId: relationship,
      cancelledBy: ministry.adminUserId,
    })

    // The Participant is pairable again, which is the whole point of the command.
    expect(await statusOf(participant)).toBe('ready_to_pair')

    // And the Leader's cap is freed too: every open membership closes, whatever
    // role it held.
    const { rows: open } = await pool.query(
      `select 1 from relationship_member where relationship_id = $1 and ended_at is null`,
      [relationship],
    )
    expect(open).toHaveLength(0)

    // Who decided, as well as when and why. Disbanding a relationship tells nobody
    // in it, so an unattributed one is the kind of act the product rules require a
    // record of.
    const { rows: ended } = await pool.query<{
      ended_reason: string
      ended_at: Date
      ended_by: string
    }>(
      `select ended_reason, ended_at, ended_by from relationship where id = $1`,
      [relationship],
    )
    expect(ended[0]?.ended_reason).toBe('cancelled')
    expect(ended[0]?.ended_by).toBe(ministry.adminUserId)

    // And in history, which is append-only and outlives the membership -- the
    // column is nulled if the Admin later leaves the Ministry; this is not.
    const { rows: events } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event where subject_id = $1 and type = 'relationship.cancelled'`,
      [relationship],
    )
    expect(events[0]?.payload).toMatchObject({
      waitedDays: 6,
      cancelledBy: ministry.adminUserId,
    })
  })

  it('refuses a canceller who is not in the Ministry', async () => {
    // Holding an account is not standing to disband somebody else's relationship.
    // The composite key on `ended_by` is what refuses it, and it reaches the caller
    // as a refusal code rather than as a Postgres error.
    restart()
    const relationship = await pair(await roster('Omar Haddad'), await roster('Petra Lang'))
    const elsewhere = await createMinistryWithAdmin('Northside Fellowship')

    await expect(
      service().execute({
        type: 'relationship.cancel',
        ministryId: ministry.id,
        relationshipId: relationship,
        cancelledBy: elsewhere.adminUserId,
      }),
    ).rejects.toThrow(
      expect.objectContaining({ refusal: 'relationship.canceller_is_not_in_this_ministry' }),
    )

    // And nothing was half-done: the relationship stands and everyone is still in it.
    const { rows } = await pool.query<{ ended_at: Date | null }>(
      `select ended_at from relationship where id = $1`,
      [relationship],
    )
    expect(rows[0]?.ended_at).toBeNull()
  })

  it('leaves the follow-up item standing, for an Admin to close deliberately', async () => {
    restart()
    const leader = await roster('Grace Miller')
    const participant = await roster('Hannah Reed')
    const relationship = await pair(leader, participant)

    clock.advanceTo(new Date(createdAt.getTime() + days(5)))
    await service().execute({ type: 'scheduled.tick', ministryId: ministry.id })
    await service().execute({
      type: 'relationship.cancel',
      ministryId: ministry.id,
      relationshipId: relationship,
      cancelledBy: ministry.adminUserId,
    })

    // Never cleared by the event that raised it and never clears itself. Cancelling
    // is one of the things an Admin might do about it, not the act of closing it.
    const { rows } = await pool.query(
      `select 1 from follow_up_item where relationship_id = $1 and resolved_at is null`,
      [relationship],
    )
    expect(rows).toHaveLength(1)
  })

  it('refuses one every Leader has already accepted', async () => {
    restart()
    const leader = await roster('Isaac Prince')
    const participant = await roster('Julia North')
    const relationship = await pair(leader, participant)

    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [leader],
    )
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      email: `leader-${crypto.randomUUID()}@example.test`,
      password: 'a-long-enough-password',
      email_confirm: true,
    })
    if (error) throw new Error(error.message)

    clock.advanceTo(new Date(createdAt.getTime() + days(1)))
    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: invitationToken(rows[0]!.token),
      fullName: 'Isaac Prince',
      userId: data.user.id,
    })

    // Stopping one that has started is an *ending*, carries a required outcome,
    // and is a different command.
    await expect(
      service().execute({
        type: 'relationship.cancel',
        ministryId: ministry.id,
        relationshipId: relationship,
        cancelledBy: ministry.adminUserId,
      }),
    ).rejects.toThrow(CancellationRefused)
  })

  it('refuses a relationship this Ministry does not hold', async () => {
    restart()
    await expect(
      service().execute({
        type: 'relationship.cancel',
        ministryId: ministry.id,
        relationshipId: relationshipId('00000000-0000-4000-8000-0000000000ff'),
        cancelledBy: ministry.adminUserId,
      }),
    ).rejects.toThrow(expect.objectContaining({ refusal: 'relationship.not_found' }))
  })
})
