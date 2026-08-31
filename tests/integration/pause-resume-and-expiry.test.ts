import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days, weeks } from '~/domain/clock'
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

  it('tells everyone the relationship is running again when an Admin resumes', async () => {
    const church = await aMinistry('Returning Chapel')
    const { leader, participant, relationship } = await church.aRelationship(
      'Back Leader',
      'Waiting Participant',
    )

    await church.pauseAt(at(0), relationship)
    await church.resumeAt(at(1), relationship)

    // Each side is told the other side's names, and the message says what
    // actually happened. *You have been paired* is true on the day the match is
    // made and would be a Ministry telling somebody they had been matched to the
    // person they have been meeting all year.
    expect(await inbox(church.ministry, leader)).toEqual([
      'Returning Chapel: Your discipleship with Waiting Participant has been resumed! ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])
    expect(await inbox(church.ministry, participant)).toEqual([
      'Returning Chapel: Your discipleship with Back Leader has been resumed! ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])

    // Nobody's number travelled with either message, and nothing was minted.
    const { rows: sent } = await pool.query<{ discloses_person_id: string | null }>(
      `select discloses_person_id from outbound_message where ministry_id = $1`,
      [church.ministry.id],
    )
    expect(sent.map((row) => row.discloses_person_id)).toEqual([null, null])

    const { rows: live } = await pool.query(
      `select 1 from invitation where relationship_id = $1`,
      [relationship],
    )
    expect(live).toEqual([])
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

  it('takes back a question it had out, and chases nobody about it', async () => {
    const church = await aMinistry('Mid-Week Chapel')
    const { leader, relationship } = await church.aRelationship('Stepped Back', 'Their Participant')

    // Monday's question goes out; the Admin pauses on Tuesday.
    await church.tickAt(at(0))
    expect(await inbox(church.ministry, leader)).toHaveLength(1)

    const tuesday = new Date(at(0).getTime() + days(1))
    await church.pauseAt(tuesday, relationship)

    // Wednesday is when the reminder would have fired. It does not: Discipler
    // does not chase a Leader who has just stepped back.
    await church.tickAt(new Date(at(0).getTime() + days(2)))
    await church.tickAt(new Date(at(0).getTime() + days(3)))
    expect(await inbox(church.ministry, leader)).toHaveLength(1)

    const { rows: events } = await pool.query<{ type: string }>(
      `select type from ministry_event
        where subject_id = $1 and type like 'checkin.question%'
        order by occurred_at`,
      [relationship],
    )
    expect(events.map((row) => row.type)).toEqual(['checkin.question_withdrawn'])
  })

  it('refuses a period nobody could have selected, at the table itself', async () => {
    // The guard at the command boundary is the one an Admin meets. This is the one
    // a hand-written `insert` meets, and it is the reason `readStandingPause` may
    // go on throwing: a period outside the five leaves nothing to guess at, but
    // both readers go through it -- the tick and Care Needed -- so a single drifted
    // row would otherwise take down a whole Ministry's tick and its whole care
    // queue. Stopped here, it costs one statement.
    const church = await aMinistry('Hand-Written Chapel')
    const { relationship } = await church.aRelationship('Constrained', 'Their Participant')

    const forge = (periodWeeks: string) =>
      pool.query(
        `insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         values ($1, now(), 'relationship.paused', 'relationship', $2, $3::jsonb)`,
        [church.ministry.id, relationship, periodWeeks],
      )

    // A number outside the five, a number that is not one at all, and no period
    // at all -- the last of which a check constraint passes by default, because
    // SQL NULL is not false. Each has to be refused by name.
    for (const payload of [
      '{"periodWeeks": 3}',
      '{"periodWeeks": 0}',
      '{"periodWeeks": "2"}',
      '{"periodWeeks": null}',
      '{}',
    ]) {
      await expect(forge(payload)).rejects.toThrow(
        /ministry_event_pause_carries_a_selectable_period/,
      )
    }

    // And the five still go in, so the constraint guards rather than forbids.
    for (const period of [1, 2, 4, 8, 12]) {
      await expect(forge(`{"periodWeeks": ${period}}`)).resolves.toBeDefined()
    }
  })

  it('keeps a silence that had already accrued before the Pause was taken', async () => {
    // The other half of *withdrawn, not passed over*, and the one a Pause must not
    // reach. A question asked on Monday, reminded on Tuesday and passed over on
    // Wednesday is a silence the Leader owns by the time an Admin pauses on
    // Wednesday afternoon. Nothing was taken back -- the conversation had already
    // given up on it and moved to the next relationship -- so the week stands.
    //
    // *A Pause fell somewhere inside this conversation* cannot tell the two apart,
    // and a Leader coming back from a fortnight away would find a week of their own
    // silence quietly forgiven. The spec is explicit: **the pause does not answer
    // the old ones**.
    //
    // Two relationships on one Leader, because that is the only shape where a
    // question can lapse while the conversation it belongs to is still open. With
    // one, the sequence closes on the pass-over and there is no window left to
    // pause inside.
    const church = await aMinistry('Already Silent Chapel')
    const leader = await church.congregant('Leads Two')
    const firstParticipant = await church.congregant('First Participant')
    const secondParticipant = await church.congregant('Second Participant')

    const before = new Date(firstWeek.getTime() - weeks(1))
    for (const participant of [firstParticipant, secondParticipant]) {
      await pairOneToOne(church.ministry, leader, participant, {
        createdAt: before,
        acceptedAt: before,
      })
    }

    // Monday asks about the first of them. Tuesday reminds. Wednesday gives up on
    // it and moves the conversation on to the second.
    await church.tickAt(at(0))
    await church.tickAt(new Date(at(0).getTime() + days(1)))
    await church.tickAt(new Date(at(0).getTime() + days(2)))

    const { rows: asked } = await pool.query<{ relationship_id: string }>(
      `select distinct on (relationship_id) relationship_id
         from checkin_prompt where ministry_id = $1 order by relationship_id, step`,
      [church.ministry.id],
    )
    expect(asked).toHaveLength(2)

    const { rows: order } = await pool.query<{ relationship_id: string }>(
      `select relationship_id from checkin_prompt
        where ministry_id = $1 order by step limit 1`,
      [church.ministry.id],
    )
    const lapsed = order[0]?.relationship_id
    expect(lapsed).toBeDefined()

    // Wednesday afternoon: the Admin pauses the relationship whose question had
    // already been given up on. The conversation is still open -- it is waiting on
    // the other one -- so this pause falls squarely inside the same sequence.
    await church.pauseAt(
      new Date(at(0).getTime() + days(2) + 60_000),
      lapsed as string,
    )

    // Nothing was withdrawn. There was no open question of theirs to withdraw.
    const { rows: withdrawals } = await pool.query<{ type: string }>(
      `select type from ministry_event
        where subject_id = $1 and type = 'checkin.question_withdrawn'`,
      [lapsed],
    )
    expect(withdrawals).toEqual([])

    // And the week is still on the record, still unanswered. This is the
    // assertion the old bound failed: it dropped the row because *a* pause
    // landed in the sequence, without asking whether it had taken anything back.
    const { rows: weeksOnRecord } = await pool.query<{
      relationship_id: string
      answered_at: Date | null
    }>(
      `select relationship_id, answered_at from relationship_weeks($1)
        where relationship_id = $2`,
      [church.ministry.id, lapsed],
    )
    expect(weeksOnRecord).toHaveLength(1)
    expect(weeksOnRecord[0]?.answered_at).toBeNull()
  })

  it('takes back a question a new week displaces before any tick noticed the Pause', async () => {
    // The narrow window, and the one the domain tests cannot reach on their own:
    // an Admin who pauses between the last tick and the cadence hour. The very
    // next tick opens a new week, and a new week abandons the old conversation
    // outright -- so the tick that would have withdrawn the question never gets
    // to look at it.
    //
    // Left there, the week reads as the Leader's silence: a prompt with no reply,
    // no withdrawal event, and nothing in `relationship_weeks` to say Discipler
    // had stopped asking. One week closer to `Stalled` for a question nobody was
    // owed an answer to.
    //
    // Two relationships on one Leader again, and for a related reason: with one,
    // pausing it leaves the Leader with nothing to be asked about, no new week
    // comes due, and the ordinary mid-week withdrawal handles it. The displacement
    // only happens when something else is still running.
    const church = await aMinistry('Displaced Chapel')
    const leader = await church.congregant('Leads Two More')
    const firstParticipant = await church.congregant('Paused Participant')
    const secondParticipant = await church.congregant('Running Participant')

    const before = new Date(firstWeek.getTime() - weeks(1))
    for (const participant of [firstParticipant, secondParticipant]) {
      await pairOneToOne(church.ministry, leader, participant, {
        createdAt: before,
        acceptedAt: before,
      })
    }

    // Week zero asks about the first of them, and nothing comes back.
    await church.tickAt(at(0))

    const { rows: order } = await pool.query<{ relationship_id: string }>(
      `select relationship_id from checkin_prompt
        where ministry_id = $1 order by step limit 1`,
      [church.ministry.id],
    )
    const asked = order[0]?.relationship_id
    expect(asked).toBeDefined()

    // A minute before the next cadence hour -- after every tick that could have
    // withdrawn it, and before the one that displaces it.
    await church.pauseAt(new Date(at(1).getTime() - 60_000), asked as string)
    await church.tickAt(at(1))

    const { rows: withdrawals } = await pool.query<{ reason: string }>(
      `select payload ->> 'reason' as reason from ministry_event
        where subject_id = $1 and type = 'checkin.question_withdrawn'`,
      [asked],
    )
    expect(withdrawals).toMatchObject([{ reason: 'paused' }])

    // And the week is off the record rather than standing as an unanswered one.
    // This is the assertion that fails without the withdrawal: the prompt is
    // still there, unanswered, and nothing else says it was taken back.
    const { rows: weeksOnRecord } = await pool.query(
      `select relationship_id from relationship_weeks($1) where relationship_id = $2`,
      [church.ministry.id, asked],
    )
    expect(weeksOnRecord).toEqual([])

    // The Leader is still asked about the one still running, and told nothing
    // about the one that is paused.
    expect(await inbox(church.ministry, leader)).toHaveLength(2)
  })

  it('never counts a withdrawn question as a week of silence', async () => {
    const church = await aMinistry('Unpenalised Chapel')
    const { leader, relationship } = await church.aRelationship('Unpenalised', 'Their Participant')

    // Week zero: asked, and nothing came back. A silence the Leader owns.
    await church.tickAt(at(0))

    // Week one: asked, then paused a day later, so the question is taken back.
    await church.tickAt(at(1))
    await church.pauseAt(new Date(at(1).getTime() + days(1)), relationship)
    await church.tickAt(new Date(at(1).getTime() + days(2)))
    await church.resumeAt(new Date(at(1).getTime() + days(3)), relationship)

    // Week two: asked again, and again nothing came back.
    await church.tickAt(at(2))
    await church.tickAt(at(3))

    // Weeks zero and two are two silences, but they are not *consecutive* --
    // week one is not on the record at all, because Discipler took its question
    // back. Counted, the three would have been a stall a week ago.
    expect(about(await church.careAt(at(3)), relationship)).toEqual([])

    // And the rule still bites on silences the Leader actually owns: weeks two
    // and three run consecutively, which is two.
    await church.tickAt(at(4))
    expect(about(await church.careAt(at(4)), relationship)).toMatchObject([
      { source: 'relationship', state: 'stalled', reasons: [{ kind: 'gone_silent' }] },
    ])

    // No reminder ever went out for the withdrawn question -- one message per
    // week asked, and nothing else.
    expect(await inbox(church.ministry, leader)).toHaveLength(6)
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
