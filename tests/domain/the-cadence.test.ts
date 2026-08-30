import { describe, expect, it } from 'vitest'
import { checkInDueThisWeek, type CheckInRelationship, type CheckInSnapshot } from '~/domain/check-in'
import { personId, relationshipId } from '~/domain/ids'

/**
 * What makes a Leader due. One prompt per ISO week in the Ministry's own
 * timezone, at the Ministry's own day and hour -- and a cadence edit that moves
 * next week without moving this one.
 */

const james = personId('00000000-0000-4000-8000-0000000000d0')
const at = (iso: string) => new Date(iso)

const leads = (over: Partial<CheckInRelationship> = {}): CheckInRelationship => ({
  relationshipId: relationshipId('00000000-0000-4000-8000-0000000000b1'),
  role: 'leader',
  startedAt: at('2026-03-02T09:00:00Z'),
  participantNames: ['Emily'],
  acceptedAt: at('2026-03-02T09:00:00Z'),
  paused: false,
  // Monday 8pm, which is where every test below starts.
  cadence: { day: 1, hour: 20 },
  ...over,
})

const snapshot = (over: Partial<CheckInSnapshot> = {}): CheckInSnapshot => ({
  personId: james,
  phone: '+15550100001',
  timeZone: 'Europe/London',
  leads: [leads()],
  openSequence: null,
  lastCheckInAt: null,
  ...over,
})

// Monday 24 August 2026 is the Monday of ISO week 2026-W35. London is on BST, so
// 8pm local is 19:00Z.
const mondayEightPm = at('2026-08-24T19:00:00Z')

describe('when a Leader comes due', () => {
  it('is not due before the Ministry’s hour has arrived', () => {
    expect(checkInDueThisWeek(snapshot(), at('2026-08-24T18:59:00Z'))).toBeNull()
  })

  it('is due once the hour has arrived, and the instant is the cadence’s', () => {
    expect(checkInDueThisWeek(snapshot(), mondayEightPm)).toEqual(mondayEightPm)
  })

  it('stays due for the rest of the week, so a missed run is not a missed week', () => {
    expect(checkInDueThisWeek(snapshot(), at('2026-08-27T09:00:00Z'))).toEqual(
      mondayEightPm,
    )
  })

  it('is not due twice in one ISO week', () => {
    const asked = snapshot({ lastCheckInAt: mondayEightPm })
    expect(checkInDueThisWeek(asked, at('2026-08-27T09:00:00Z'))).toBeNull()
  })

  it('comes due again in the next ISO week', () => {
    const asked = snapshot({ lastCheckInAt: mondayEightPm })
    expect(checkInDueThisWeek(asked, at('2026-08-31T19:00:00Z'))).toEqual(
      at('2026-08-31T19:00:00Z'),
    )
  })

  it('has nothing to be due for when it leads nothing that is asked about', () => {
    expect(checkInDueThisWeek(snapshot({ leads: [] }), mondayEightPm)).toBeNull()
    expect(
      checkInDueThisWeek(snapshot({ leads: [leads({ paused: true })] }), mondayEightPm),
    ).toBeNull()
    expect(
      checkInDueThisWeek(snapshot({ leads: [leads({ acceptedAt: null })] }), mondayEightPm),
    ).toBeNull()
  })
})

describe('a cadence edit', () => {
  // The ADR's worked example: Monday 8pm moved to Wednesday 7pm, on a Tuesday.
  const wednesdaySeven = leads({ cadence: { day: 3, hour: 19 } })

  it('does not produce a second prompt in a week that already had one', () => {
    const edited = snapshot({ leads: [wednesdaySeven], lastCheckInAt: mondayEightPm })
    // Wednesday 26 August, 7pm London.
    expect(checkInDueThisWeek(edited, at('2026-08-26T18:00:00Z'))).toBeNull()
  })

  it('takes effect the following week', () => {
    const edited = snapshot({ leads: [wednesdaySeven], lastCheckInAt: mondayEightPm })
    const nextWednesday = at('2026-09-02T18:00:00Z')
    expect(checkInDueThisWeek(edited, at('2026-08-31T19:00:00Z'))).toBeNull()
    expect(checkInDueThisWeek(edited, nextWednesday)).toEqual(nextWednesday)
  })

  /**
   * Moved *earlier*, mid-week, before this week's prompt has gone out -- the
   * direction that can silently lose a week rather than double one.
   *
   * The Ministry asked on Friday mornings and had not yet been asked this week.
   * On Tuesday the coordinator moves the cadence to Monday 8pm, an instant that
   * is already past. The week still gets exactly one prompt: a day late rather
   * than never, which is the visible oddity the ADR names and accepts.
   */
  it('never leaves a week with no prompt at all', () => {
    const fridayMornings = leads({ cadence: { day: 5, hour: 9 } })
    const tuesday = at('2026-08-25T09:00:00Z')
    // Last asked in the previous ISO week, so this week is still owed one.
    const lastCheckInAt = at('2026-08-21T08:00:00Z')

    // Before the edit: Friday has not come round, so Tuesday is not yet due.
    const before = snapshot({ leads: [fridayMornings], lastCheckInAt })
    expect(checkInDueThisWeek(before, tuesday)).toBeNull()

    // After it: Monday 8pm has already passed, so the week comes due at once
    // rather than being skipped entirely.
    const after = snapshot({
      leads: [leads({ cadence: { day: 1, hour: 20 } })],
      lastCheckInAt,
    })
    expect(checkInDueThisWeek(after, tuesday)).toEqual(mondayEightPm)
  })
})

describe('the week boundary is the Ministry’s, not the server’s', () => {
  // The same instant is Sunday night in London and Monday morning in Sydney, so
  // one Ministry is finishing a week while the other has started the next one.
  const sundayNight = at('2026-08-30T23:30:00Z')

  it('reads the ISO week against the Ministry timezone', () => {
    const sydney = snapshot({
      timeZone: 'Australia/Sydney',
      leads: [leads({ cadence: { day: 1, hour: 9 } })],
      lastCheckInAt: at('2026-08-24T09:00:00Z'),
    })
    // Monday 31 August, 9:30am in Sydney: a new ISO week, so due.
    expect(checkInDueThisWeek(sydney, sundayNight)).toEqual(at('2026-08-30T23:00:00Z'))

    const london = snapshot({
      timeZone: 'Europe/London',
      leads: [leads({ cadence: { day: 1, hour: 9 } })],
      lastCheckInAt: at('2026-08-24T08:00:00Z'),
    })
    // Still Sunday night in London: the same ISO week, already asked.
    expect(checkInDueThisWeek(london, sundayNight)).toBeNull()
  })
})

/**
 * The dispatcher itself, driven through the command boundary -- which is where
 * the ticket's outcome actually lives. A Leader is asked because a week came due,
 * and the message carries the cadence that made it due.
 */

import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect, OutboundMessageDraft } from '~/domain/effects'
import { createSequentialIds, ministryId } from '~/domain/ids'

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')

const tick = (due: readonly CheckInSnapshot[], at: Date) =>
  handleCommand({ type: 'scheduled.tick', ministryId: ministry }, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'Riverside Chapel',
    appBaseUrl: 'https://discipler.example',
    unaccepted: [],
    paused: [],
    checkInsDue: due,
  } satisfies CommandContext)

const messages = (effects: readonly Effect[]): readonly OutboundMessageDraft[] =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

const sequencesOpened = (effects: readonly Effect[]) =>
  effects.filter((effect) => effect.kind === 'checkin.open')

describe('the tick as the dispatcher', () => {
  it('asks nobody before the Ministry’s hour', () => {
    const { effects } = tick([snapshot()], at('2026-08-24T18:00:00Z'))
    expect(sequencesOpened(effects)).toHaveLength(0)
    expect(messages(effects)).toHaveLength(0)
  })

  it('opens one conversation when the week comes due', () => {
    const { effects } = tick([snapshot()], mondayEightPm)
    expect(sequencesOpened(effects)).toHaveLength(1)
    expect(messages(effects)).toHaveLength(1)
    expect(messages(effects)[0]!.body).toContain('Riverside Chapel')
  })

  // The stamp is the cadence instant, not the moment the tick happened to reach
  // this Leader. Those differ by however long the run took, and it is the cadence
  // that has to be recoverable from the row.
  it('stamps the cadence that made the message due, not the moment it ran', () => {
    const ranLate = at('2026-08-24T19:04:31Z')
    const [message] = messages(tick([snapshot()], ranLate).effects)
    expect(message!.scheduledFor).toEqual(mondayEightPm)
    expect(message!.enqueuedAt).toEqual(ranLate)
  })

  it('asks once however often it runs in one week', () => {
    // The first run opens the conversation, which is what sets `lastCheckInAt`.
    expect(sequencesOpened(tick([snapshot()], mondayEightPm).effects)).toHaveLength(1)

    const asked = snapshot({ lastCheckInAt: mondayEightPm })
    for (const hour of ['20', '21', '22']) {
      const later = tick([asked], at(`2026-08-24T${hour}:00:00Z`))
      expect(sequencesOpened(later.effects)).toHaveLength(0)
    }
  })

  it('asks every Leader the week has come due for, and only those', () => {
    const ready = snapshot()
    const alreadyAsked = snapshot({
      personId: personId('00000000-0000-4000-8000-0000000000d1'),
      lastCheckInAt: mondayEightPm,
    })
    const notYet = snapshot({
      personId: personId('00000000-0000-4000-8000-0000000000d2'),
      leads: [leads({ cadence: { day: 5, hour: 9 } })],
    })

    const { effects } = tick([ready, alreadyAsked, notYet], mondayEightPm)
    expect(sequencesOpened(effects)).toHaveLength(1)
    expect(messages(effects)[0]!.scheduledFor).toEqual(mondayEightPm)
  })

  // The dispatcher's own message is the only one a cadence produced. A reply
  // travels back in seconds, and nothing scheduled the thank-you.
  it('leaves the stamp off a conversation nobody scheduled', () => {
    const { effects } = handleCommand(
      { type: 'checkin.start', ministryId: ministry, personId: james },
      {
        ministryId: ministry,
        clock: createTestClock(mondayEightPm),
        ids: createSequentialIds(),
        ministryName: 'Riverside Chapel',
        appBaseUrl: 'https://discipler.example',
        checkIn: snapshot(),
      } satisfies CommandContext,
    )
    expect(messages(effects)[0]!.scheduledFor).toBeNull()
  })
})

describe('an edit mid-week', () => {
  const OPT_OUT = 'Reply STOP to opt out'

  it('neither cancels nor reschedules the row already enqueued', () => {
    // Monday: the week comes due and the message goes out stamped Monday 8pm.
    const monday = tick([snapshot()], mondayEightPm)
    const [sent] = messages(monday.effects)
    expect(sent!.scheduledFor).toEqual(mondayEightPm)

    // Tuesday: the coordinator moves the cadence to Wednesday 7pm. The row that
    // is already out is not touched by anything the dispatcher does afterwards --
    // it is a value nothing rewrites, and no later run produces a cancellation.
    const edited = snapshot({
      leads: [leads({ cadence: { day: 3, hour: 19 } })],
      lastCheckInAt: mondayEightPm,
    })
    const wednesday = tick([edited], at('2026-08-26T18:00:00Z'))

    // Nothing at all. Not merely no new message -- no cancellation, no closure
    // and no reschedule either, because there is no effect by which this domain
    // could reach back to a row it has already enqueued.
    //
    // Asserting on the emptiness rather than re-reading `sent` is the point: a
    // value already returned cannot change, so an assertion about it could not
    // fail and would prove nothing. The database-level proof that the row itself
    // is untouched belongs to `tests/integration/the-cadence.test.ts`.
    expect(wednesday.effects).toEqual([])
    expect(sent!.scheduledFor).toEqual(mondayEightPm)
  })

  it('moves the following week and no earlier', () => {
    const edited = snapshot({
      leads: [leads({ cadence: { day: 3, hour: 19 } })],
      lastCheckInAt: mondayEightPm,
    })
    // The new week's Monday: the old cadence is gone, so nothing fires.
    expect(sequencesOpened(tick([edited], at('2026-08-31T19:00:00Z')).effects)).toHaveLength(0)
    // Its Wednesday: the new cadence does.
    const nextWeek = tick([edited], at('2026-09-02T18:00:00Z'))
    expect(sequencesOpened(nextWeek.effects)).toHaveLength(1)
    expect(messages(nextWeek.effects)[0]!.scheduledFor).toEqual(at('2026-09-02T18:00:00Z'))
  })

  /**
   * The monthly opt-out rule reads the same timezone the week does.
   *
   * Sydney runs ten hours ahead, so a 9am check-in there is 23:00 UTC on the
   * *previous* day -- and on the first of a month that previous day is in the
   * previous month. Both dates below are chosen so the two readings disagree: a
   * UTC month would drop the language from September's first conversation and add
   * it to September's second.
   */
  const asked = (lastCheckInAt: Date) =>
    snapshot({
      timeZone: 'Australia/Sydney',
      // Tuesday 9am. Tuesday because 1 September 2026 is one, which is what puts
      // the Ministry's day and UTC's in different months.
      leads: [leads({ cadence: { day: 2, hour: 9 } })],
      lastCheckInAt,
    })

  // Tuesday 1 September, 9am Sydney. September's first check-in -- and 31 August
  // in UTC, which is why a UTC reading calls it August's second.
  const septemberFirst = at('2026-08-31T23:00:00Z')

  it('carries the monthly opt-out language on the Ministry’s first of the month', () => {
    // Previously asked on Tuesday 25 August, Sydney. A new month, so it is due.
    const august = at('2026-08-24T23:00:00Z')
    const [message] = messages(tick([asked(august)], septemberFirst).effects)
    expect(message!.body).toContain(OPT_OUT)
  })

  it('does not repeat it later in the Ministry’s same month', () => {
    // Tuesday 8 September, 9am Sydney: the month's second conversation. In UTC
    // the previous one falls in August, and the language would go out twice.
    const [message] = messages(
      tick([asked(septemberFirst)], at('2026-09-07T23:00:00Z')).effects,
    )
    expect(message!.body).not.toContain(OPT_OUT)
  })
})
