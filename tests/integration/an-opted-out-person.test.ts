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
  optOut,
  pairOneToOne,
  recordConsentDecision,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * What `STOP` actually means, once it has been recorded: the Ministry honors what
 * this Person told them.
 *
 * Four things, and they pull in different directions, which is why they are proven
 * together. They receive nothing further. They appear in no suggestion. They raise
 * no care item -- an opted-out Person is not a problem to be solved. And none of
 * that ends a relationship they are already in: opting out is person-level and
 * dated, and a relationship quietly disappearing under a Leader would be Discipler
 * making a pastoral decision nobody asked it to make.
 *
 * A withdrawn SMS consent rides along, because it is a different fact with the same
 * consequence at the outbound queue, and the tick has to survive both.
 */

describe('a Person who has opted out', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35, and
  // the hour this Ministry asks on.
  const mondayEightPm = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  const serviceAt = (at: Date) =>
    createCommandService({
      clock: createTestClock(at),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

  const tickAt = (at: Date) =>
    serviceAt(at).execute({ type: 'scheduled.tick', ministryId: ministry.id })

  /**
   * `STOP` as a Person actually sends it, rather than the fixture's direct write.
   * The two are not the same act: the fixture records the opt-out and nothing else,
   * which is every other test here, and the keyword is what a Leader mid-conversation
   * has to go through.
   */
  const texts = (at: Date, person: PersonId, body: string) =>
    serviceAt(at).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query(
      `update ministry
          set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20
        where id = $1`,
      [ministry.id],
    )
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const congregant = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aNumber() }))

  const inbox = async (person: PersonId) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at`,
      [person],
    )
    return rows
  }

  const statusOf = async (person: PersonId) => {
    const { rows } = await pool.query<{ status: string }>(
      `select participation_status(p) as status from person p where p.id = $1`,
      [person],
    )
    return rows[0]?.status ?? null
  }

  it('is asked for no check-in, and the rest of the Ministry still is', async () => {
    // Opting out ends no relationship, so the cadence still finds them holding an
    // open leader membership on a live relationship. The outbound queue refuses a
    // message to them and the tick is one transaction, so composing the question
    // would roll back every conversation in the Ministry -- this week and every
    // week after it, with nothing on any screen to say why.
    const silent = await congregant('Kofi Mensah')
    const reachable = await congregant('Leah Osei')
    await pairOneToOne(ministry, silent, await congregant('Marcus Webb'))
    await pairOneToOne(ministry, reachable, await congregant('Nora Vance'))

    await optOut(ministry, silent)

    await tickAt(mondayEightPm)

    expect(await inbox(silent)).toHaveLength(0)
    expect(await inbox(reachable)).toHaveLength(1)

    // And no conversation was opened with them either. A sequence nobody can be
    // asked anything in would accrue a week of silence against a Leader who asked
    // to be left alone, and ticket 10 reads that silence as a relationship needing
    // care -- which is exactly the care item this rules out.
    const { rows: opened } = await pool.query(
      `select id from checkin_sequence where person_id = $1`,
      [silent],
    )
    expect(opened).toHaveLength(0)
  })

  it('is likewise not asked once SMS consent is withdrawn rather than opted out', async () => {
    // Two different facts with the same consequence at the outbound queue: an open
    // opt-out, and a consent that no longer stands. The tick has to survive both, so
    // it tests both -- the pair `unacceptedRelationships` already tests.
    const withdrawn = await congregant('Vera Lindqvist')
    const reachable = await congregant('Wesley Boateng')
    await pairOneToOne(ministry, withdrawn, await congregant('Xolani Dube'))
    await pairOneToOne(ministry, reachable, await congregant('Yara Haddad'))

    await recordConsentDecision(ministry, withdrawn, 'sms', false, new Date())

    await tickAt(mondayEightPm)

    expect(await inbox(withdrawn)).toHaveLength(0)
    expect(await inbox(reachable)).toHaveLength(1)
  })

  it('leaves no conversation open when the STOP arrives mid-week', async () => {
    // The one ordering the fixture's direct write cannot reach, and the one the
    // cadence exclusion depends on. Every other test here opts somebody out before a
    // sequence exists; this Leader is already holding an unanswered question when
    // they text.
    //
    // It matters because the exclusion sits on the list the tick iterates, so an
    // opted-out Leader is not reached by the chase either -- no reminder, no passing
    // over, no abandonment. Were the keyword not to close the conversation itself,
    // the row would stay open with nothing left that could ever close it, and ticket
    // 10 would read its unanswered week as a relationship needing care: a care item
    // raised by the act that was supposed to stop them.
    const leaving = await congregant('Rafael Ortiz')
    await pairOneToOne(ministry, leaving, await congregant('Sofia Marchetti'))

    await tickAt(mondayEightPm)
    expect(await inbox(leaving)).toHaveLength(1)

    const { rows: opened } = await pool.query(
      `select id from checkin_sequence where person_id = $1 and closed_at is null`,
      [leaving],
    )
    expect(opened).toHaveLength(1)

    // Wednesday, with the question still unanswered.
    await texts(new Date('2026-08-26T10:00:00Z'), leaving, 'STOP')

    const { rows: stillOpen } = await pool.query(
      `select id from checkin_sequence where person_id = $1 and closed_at is null`,
      [leaving],
    )
    expect(stillOpen).toHaveLength(0)

    // Abandoned rather than completed: the question they never answered stays
    // unanswered, because an opt-out is not an answer.
    const { rows: closed } = await pool.query<{ outcome: string }>(
      `select outcome from checkin_sequence where person_id = $1`,
      [leaving],
    )
    expect(closed.map((row) => row.outcome)).toEqual(['abandoned'])

    // Nothing reopens it, and no further tick runs here to prove that: the tick is
    // the whole Ministry's, and these tests share one, so a tick into a later week
    // would move every other Leader in this file forward and leave the tests below
    // ticking backwards into their own sequences. That the weeks after stay quiet is
    // already `raises no care item of their own, however many ticks run`.
  })

  it('raises no care item of their own, however many ticks run', async () => {
    const silent = await congregant('Olu Adeyemi')
    await pairOneToOne(ministry, silent, await congregant('Priya Raman'))
    await optOut(ministry, silent)

    await tickAt(mondayEightPm)
    await tickAt(new Date('2026-09-07T19:00:00Z'))
    await tickAt(new Date('2026-09-14T19:00:00Z'))

    const { rows } = await pool.query(
      `select id from follow_up_item where person_id = $1 and resolved_at is null`,
      [silent],
    )
    expect(rows).toHaveLength(0)
  })

  it('cannot be paired, as a Participant or as a Leader', async () => {
    // The Roster's own filter is the pairing screen's, and it reads Participation
    // Status -- but the refusal that matters is the database's, because an Admin
    // arriving from a stale page is the case a filtered list cannot cover.
    const silent = await congregant('Ruth Nakamura')
    await optOut(ministry, silent)
    const other = await congregant('Sam Doyle')

    const service = createCommandService({
      clock: createTestClock(mondayEightPm),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

    await expect(
      service.execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [other],
        participantIds: [silent],
      }),
    ).rejects.toThrow(PairingRefused)

    await expect(
      service.execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [silent],
        participantIds: [other],
      }),
    ).rejects.toThrow(PairingRefused)
  })

  it('reads Opted Out while still holding the relationship they were in', async () => {
    // `Opted Out` outranks `Paired` on the Roster: an Admin needs to see what the
    // Person told the Ministry before what the Ministry arranged for them. Nothing
    // is hidden either way -- the membership is still open, and the Roster shows
    // who each Person is in a relationship with in its own column.
    const silent = await congregant('Tomas Vidal')
    const leader = await congregant('Uche Nwosu')
    const relationship = await pairOneToOne(ministry, leader, silent)

    expect(await statusOf(silent)).toBe('paired')

    await optOut(ministry, silent)

    expect(await statusOf(silent)).toBe('opted_out')

    const { rows } = await pool.query<{ ended_at: Date | null }>(
      `select ended_at from relationship where id = $1`,
      [relationship],
    )
    expect(rows[0]?.ended_at).toBeNull()

    const { rows: memberships } = await pool.query(
      `select person_id from relationship_member
        where relationship_id = $1 and ended_at is null`,
      [relationship],
    )
    expect(memberships).toHaveLength(2)
  })
})
