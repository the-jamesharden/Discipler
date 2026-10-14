import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { NO_CHECK_INS, lastFinishedWeek, type CheckInCounts } from '~/domain/overview'
import { isoWeek } from '~/domain/week'
import { overviewFrom } from '~/platform/supabase/overview-reader'
import type { HistoryInputs } from '~/platform/supabase/relationship-history'

/**
 * Which week the Overview's rates and rings are over (follow-up to PR #27):
 * the last finished week, the most recent ISO week before the current one, in
 * the Ministry Timezone, whose Check-In Sequences have all closed.
 *
 * A relationship-week belongs to the week its sequence opened in, and a
 * sequence stays open while answers can still come. Read as plain *the week
 * before this one*, a Ministry that checks in on Sundays would see last week
 * read 0% on Monday and climb as the answers came in -- the very thing the
 * window exists to stop. Read as the last finished week, the figures hold still
 * from the moment a week finishes until the next one does, on every check-in
 * day.
 *
 * Driven through `overviewFrom` with no database near it, so the window is
 * proved in milliseconds against the zones the product is used in.
 */

const chicago = 'America/Chicago'
const newYork = 'America/New_York'

const hours = (n: number) => n * 3_600_000
const later = (instant: Date, n: number) => new Date(instant.getTime() + hours(n))

let numbered = 0
const anId = () => `00000000-0000-4000-8000-${String(++numbered).padStart(12, '0')}`

/** What the Leader said about one relationship that week, if anything. */
type Said = { met: boolean; satisfaction?: 'outstanding' | 'good' | 'okay' | 'concern' } | null

/**
 * One Check-In Sequence: the rows `relationship_week_answers` emits for it, one
 * per relationship it covered, each carrying the sequence's own opening and
 * closing. `closedAt` null is a sequence still open.
 */
const aSequence = (openedAt: Date, closedAt: Date | null, said: readonly Said[]) => {
  const sequence = anId()
  return said.map((answer) => ({
    relationship_id: anId(),
    sequence_id: sequence,
    opened_at: openedAt.toISOString(),
    closed_at: closedAt?.toISOString() ?? null,
    asked_at: openedAt.toISOString(),
    answered_at: answer ? later(openedAt, 1).toISOString() : null,
    met: answer ? answer.met : null,
    satisfaction: answer?.satisfaction ?? null,
    concern_open: false,
  }))
}

/** A Ministry's history with nothing in it but the sequences, which is all the rates read. */
const historyOf = (timeZone: string, ...sequences: ReturnType<typeof aSequence>[]): HistoryInputs => ({
  timeZone,
  relationships: [],
  members: [],
  people: [],
  weeks: [],
  concerns: [],
  pauses: [],
  answers: sequences.flat(),
  followUps: [],
})

const countsAt = (history: HistoryInputs, now: Date): CheckInCounts =>
  overviewFrom(history, createTestClock(now)).counts

const windowAt = (history: HistoryInputs, now: Date) =>
  lastFinishedWeek(
    history.answers.map((row) => ({
      openedAt: new Date(String(row.opened_at)),
      closedAt: row.closed_at ? new Date(String(row.closed_at)) : null,
    })),
    now,
    history.timeZone!,
  )

/** One relationship-week, answered *met* and rated outstanding. */
const outstanding: Said = { met: true, satisfaction: 'outstanding' }
const notMet: Said = { met: false }

const ONE_OUTSTANDING: CheckInCounts = {
  sent: 1,
  answered: 1,
  held: 1,
  rated: { outstanding: 1, good: 0, okay: 0, concern: 0 },
}

/** Two asked about, one answered *we did not meet*: a week that reads differently from the one above. */
const TWO_SENT_ONE_NOT_MET: CheckInCounts = {
  sent: 2,
  answered: 1,
  held: 0,
  rated: { outstanding: 0, good: 0, okay: 0, concern: 0 },
}

/**
 * Chicago in October 2026 is five hours behind UTC. `2026-W40` runs Monday 28
 * September to Sunday 4 October; `W41` is 5-11 October, `W42` 12-18 and `W43`
 * 19-25.
 */
const chicagoAt = (day: number, hour: number, month = 10) =>
  new Date(Date.UTC(2026, month - 1, day, hour + 5))

describe('the last finished week, on a Sunday cadence', () => {
  // SAU BCM checks in on Sundays at four in the afternoon.
  const w40 = aSequence(chicagoAt(4, 16), chicagoAt(6, 16), [outstanding])
  const w41Open = aSequence(chicagoAt(11, 16), null, [notMet, null])
  const w41Closed = aSequence(chicagoAt(11, 16), chicagoAt(13, 16), [notMet, null])

  it("reads the week before last on Monday, while last Sunday's sequence is still open", () => {
    // Monday morning: last week's Sunday conversation opened eighteen hours ago
    // and can still be answered. Its one answer so far is not last week's figure.
    const monday = chicagoAt(12, 9)
    expect(countsAt(historyOf(chicago, w40, w41Open), monday)).toEqual(ONE_OUTSTANDING)
    expect(windowAt(historyOf(chicago, w40, w41Open), monday)).toBe(isoWeek('2026-W40'))
  })

  it('moves on to last week once its sequence closes, and holds still until the next one finishes', () => {
    const history = historyOf(chicago, w40, w41Closed)
    expect(countsAt(history, chicagoAt(14, 9))).toEqual(TWO_SENT_ONE_NOT_MET)
    expect(countsAt(history, chicagoAt(17, 20))).toEqual(TWO_SENT_ONE_NOT_MET)

    // This Sunday's sequence opens in this week, and Monday finds it still open:
    // neither moves the figures off the week that finished.
    const w42Open = aSequence(chicagoAt(18, 16), null, [outstanding])
    expect(countsAt(historyOf(chicago, w40, w41Closed, w42Open), chicagoAt(18, 17))).toEqual(TWO_SENT_ONE_NOT_MET)
    expect(countsAt(historyOf(chicago, w40, w41Closed, w42Open), chicagoAt(19, 9))).toEqual(TWO_SENT_ONE_NOT_MET)
    expect(windowAt(historyOf(chicago, w40, w41Closed, w42Open), chicagoAt(19, 9))).toBe(isoWeek('2026-W41'))
  })
})

describe('the last finished week, on a Thursday cadence', () => {
  const w40 = aSequence(chicagoAt(1, 16), chicagoAt(3, 16), [outstanding])

  it('is last week from Monday when its sequences closed over the weekend', () => {
    const w41 = aSequence(chicagoAt(8, 16), chicagoAt(10, 16), [notMet, null])
    expect(countsAt(historyOf(chicago, w40, w41), chicagoAt(12, 0, 10))).toEqual(TWO_SENT_ONE_NOT_MET)
  })

  it('is the week before when a sequence of last week is still open on Monday', () => {
    // A Leader with three relationships who answered none: each question waits a
    // day, is reminded and waits another, so the conversation runs into this week.
    const w41 = aSequence(chicagoAt(8, 16), null, [null, null, null])
    expect(countsAt(historyOf(chicago, w40, w41), chicagoAt(12, 9))).toEqual(ONE_OUTSTANDING)
  })
})

describe('the last finished week, on a Monday cadence', () => {
  const w41 = aSequence(chicagoAt(5, 16), chicagoAt(7, 16), [notMet, null])

  it('is last week all of Monday, before and after the cadence comes round', () => {
    expect(countsAt(historyOf(chicago, w41), chicagoAt(12, 8))).toEqual(TWO_SENT_ONE_NOT_MET)

    const w42Open = aSequence(chicagoAt(12, 16), null, [outstanding])
    expect(countsAt(historyOf(chicago, w41, w42Open), chicagoAt(12, 17))).toEqual(TWO_SENT_ONE_NOT_MET)
  })
})

describe('what finished means', () => {
  const w40 = aSequence(chicagoAt(4, 16), chicagoAt(6, 16), [outstanding])
  const monday = chicagoAt(12, 9)

  it('is every sequence of the week closed, not most of them', () => {
    // Two Leaders asked last Sunday. One has finished; the other can still answer.
    const finished = aSequence(chicagoAt(11, 16), chicagoAt(11, 17), [notMet])
    const running = aSequence(chicagoAt(11, 16), null, [null])
    expect(countsAt(historyOf(chicago, w40, finished, running), monday)).toEqual(ONE_OUTSTANDING)
  })

  it('counts a sequence closed without an answer as closed', () => {
    // Given up on, displaced, opted out of or emptied by a Pause: all four close
    // a sequence `abandoned`, and nothing more can arrive in it.
    const abandoned = aSequence(chicagoAt(11, 16), chicagoAt(13, 16), [null])
    expect(countsAt(historyOf(chicago, w40, abandoned), monday)).toEqual({
      sent: 1,
      answered: 0,
      held: 0,
      rated: { outstanding: 0, good: 0, okay: 0, concern: 0 },
    })
  })

  it('reaches back past more than one week still open', () => {
    // Not a thing the cadence leaves behind, since a new week displaces the old
    // one's sequence; but a stuck sequence skips its own week and no more.
    const w39 = aSequence(chicagoAt(27, 16, 9), chicagoAt(29, 16, 9), [notMet, null])
    const w40Open = aSequence(chicagoAt(4, 16), null, [outstanding])
    const w41Open = aSequence(chicagoAt(11, 16), null, [outstanding])
    expect(countsAt(historyOf(chicago, w39, w40Open, w41Open), monday)).toEqual(TWO_SENT_ONE_NOT_MET)
    expect(windowAt(historyOf(chicago, w39, w40Open, w41Open), monday)).toBe(isoWeek('2026-W39'))

    // The week after, the stuck week is behind a finished one and holds nothing up.
    const w42 = aSequence(chicagoAt(18, 16), chicagoAt(18, 18), [outstanding])
    expect(countsAt(historyOf(chicago, w39, w40Open, w41Open, w42), chicagoAt(19, 9))).toEqual(ONE_OUTSTANDING)
  })

  it('is true of a week nobody was asked in, which reads as empty rather than as the week before', () => {
    // Every relationship paused for the whole of last week: no sequence opened,
    // so nothing in it is still running, and last week honestly had no check-ins.
    expect(countsAt(historyOf(chicago, w40), monday)).toEqual(NO_CHECK_INS)
    expect(windowAt(historyOf(chicago, w40), monday)).toBe(isoWeek('2026-W41'))
  })

  it('leaves a brand-new Ministry empty, before and during its first conversation', () => {
    expect(countsAt(historyOf(chicago), monday)).toEqual(NO_CHECK_INS)

    // Its first Sunday's sequence still open on Monday: the week before it is
    // finished and held nothing.
    const first = aSequence(chicagoAt(11, 16), null, [outstanding])
    expect(countsAt(historyOf(chicago, first), monday)).toEqual(NO_CHECK_INS)
  })
})

describe('the last finished week at a year end', () => {
  // 2026 is a long ISO year: `2026-W53` runs Monday 28 December to Sunday 3
  // January 2027, and `2027-W01` opens on Monday 4 January. Chicago is six hours
  // behind UTC in winter.
  const chicagoWinter = (year: number, month: number, day: number, hour: number) =>
    new Date(Date.UTC(year, month - 1, day, hour + 6))

  const w52 = aSequence(chicagoWinter(2026, 12, 27, 16), chicagoWinter(2026, 12, 29, 16), [outstanding])
  const mondayOfW01 = chicagoWinter(2027, 1, 4, 9)

  it('reads 2026-W52 in 2027-W01 while the Sunday of 2026-W53 is still open', () => {
    const w53 = aSequence(chicagoWinter(2027, 1, 3, 16), null, [notMet, null])
    expect(countsAt(historyOf(chicago, w52, w53), mondayOfW01)).toEqual(ONE_OUTSTANDING)
    expect(windowAt(historyOf(chicago, w52, w53), mondayOfW01)).toBe(isoWeek('2026-W52'))
  })

  it('reads 2026-W53 as last week in 2027-W01 once it has finished', () => {
    const w53 = aSequence(chicagoWinter(2027, 1, 3, 16), chicagoWinter(2027, 1, 3, 18), [notMet, null])
    expect(countsAt(historyOf(chicago, w52, w53), mondayOfW01)).toEqual(TWO_SENT_ONE_NOT_MET)
    expect(windowAt(historyOf(chicago, w52, w53), mondayOfW01)).toBe(isoWeek('2026-W53'))
  })
})

describe('the last finished week across a change of the clocks', () => {
  // New York leaves daylight saving at 2am on Sunday 1 November 2026. A Sunday
  // cadence at 9pm falls at 01:00 UTC on 26 October (EDT) and at 02:00 UTC on
  // Monday 2 November (EST): the second is a Sunday on the Ministry's wall, in
  // `2026-W44`, and a Monday in UTC.
  const w43 = aSequence(new Date('2026-10-26T01:00:00Z'), new Date('2026-10-26T03:00:00Z'), [outstanding])
  // Half past midnight on the Monday after, in New York: `2026-W45`.
  const justAfterMidnight = new Date('2026-11-02T05:30:00Z')

  it('puts a Sunday-evening sequence in its own week on the wall, not the UTC one', () => {
    const w44 = aSequence(new Date('2026-11-02T02:00:00Z'), new Date('2026-11-02T03:00:00Z'), [notMet, null])
    expect(countsAt(historyOf(newYork, w43, w44), justAfterMidnight)).toEqual(TWO_SENT_ONE_NOT_MET)
    expect(windowAt(historyOf(newYork, w43, w44), justAfterMidnight)).toBe(isoWeek('2026-W44'))
  })

  it('holds on the week before while that sequence is still open', () => {
    const w44 = aSequence(new Date('2026-11-02T02:00:00Z'), null, [notMet, null])
    expect(countsAt(historyOf(newYork, w43, w44), justAfterMidnight)).toEqual(ONE_OUTSTANDING)
    expect(windowAt(historyOf(newYork, w43, w44), justAfterMidnight)).toBe(isoWeek('2026-W43'))
  })
})
