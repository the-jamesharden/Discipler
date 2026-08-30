import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { PauseRefused } from '~/domain/errors'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { readCareNeeded } from '~/platform/supabase/care-needed-reader'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import type { CareNeededItem } from '~/service/ports'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  serviceRoleClient,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Pause, resume and pause expiry, driven through the command boundary against the
 * real database.
 *
 * The three properties the ticket rests on, and none of them is provable without a
 * whole Ministry behind it: that a paused relationship leaves the care queue while
 * everybody stays exactly where they were, that a period running out reaches an
 * Admin without moving anything, and that resuming puts back whatever the history
 * said rather than a clean slate.
 *
 * Every scenario gets a Ministry of its own. The tick runs for a whole Ministry at
 * once, so two scenarios sharing one would have each other's pauses expired by the
 * other's clock -- a coupling between tests, not a fact about the product.
 */

describe('pausing, resuming, and a period running out', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))

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

    const congregant = async (fullName: string) => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
      await completeIntake(ministry, id)
      return id
    }

    /** A Leader and one Participant, accepted a week before week zero. */
    const aRelationship = async (leaderName: string, participantName: string) => {
      const leader = await congregant(leaderName)
      const participant = await congregant(participantName)
      const relationship = await pairOneToOne(ministry, leader, participant, {
        createdAt: new Date(firstWeek.getTime() - weeks(1)),
        acceptedAt: new Date(firstWeek.getTime() - weeks(1)),
      })
      return { leader, participant, relationship: relationshipId(relationship) }
    }

    return {
      ministry,
      congregant,
      aRelationship,
      serviceAt,
      tickAt: (now: Date) =>
        serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: PersonId, body: string) =>
        serviceAt(now).execute({
          type: 'sms.inbound',
          ministryId: ministry.id,
          personId: person,
          body,
        }),
      pauseAt: (now: Date, relationship: string, periodWeeks?: 1 | 2 | 4 | 8 | 12) =>
        serviceAt(now).execute({
          type: 'relationship.pause',
          ministryId: ministry.id,
          relationshipId: relationshipId(relationship),
          ...(periodWeeks === undefined ? {} : { periodWeeks }),
          pausedBy: ministry.adminUserId,
        }),
      resumeAt: (now: Date, relationship: string) =>
        serviceAt(now).execute({
          type: 'relationship.resume',
          ministryId: ministry.id,
          relationshipId: relationshipId(relationship),
          resumedBy: ministry.adminUserId,
        }),
      careAt: async (now: Date): Promise<readonly CareNeededItem[]> =>
        readCareNeeded(await signInAs(ministry), ministry.id, createTestClock(now)),
    }
  }

  /** Everything Care Needed says about one relationship, from any of its sources. */
  const about = (items: readonly CareNeededItem[], relationship: string) =>
    items.filter(
      (item) => item.relationshipId === relationship || item.relationshipId === null,
    )

  /** What Discipler has queued for one Person, in the order it queued it. */
  const inbox = async (ministry: MinistryFixture, person: PersonId) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message
        where ministry_id = $1 and person_id = $2
        order by enqueued_at, id`,
      [ministry.id, person],
    )
    return rows.map((row) => row.body)
  }

  it('suspends that relationship’s check-ins and leaves everything else alone', async () => {
    const church = await aMinistry('Holiday Chapel')
    const { leader, participant, relationship } = await church.aRelationship(
      'Away Leader',
      'Staying Participant',
    )

    await church.pauseAt(at(0), relationship)

    // Three ticks, three weeks, no questions. A paused relationship is covered by
    // no conversation, so it accrues no unanswered week either.
    for (const week of [0, 1, 2]) await church.tickAt(at(week))

    const { rows: asked } = await pool.query(
      `select 1 from checkin_prompt where ministry_id = $1`,
      [church.ministry.id],
    )
    expect(asked).toEqual([])

    // Membership is untouched, which is the whole of *nobody returns to the
    // suggestion pool*: `participation_status` reads open participant
    // memberships, and the participation caps read open memberships of either
    // role.
    const { rows: memberships } = await pool.query<{ person_id: string; ended_at: Date | null }>(
      `select person_id, ended_at from relationship_member where relationship_id = $1`,
      [relationship],
    )
    expect(memberships.map((row) => row.ended_at)).toEqual([null, null])

    const { rows: status } = await pool.query<{ status: string }>(
      `select participation_status(p) as status from person p where p.id = $1`,
      [participant],
    )
    expect(status[0]?.status).toBe('paired')

    // And nobody was told. Discipler stops asking; it does not announce it.
    expect(await inbox(church.ministry, leader)).toEqual([])
    expect(await inbox(church.ministry, participant)).toEqual([])
  })

  it('reads as Paused rather than as anything needing care', async () => {
    const church = await aMinistry('Masked Chapel')
    const { leader, relationship } = await church.aRelationship('Silent Away', 'Their Participant')

    // Two weeks of silence first, which is Stalled and in the care queue.
    await church.tickAt(at(0))
    await church.tickAt(at(1))
    await church.tickAt(at(2))
    expect(about(await church.careAt(at(2)), relationship)).toMatchObject([
      { source: 'relationship', state: 'stalled' },
    ])

    // Then the Admin pauses it, and it leaves the queue. `Paused` masks the
    // derived state -- the Leader is on holiday, not neglecting anybody.
    await church.pauseAt(at(2), relationship)
    expect(about(await church.careAt(at(2)), relationship)).toEqual([])

    // Nothing about the pause answered the three weeks behind it, which is what
    // the resume below is going to find.
    expect(await inbox(church.ministry, leader)).toHaveLength(3)
  })

  it('is Stalled again on resume, and clears only on an answered check-in', async () => {
    const church = await aMinistry('Resurfacing Chapel')
    const { leader, relationship } = await church.aRelationship('Returning', 'Their Participant')

    await church.tickAt(at(0))
    await church.tickAt(at(1))
    await church.tickAt(at(2))
    await church.pauseAt(at(2), relationship)

    await church.resumeAt(at(3), relationship)

    // **Resume must not set Healthy.** The same history that read Stalled before
    // the pause reads Stalled after it -- setting Healthy here would silently
    // erase a live care signal.
    expect(about(await church.careAt(at(3)), relationship)).toMatchObject([
      { source: 'relationship', state: 'stalled', reasons: [{ kind: 'gone_silent' }] },
    ])

    // An answered check-in is what clears it, and nothing an Admin clicks.
    await church.tickAt(at(4))
    await church.replyAt(new Date(at(4).getTime() + 60_000), leader, '1')
    await church.replyAt(new Date(at(4).getTime() + 120_000), leader, 'A')

    expect(about(await church.careAt(at(4)), relationship)).toEqual([])
  })

  it('releases the Starter Message to everyone when an Admin resumes', async () => {
    const church = await aMinistry('Returning Chapel')
    const { leader, participant, relationship } = await church.aRelationship(
      'Back Leader',
      'Waiting Participant',
    )

    // The link the Participant already holds, as acceptance would have left it.
    // A token is unique across every Ministry, not within one, so this cannot be
    // a fixed string: the local database is not reset between runs.
    const held = `already-held-${crypto.randomUUID()}`
    const { error } = await serviceRoleClient().from('invitation').insert({
      ministry_id: church.ministry.id,
      relationship_id: relationship,
      person_id: participant,
      token: held,
      created_at: at(0).toISOString(),
      expires_at: at(2).toISOString(),
    })
    if (error) throw new Error(`Could not issue the decline link: ${error.message}`)

    await church.pauseAt(at(0), relationship)
    await church.resumeAt(at(1), relationship)

    expect(await inbox(church.ministry, leader)).toEqual([
      // First contact for this Leader, so it carries the compliance prefix -- the
      // same message activation would have sent had the relationship not been
      // paused before it ever asked them anything.
      'Returning Chapel: You’re now meeting with Waiting Participant. ' +
        'We’ll check in with you each week to see how it’s going. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])
    expect((await inbox(church.ministry, participant))[0]).toContain(
      'you’ve been matched',
    )

    // And the decline link in it is the one they already hold. A Person holds at
    // most one live invitation per relationship -- there is a unique index saying
    // so -- and a resume that minted a second would be refused by it.
    expect((await inbox(church.ministry, participant))[0]).toContain(
      `https://discipler.test/invitation/${held}`,
    )

    const { rows: live } = await pool.query<{ token: string }>(
      `select token from invitation
        where relationship_id = $1 and person_id = $2 and consumed_at is null`,
      [relationship, participant],
    )
    expect(live.map((row) => row.token)).toEqual([held])
  })

  it('checks in again the week after a resume', async () => {
    const church = await aMinistry('Rhythm Chapel')
    const { leader, relationship } = await church.aRelationship('Rhythm', 'Their Participant')

    await church.pauseAt(at(0), relationship)
    await church.tickAt(at(1))
    await church.resumeAt(at(1), relationship)
    await church.tickAt(at(2))

    const { rows: asked } = await pool.query<{ relationship_id: string }>(
      `select relationship_id from checkin_prompt where ministry_id = $1`,
      [church.ministry.id],
    )
    expect(asked.map((row) => row.relationship_id)).toEqual([relationship])
    expect(await inbox(church.ministry, leader)).toHaveLength(2)
  })

  describe('when the period runs out', () => {
    it('raises an item, sends nothing, and leaves the relationship paused', async () => {
      const church = await aMinistry('Expired Chapel')
      const { leader, participant, relationship } = await church.aRelationship(
        'Forgotten Leader',
        'Their Participant',
      )

      await church.pauseAt(at(0), relationship, 2)

      // A week in: still running, and nothing has been raised.
      await church.tickAt(at(1))
      expect(about(await church.careAt(at(1)), relationship)).toEqual([])

      await church.tickAt(at(2))

      expect(about(await church.careAt(at(2)), relationship)).toMatchObject([
        {
          source: 'follow_up',
          relationshipId: relationship,
          // The period the Admin is being asked to review. A fortnight running
          // out and a summer running out are different reviews.
          payload: { kind: 'pause_expired', periodWeeks: 2 },
        },
      ])

      // Nothing was sent, by expiry or by the check-in cadence: the relationship
      // is still paused, so it is still covered by no conversation.
      expect(await inbox(church.ministry, leader)).toEqual([])
      expect(await inbox(church.ministry, participant)).toEqual([])

      const { rows: asked } = await pool.query(
        `select 1 from checkin_prompt where ministry_id = $1`,
        [church.ministry.id],
      )
      expect(asked).toEqual([])
    })

    it('raises one item however many times the tick runs', async () => {
      const church = await aMinistry('Patient Chapel')
      const { relationship } = await church.aRelationship('Patient', 'Their Participant')

      await church.pauseAt(at(0), relationship, 1)
      for (const week of [1, 2, 3, 4]) await church.tickAt(at(week))

      const { rows: items } = await pool.query<{ count: string }>(
        `select count(*) from follow_up_item
          where relationship_id = $1 and kind = 'pause_expired'`,
        [relationship],
      )
      expect(items[0]?.count).toBe('1')

      // How often the condition was true survives in the Week-by-Week History
      // rather than in the Care Needed list, so the Admin sees one thing to act on.
      const { rows: events } = await pool.query<{ count: string }>(
        `select count(*) from ministry_event
          where subject_id = $1 and type = 'follow_up.pause_expired'`,
        [relationship],
      )
      expect(events[0]?.count).toBe('1')
    })

    /** The one open item this Ministry has, or a loud failure rather than a guess. */
    const theItem = async (church: Awaited<ReturnType<typeof aMinistry>>, now: Date) => {
      const items = (await church.careAt(now)).filter((each) => each.source === 'follow_up')
      const [item] = items
      if (items.length !== 1 || item?.source !== 'follow_up') {
        throw new Error(`Expected exactly one open item, found ${items.length}`)
      }
      return item
    }

    const openItems = async (church: Awaited<ReturnType<typeof aMinistry>>, now: Date) =>
      (await church.careAt(now)).filter((each) => each.source === 'follow_up')

    it('is not cleared by resuming, and stays closed once resolved', async () => {
      const church = await aMinistry('Deciding Chapel')
      const { relationship } = await church.aRelationship('Deciding', 'Their Participant')

      await church.pauseAt(at(0), relationship, 1)
      await church.tickAt(at(2))

      const item = await theItem(church, at(2))

      // Resuming decides what happens to the relationship. Closing the record is
      // a second act, exactly as it is when an Admin cancels a relationship the
      // acceptance escalation raised.
      await church.resumeAt(at(2), relationship)
      expect(await openItems(church, at(2))).toHaveLength(1)

      await church.serviceAt(at(2)).execute({
        type: 'follow_up.resolve',
        ministryId: church.ministry.id,
        itemId: item.id,
        resolvedBy: church.ministry.adminUserId,
      })

      expect(await openItems(church, at(2))).toEqual([])

      // And it stays closed. The pause is over, so no later run has a condition to
      // raise -- which is what makes resolving-after-resuming terminal.
      await church.tickAt(at(3))
      await church.tickAt(at(6))
      expect(await openItems(church, at(6))).toEqual([])
    })

    it('comes back when an Admin resolves it without deciding anything', async () => {
      const church = await aMinistry('Undecided Chapel')
      const { relationship } = await church.aRelationship('Undecided', 'Their Participant')

      await church.pauseAt(at(0), relationship, 1)
      await church.tickAt(at(2))

      await church.serviceAt(at(2)).execute({
        type: 'follow_up.resolve',
        ministryId: church.ministry.id,
        itemId: (await theItem(church, at(2))).id,
        resolvedBy: church.ministry.adminUserId,
      })
      expect(await openItems(church, at(2))).toEqual([])

      // Resolving records that an Admin acted; it does not resume anybody's
      // check-ins. The relationship is still paused and the period is still spent,
      // so the condition is true again and is raised again -- the same reading the
      // acceptance escalation takes, and the reason a relationship nobody has
      // decided about cannot become permanently invisible.
      await church.tickAt(at(3))
      expect(await openItems(church, at(3))).toMatchObject([
        { relationshipId: relationship, payload: { kind: 'pause_expired', periodWeeks: 1 } },
      ])

      // Still one thing to act on, however many times it was raised.
      const { rows } = await pool.query<{ count: string }>(
        `select count(*) from ministry_event
          where subject_id = $1 and type = 'follow_up.pause_expired'`,
        [relationship],
      )
      expect(rows[0]?.count).toBe('2')
    })

    it('never raises one for a pause an Admin lifted in time', async () => {
      const church = await aMinistry('Early Chapel')
      const { relationship } = await church.aRelationship('Early', 'Their Participant')

      await church.pauseAt(at(0), relationship, 4)
      await church.resumeAt(at(1), relationship)
      for (const week of [2, 4, 6]) await church.tickAt(at(week))

      const { rows } = await pool.query(
        `select 1 from follow_up_item where relationship_id = $1 and kind = 'pause_expired'`,
        [relationship],
      )
      expect(rows).toEqual([])
    })
  })

  describe('what an Admin is refused', () => {
    it('will not pause a relationship nobody has accepted', async () => {
      const church = await aMinistry('Unaccepted Chapel')
      const leader = await church.congregant('Unagreed Leader')
      const participant = await church.congregant('Their Participant')
      const relationship = await pairOneToOne(church.ministry, leader, participant, {
        acceptedAt: null,
      })

      await expect(church.pauseAt(at(0), relationship)).rejects.toThrow(
        new PauseRefused('pause.relationship_not_accepted'),
      )
    })

    it('will not pause one that is already paused', async () => {
      const church = await aMinistry('Twice Chapel')
      const { relationship } = await church.aRelationship('Twice', 'Their Participant')

      await church.pauseAt(at(0), relationship, 12)
      await expect(church.pauseAt(at(1), relationship, 1)).rejects.toThrow(
        new PauseRefused('pause.already_paused'),
      )

      // And the first period still stands: a second pause must not be able to move
      // the expiry date out from under the Admin who set it.
      const { rows } = await pool.query<{ period_weeks: number }>(
        `select period_weeks from relationship_pauses($1) where relationship_id = $2`,
        [church.ministry.id, relationship],
      )
      expect(rows[0]?.period_weeks).toBe(12)
    })

    it('will not resume one that is not paused', async () => {
      const church = await aMinistry('Running Chapel')
      const { relationship } = await church.aRelationship('Running', 'Their Participant')

      await expect(church.resumeAt(at(0), relationship)).rejects.toThrow(
        new PauseRefused('pause.not_paused'),
      )
    })

    it('will not act on a relationship this Ministry does not hold', async () => {
      const church = await aMinistry('Bounded Chapel')
      const elsewhere = await aMinistry('Other Chapel')
      const { relationship } = await elsewhere.aRelationship('Elsewhere', 'Their Participant')

      await expect(church.pauseAt(at(0), relationship)).rejects.toThrow(
        new PauseRefused('pause.relationship_not_found'),
      )
    })
  })
})
