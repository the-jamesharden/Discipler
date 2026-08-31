import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { personId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Eligibility to lead is a plan an Admin records, and the three things it is
 * independent of are the whole of what makes it useful.
 *
 * It is recorded *before* Intake, which is the reason it exists: a coordinator
 * planning a semester should not have to wait on a form to write down who they have
 * in mind. It therefore cannot be allowed to substitute for Intake, and the refusal
 * that stops it is the database's rather than a screen's.
 *
 * One field, not two. The intended role *is* the leader-pool flag: two flags would
 * have needed a rule for what a Person marked intended-leader but not eligible
 * means, and there is no answer to that question anybody would want to give.
 */

describe('marking a Person eligible to lead', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-09-14T10:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({
      clock: createTestClock(at),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

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

  const mark = (person: string, eligible: boolean) =>
    service().execute({
      type: 'person.set_lead_eligibility',
      ministryId: ministry.id,
      personId: personId(person),
      eligible,
    })

  const eligibilityOf = async (person: string) => {
    const { rows } = await pool.query<{ eligible_to_lead: boolean }>(
      `select eligible_to_lead from person where id = $1`,
      [person],
    )
    return rows[0]?.eligible_to_lead ?? null
  }

  const statusOf = async (person: string) => {
    const { rows } = await pool.query<{ status: string }>(
      `select participation_status(p) as status from person p where p.id = $1`,
      [person],
    )
    return rows[0]?.status ?? null
  }

  it('can be recorded before the Person has completed Intake', async () => {
    const planned = await addPerson(ministry, 'Marcus Webb', {
      intake: false,
      phone: aNumber(),
    })

    expect(await eligibilityOf(planned)).toBe(false)
    expect(await statusOf(planned)).toBe('no_intake_submitted')

    await mark(planned, true)

    expect(await eligibilityOf(planned)).toBe(true)
    // And it changed nothing about whether they are being discipled, which is the
    // only question the status answers.
    expect(await statusOf(planned)).toBe('no_intake_submitted')
  })

  it('does not make them pairable, and does not substitute for Intake', async () => {
    const planned = await addPerson(ministry, 'Nadia Farouk', {
      intake: false,
      phone: aNumber(),
    })
    const ready = await addPerson(ministry, 'Omar Haddad', { phone: aNumber() })

    await mark(planned, true)

    // The refusal is the database's. A screen that filtered them out of a list
    // would leave the rule in a place an Admin arriving from a stale page walks
    // straight past.
    await expect(
      service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [personId(planned)],
        participantIds: [personId(ready)],
      }),
    ).rejects.toThrow(PairingRefused)
  })

  it('is independent of whether they hold an account', async () => {
    // Every Person on an imported Roster has no account, and the plan is recorded
    // long before anybody signs in -- an account is minted by accepting an
    // invitation, which is downstream of the pairing this is a plan for.
    const withoutAccount = await addPerson(ministry, 'Priya Raman', {
      intake: false,
      phone: aNumber(),
    })
    const withAccount = await addPersonWithAccount(ministry, 'Quinn Alvarez', 'leader', {
      phone: aNumber(),
    })

    await mark(withoutAccount, true)
    await mark(withAccount.personId, true)

    expect(await eligibilityOf(withoutAccount)).toBe(true)
    expect(await eligibilityOf(withAccount.personId)).toBe(true)
  })

  it('is independent of how many relationships they already lead', async () => {
    // There is no cap on how many relationships a Leader already holds, so nothing
    // about leading two makes the plan to have them lead a third any different.
    const leader = await addPerson(ministry, 'Ruth Adeyemi', { phone: aNumber() })
    await pairOneToOne(ministry, leader, await addPerson(ministry, 'Sam Doyle', { phone: aNumber() }))
    await pairOneToOne(
      ministry,
      leader,
      await addPerson(ministry, 'Tomas Vidal', { phone: aNumber() }),
    )

    await mark(leader, true)

    expect(await eligibilityOf(leader)).toBe(true)
    // Leading never sets Participation Status, and eligibility does not either.
    expect(await statusOf(leader)).toBe('ready_to_pair')
  })

  it('is withdrawn by the same act with the other answer', async () => {
    const person = await addPerson(ministry, 'Uche Nwosu', { phone: aNumber() })

    await mark(person, true)
    expect(await eligibilityOf(person)).toBe(true)

    await mark(person, false)
    expect(await eligibilityOf(person)).toBe(false)

    // Both decisions are in history, in the order they were made. A plan that
    // changed is a fact about the semester, not a column that quietly flipped.
    const { rows } = await pool.query<{ payload: { eligible: boolean } }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'person.lead_eligibility_set'
        order by occurred_at, recorded_at`,
      [person],
    )
    expect(rows.map((row) => row.payload.eligible)).toEqual([true, false])
  })
})
