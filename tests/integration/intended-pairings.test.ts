import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A pairing an import planned, settled against the real database: formed once
 * both have completed Intake, with the invitation pairing by hand would send;
 * refused by the same constraints the Pair page hits, and recorded by its code
 * with a Follow-Up Item; fulfilled by an Admin pairing them by hand. ADR-0022.
 */

describe('the pairings an import planned', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
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
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  /** Somebody imported and nothing more: on the Roster, no Intake yet. */
  const imported = async (name: string, gender: 'male' | 'female' = 'male') =>
    personId(await addPerson(ministry, name, { phone: number(), intake: false, answers: { gender } }))

  /** As an import records it, ahead of the import reading its own file (step 5). */
  const planned = async (leader: PersonId, participant: PersonId) => {
    const id = crypto.randomUUID()
    await pool.query(
      `insert into intended_pairing (id, ministry_id, leader_id, participant_id, planned_at)
       values ($1, $2, $3, $4, now())`,
      [id, ministry.id, leader, participant],
    )
    return id
  }

  const planRow = async (id: string) => {
    const { rows } = await pool.query(
      `select outcome, refusal, relationship_id, closed_at from intended_pairing where id = $1`,
      [id],
    )
    return rows[0]
  }

  const membersOf = async (relationshipId: string) => {
    const { rows } = await pool.query(
      `select role, person_id from relationship_member where relationship_id = $1 order by role`,
      [relationshipId],
    )
    return rows as { role: string; person_id: string }[]
  }

  it('waits while either has not completed Intake, and forms the pairing the moment both have', async () => {
    const sam = await imported('Sam Rivera')
    const taylor = await imported('Taylor Brooks')
    const plan = await planned(sam, taylor)

    // Neither has done anything yet: the plan stands and nothing is sent.
    let settled = await service().settleIntendedPairings(ministry.id)
    expect(settled).toEqual({ fulfilled: 0, refused: 0, waiting: 1 })
    expect((await planRow(plan)).closed_at).toBeNull()

    // One of them, then the other. Still waiting after the first.
    await completeIntake(ministry, sam, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })
    settled = await service().settleIntendedPairings(ministry.id)
    expect(settled.waiting).toBe(1)

    await completeIntake(ministry, taylor, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })
    settled = await service().settleIntendedPairings(ministry.id)
    expect(settled).toEqual({ fulfilled: 1, refused: 0, waiting: 0 })

    const row = await planRow(plan)
    expect(row.outcome).toBe('fulfilled')
    expect(row.relationship_id).not.toBeNull()
    expect(await membersOf(row.relationship_id)).toEqual([
      { role: 'leader', person_id: sam },
      { role: 'participant', person_id: taylor },
    ])

    // Formed, not activated: it awaits the Discipler's acceptance, and the one
    // text that went out is the invitation to them.
    const { rows: relationship } = await pool.query(
      `select accepted_at from relationship where id = $1`,
      [row.relationship_id],
    )
    expect(relationship[0]?.accepted_at).toBeNull()
    const { rows: queued } = await pool.query(
      `select person_id, body from outbound_message where person_id = any($1)`,
      [[sam, taylor]],
    )
    expect(queued).toHaveLength(1)
    expect(queued[0]?.person_id).toBe(sam)
    expect(queued[0]?.body).toContain('/invitation/')

    // Settling again finds nothing to do.
    expect(await service().settleIntendedPairings(ministry.id)).toEqual({ fulfilled: 0, refused: 0, waiting: 0 })
  })

  it('refuses a Disciple already being discipled one-to-one, by the database’s own rule, and raises a Follow-Up Item', async () => {
    const alex = await imported('Alex Morgan')
    const casey = await imported('Casey Nguyen')
    const plan = await planned(alex, casey)

    // Casey is paired by hand with somebody else first, and both complete Intake.
    await completeIntake(ministry, alex, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })
    await completeIntake(ministry, casey, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })
    const other = personId(await addPerson(ministry, 'Jordan Lee', { phone: number(), answers: { gender: 'male' } }))
    await pairOneToOne(ministry, other, casey)

    const settled = await service().settleIntendedPairings(ministry.id)
    expect(settled).toEqual({ fulfilled: 0, refused: 1, waiting: 0 })

    const row = await planRow(plan)
    expect(row.outcome).toBe('refused')
    expect(row.refusal).toBe('relationship.participant_already_in_a_one_to_one')
    expect(row.relationship_id).toBeNull()

    // Never silent: on the Follow-Up tab, about the Disciple, until an Admin acts.
    const { rows: items } = await pool.query(
      `select person_id, relationship_id, payload from follow_up_item
        where ministry_id = $1 and kind = 'intended_pairing_refused' and resolved_at is null`,
      [ministry.id],
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.person_id).toBe(casey)
    expect(items[0]?.relationship_id).toBeNull()
    expect(items[0]?.payload).toEqual({
      intendedPairingId: plan,
      refusal: 'relationship.participant_already_in_a_one_to_one',
    })

    // Nothing was sent to anybody over it, and nothing was formed.
    const { rows: queued } = await pool.query(
      `select 1 from outbound_message where person_id = any($1)`,
      [[alex]],
    )
    expect(queued).toHaveLength(0)

    // And a closed plan is never retried, whatever changes later.
    expect(await service().settleIntendedPairings(ministry.id)).toEqual({ fulfilled: 0, refused: 0, waiting: 0 })
  })

  it('refuses two people of different genders once both are known, without asking the database', async () => {
    const riley = await imported('Riley Carter', 'female')
    const morgan = await imported('Morgan Blake', 'male')
    const plan = await planned(riley, morgan)

    await completeIntake(ministry, riley, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'female' })
    await completeIntake(ministry, morgan, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })

    expect(await service().settleIntendedPairings(ministry.id)).toEqual({ fulfilled: 0, refused: 1, waiting: 0 })
    expect((await planRow(plan)).refusal).toBe('relationship.gender_must_match')
  })

  it('refuses when one of them has opted out', async () => {
    const drew = await imported('Drew Osei')
    const quinn = await imported('Quinn Ade')
    const plan = await planned(drew, quinn)
    await completeIntake(ministry, drew, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })
    await completeIntake(ministry, quinn, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })
    await optOut(ministry, quinn)

    expect(await service().settleIntendedPairings(ministry.id)).toEqual({ fulfilled: 0, refused: 1, waiting: 0 })
    expect((await planRow(plan)).refusal).toBe('relationship.participant_has_opted_out')
  })

  it('is fulfilled by an Admin pairing the same two people by hand', async () => {
    const nadia = await imported('Nadia Farouk', 'female')
    const uche = await imported('Uche Nwosu', 'female')
    const plan = await planned(nadia, uche)
    await completeIntake(ministry, nadia, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'female' })
    await completeIntake(ministry, uche, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'female' })

    const { effects } = await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [nadia],
      participantIds: [uche],
      declaredGender: null,
    })
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    const row = await planRow(plan)
    expect(row.outcome).toBe('fulfilled')
    expect(row.relationship_id).toBe(created.relationship.id)

    // Nothing left to settle, and nothing formed twice.
    expect(await service().settleIntendedPairings(ministry.id)).toEqual({ fulfilled: 0, refused: 0, waiting: 0 })
  })

  it('keeps a Disciple to one open plan at a time', async () => {
    const one = await imported('Leader One')
    const two = await imported('Leader Two')
    const shared = await imported('Shared Disciple')
    await planned(one, shared)
    await expect(planned(two, shared)).rejects.toThrow(/intended_pairing_one_open_per_disciple/)
  })
})
