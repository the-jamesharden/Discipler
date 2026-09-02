import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days, weeks } from '~/domain/clock'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { NO_CHECK_INS, checkInRates } from '~/domain/overview'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { readOverview } from '~/platform/supabase/overview-reader'
import { createCommandService } from '~/service/command-service'
import type { Overview } from '~/service/ports'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
} from '../support/local-supabase'

/**
 * The Overview against the real database: the cards, the two headcounts and the
 * three rates, read through a signed-in Admin's session with the same clock the
 * commands ran on.
 *
 * Every scenario gets a Ministry of its own. The scheduled tick runs for a whole
 * Ministry at once, and the rates run over every relationship-week on record, so
 * two scenarios sharing one would each count the other's weeks -- a coupling
 * between tests and not a fact about the product.
 */

describe('the Overview', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))
  const minutesAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 60_000)

  beforeAll(async () => {
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

  /**
   * One Ministry, asking on Monday evenings in London, with the handful of verbs a
   * scenario needs: run the tick, answer a text, read the Overview.
   */
  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name)
    await pool.query(
      `update ministry
          set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20
        where id = $1`,
      [ministry.id],
    )

    const serviceAt = (now: Date) =>
      createCommandService({
        clock: createTestClock(now),
        ids,
        store,
        appBaseUrl: 'https://discipler.test',
      })

    const congregant = async (fullName: string) =>
      personId(await addPerson(ministry, fullName, { phone: aNumber() }))

    return {
      ministry,
      serviceAt,
      congregant,
      tickAt: (now: Date) =>
        serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: PersonId, body: string) =>
        serviceAt(now).execute({
          type: 'sms.inbound',
          ministryId: ministry.id,
          personId: person,
          body,
        }),
      overviewAt: async (now: Date): Promise<Overview> =>
        readOverview(await signInAs(ministry), ministry.id, createTestClock(now)),
      /** A Leader with `count` relationships, all accepted a week before week zero. */
      leading: async (leaderName: string, count: number) => {
        const leader = await congregant(leaderName)
        const relationships: string[] = []
        for (let n = 0; n < count; n += 1) {
          const participant = await congregant(`${leaderName} Participant ${n + 1}`)
          // A minute apart, so the order the Leader is asked in rests on the fact
          // rather than on a tiebreak.
          const formedAt = new Date(firstWeek.getTime() - weeks(1) + n * 60_000)
          relationships.push(
            await pairOneToOne(ministry, leader, participant, {
              createdAt: formedAt,
              acceptedAt: formedAt,
            }),
          )
        }
        return { leader, relationships }
      },
    }
  }

  it('reads zeros and an empty list for a Ministry with nobody on the Roster', async () => {
    const church = await aMinistry('Empty Chapel')

    await expect(church.overviewAt(at(0))).resolves.toEqual({
      relationships: [],
      unsurfacedUnaccepted: 0,
      active: 0,
      paused: 0,
      counts: NO_CHECK_INS,
      completedThisWeek: 0,
    })
  })

  it('counts a week answered 1 then A as sent, answered, held and rated outstanding', async () => {
    const church = await aMinistry('Outstanding Chapel')
    const { leader, relationships } = await church.leading('Outstanding Leader', 1)

    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'A')

    const overview = await church.overviewAt(minutesAfter(at(0), 3))

    expect(overview.counts).toEqual({
      sent: 1,
      answered: 1,
      held: 1,
      rated: { outstanding: 1, good: 0, concern: 0 },
    })
    expect(checkInRates(overview.counts)).toEqual({ response: 100, meeting: 100, quality: 100 })
    expect(overview.completedThisWeek).toBe(1)
    expect(overview.active).toBe(1)
    expect(overview.paused).toBe(0)
    expect(overview.relationships).toEqual([
      {
        relationshipId: relationships[0],
        leaderNames: ['Outstanding Leader'],
        participantNames: ['Outstanding Leader Participant 1'],
        acceptedAt: new Date(firstWeek.getTime() - weeks(1)),
        state: 'healthy',
        reasons: [],
        openConcerns: 0,
      },
    ])
  })

  it('counts a 2 as answered and not held', async () => {
    const church = await aMinistry('Honest Chapel')
    const { leader } = await church.leading('Honest Leader', 1)

    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '2')

    const overview = await church.overviewAt(minutesAfter(at(0), 2))

    expect(overview.counts).toEqual({
      sent: 1,
      answered: 1,
      held: 0,
      rated: { outstanding: 0, good: 0, concern: 0 },
    })
    // A perfect response rate and no meeting rate. One number for both would be
    // wrong about one of them, which is why the two are kept apart.
    expect(checkInRates(overview.counts)).toEqual({ response: 100, meeting: 0, quality: 0 })
    expect(overview.completedThisWeek).toBe(1)
  })

  it('keeps the three denominators apart', async () => {
    const church = await aMinistry('Divided Chapel')
    const { leader } = await church.leading('Divided Leader', 2)

    // Both relationships were covered, so both count as sent. The first is
    // answered -- met, and good -- and the second's question is now in front of
    // the Leader, unanswered.
    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'B')

    const overview = await church.overviewAt(minutesAfter(at(0), 3))

    expect(overview.counts).toEqual({
      sent: 2,
      answered: 1,
      held: 1,
      rated: { outstanding: 0, good: 1, concern: 0 },
    })
    // Half of sent answered; all of answered held; all of rated good.
    expect(checkInRates(overview.counts)).toEqual({ response: 50, meeting: 100, quality: 100 })
    expect(overview.completedThisWeek).toBe(1)
    expect(overview.active).toBe(2)
  })

  it('counts every relationship-week on record, and this week separately', async () => {
    const church = await aMinistry('Remembering Chapel')
    const { leader } = await church.leading('Remembering Leader', 1)

    // Week zero: met and outstanding. Week one: silence, which the second tick
    // closes. Week two: met and a concern.
    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'A')
    await church.tickAt(at(1))
    await church.tickAt(at(2))
    await church.replyAt(minutesAfter(at(2), 1), leader, '1')
    await church.replyAt(minutesAfter(at(2), 2), leader, 'C')
    await church.replyAt(minutesAfter(at(2), 3), leader, 'They have stopped coming on Sundays.')

    const overview = await church.overviewAt(minutesAfter(at(2), 4))

    expect(overview.counts).toEqual({
      sent: 3,
      answered: 2,
      held: 2,
      rated: { outstanding: 1, good: 0, concern: 1 },
    })
    expect(checkInRates(overview.counts)).toEqual({ response: 67, meeting: 100, quality: 50 })
    // Only week two is this week. Week zero was completed too, but not this week.
    expect(overview.completedThisWeek).toBe(1)
    expect(overview.relationships).toMatchObject([{ state: 'needs_care', openConcerns: 1 }])
    // Nothing on the tab carries the Concern's words.
    expect(JSON.stringify(overview)).not.toContain('stopped coming')
  })

  it('hides an unaccepted relationship younger than five days, and counts it', async () => {
    const church = await aMinistry('Waiting Chapel')
    const leader = await church.congregant('Waiting Leader')
    const participant = await church.congregant('Waiting Participant')

    await pairOneToOne(church.ministry, leader, participant, {
      createdAt: new Date(at(0).getTime() - days(2)),
      acceptedAt: null,
    })

    const overview = await church.overviewAt(at(0))

    expect(overview.relationships).toEqual([])
    expect(overview.unsurfacedUnaccepted).toBe(1)
    expect(overview.active).toBe(0)
    expect(overview.paused).toBe(0)
  })

  it('lists an unaccepted relationship older than five days as awaiting', async () => {
    const church = await aMinistry('Overdue Chapel')
    const leader = await church.congregant('Overdue Leader')
    const participant = await church.congregant('Overdue Participant')

    const relationship = await pairOneToOne(church.ministry, leader, participant, {
      createdAt: new Date(at(0).getTime() - days(6)),
      acceptedAt: null,
    })

    const overview = await church.overviewAt(at(0))

    expect(overview.relationships).toEqual([
      {
        relationshipId: relationship,
        leaderNames: ['Overdue Leader'],
        participantNames: ['Overdue Participant'],
        acceptedAt: null,
        state: 'awaiting_leader_acceptance',
        reasons: [],
        openConcerns: 0,
      },
    ])
    expect(overview.unsurfacedUnaccepted).toBe(0)
    // Awaiting is neither active nor paused.
    expect(overview.active).toBe(0)
    expect(overview.paused).toBe(0)
  })

  it('surfaces an unaccepted relationship on the fifth day exactly', async () => {
    const church = await aMinistry('Fifth Day Chapel')
    const leader = await church.congregant('Fifth Day Leader')
    const participant = await church.congregant('Fifth Day Participant')

    await pairOneToOne(church.ministry, leader, participant, {
      createdAt: new Date(at(0).getTime() - days(5)),
      acceptedAt: null,
    })

    // The same threshold ticket 07's escalation fires at, so the card and the
    // Follow-Up Item appear on the same day.
    const overview = await church.overviewAt(at(0))
    expect(overview.relationships).toHaveLength(1)
    expect(overview.unsurfacedUnaccepted).toBe(0)
  })

  it('counts a paused relationship as paused and not active', async () => {
    const church = await aMinistry('Resting Chapel')
    const { relationships } = await church.leading('Resting Leader', 1)

    await church.serviceAt(at(0)).execute({
      type: 'relationship.pause',
      ministryId: church.ministry.id,
      relationshipId: relationshipId(relationships[0]!),
      pausedBy: church.ministry.adminUserId,
    })

    const overview = await church.overviewAt(minutesAfter(at(0), 1))

    expect(overview.paused).toBe(1)
    expect(overview.active).toBe(0)
    expect(overview.relationships).toMatchObject([
      { relationshipId: relationships[0], state: 'paused' },
    ])
  })

  it('gives an ended relationship no card, and keeps its weeks in the rates', async () => {
    const church = await aMinistry('Finished Chapel')
    const { leader, relationships } = await church.leading('Finished Leader', 1)

    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'A')

    // Ended on the real clock rather than on the test's. The fixture opens both
    // memberships at the moment it runs, and the database refuses a membership
    // that ends before it started -- which is a fact about the fixture, not the
    // product. What the Overview is asked is whether an ended relationship gets a
    // card, and `ended_at` answers that whenever the ending happened.
    await church.serviceAt(new Date()).execute({
      type: 'relationship.end',
      ministryId: church.ministry.id,
      relationshipId: relationshipId(relationships[0]!),
      reason: 'They finished the material together.',
      outcome: 'completed',
      endedBy: church.ministry.adminUserId,
    })

    const overview = await church.overviewAt(minutesAfter(at(0), 4))

    expect(overview.relationships).toEqual([])
    expect(overview.active).toBe(0)
    expect(overview.paused).toBe(0)
    // The rates run over every relationship-week on record. A week that happened
    // does not stop having happened because the relationship later ended.
    expect(overview.counts.sent).toBe(1)
    expect(overview.counts.answered).toBe(1)
  })

  it('orders the cards by Leader, then Participants', async () => {
    const church = await aMinistry('Ordered Chapel')
    await church.leading('Zoe Leader', 1)
    await church.leading('Amos Leader', 2)

    const overview = await church.overviewAt(at(0))

    expect(
      overview.relationships.map((card) => `${card.leaderNames[0]} / ${card.participantNames[0]}`),
    ).toEqual([
      'Amos Leader / Amos Leader Participant 1',
      'Amos Leader / Amos Leader Participant 2',
      'Zoe Leader / Zoe Leader Participant 1',
    ])
  })

  it("never shows another Ministry's relationships", async () => {
    const mine = await aMinistry('Mine Chapel')
    const theirs = await aMinistry('Theirs Chapel')
    const { leader } = await theirs.leading('Their Leader', 1)

    await theirs.tickAt(at(0))
    await theirs.replyAt(minutesAfter(at(0), 1), leader, '1')
    await theirs.replyAt(minutesAfter(at(0), 2), leader, 'A')

    // Nothing of theirs in mine.
    await expect(mine.overviewAt(minutesAfter(at(0), 3))).resolves.toEqual({
      relationships: [],
      unsurfacedUnaccepted: 0,
      active: 0,
      paused: 0,
      counts: NO_CHECK_INS,
      completedThisWeek: 0,
    })

    // And asking for theirs as my Admin reads the same empty state: the policy
    // returns no Ministry, and there is nothing to be wrong about.
    const asMine = await signInAs(mine.ministry)
    await expect(
      readOverview(asMine, theirs.ministry.id, createTestClock(minutesAfter(at(0), 3))),
    ).resolves.toEqual({
      relationships: [],
      unsurfacedUnaccepted: 0,
      active: 0,
      paused: 0,
      counts: NO_CHECK_INS,
      completedThisWeek: 0,
    })
  })
})
