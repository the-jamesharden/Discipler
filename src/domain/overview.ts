import { REMINDER_AFTER_HOURS, type Satisfaction } from './check-in'
import { isoWeekOf, weekAfter, type IsoWeek } from './week'

/**
 * The numbers the Overview tab reads off the Week-by-Week History. Facts in, rates
 * out, and the three rates are kept apart on purpose: the response rate and the
 * meeting rate answer different questions and must never be conflated.
 *
 * Over last week's relationship-weeks, where last week is the last finished week
 * (`lastFinishedWeek` below), in the Ministry's timezone. Every figure that
 * carries them says *last week*, so the window is on the screen and not only in
 * the denominator.
 */
export interface CheckInCounts {
  /** Weeks a Leader was asked about a relationship: every relationship-week covered. */
  readonly sent: number
  /** Weeks with an `answeredAt`. */
  readonly answered: number
  /** Weeks where `met` is true. */
  readonly held: number
  /** Weeks carrying a satisfaction, by which one. */
  readonly rated: Readonly<Record<Satisfaction, number>>
}

export interface CheckInRates {
  /** Answered over sent. */
  readonly response: number
  /** Held over answered. */
  readonly meeting: number
  /**
   * Outstanding plus good over rated. Okay counts against it: it is a rated week
   * that was neither (Pastor feedback, ticket 03).
   */
  readonly quality: number
}

export const NO_CHECK_INS: CheckInCounts = {
  sent: 0,
  answered: 0,
  held: 0,
  rated: { outstanding: 0, good: 0, okay: 0, concern: 0 },
}

/**
 * A whole-number percentage, and zero where there is nothing to divide by. Zero
 * rather than NaN because an empty Ministry's Overview reads *0%*, which is the
 * honest empty state the tab promises, rather than a blank.
 */
export const percentage = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.round((part / whole) * 100)

export const ratedTotal = (counts: CheckInCounts): number =>
  counts.rated.outstanding + counts.rated.good + counts.rated.okay + counts.rated.concern

export const checkInRates = (counts: CheckInCounts): CheckInRates => ({
  response: percentage(counts.answered, counts.sent),
  meeting: percentage(counts.held, counts.answered),
  quality: percentage(counts.rated.outstanding + counts.rated.good, ratedTotal(counts)),
})

/**
 * How long the Overview waits on a week's Check-In Sequence before it reads the
 * week anyway: one question's full lapse, a day to the reminder and a day more
 * before the conversation moves on. Derived from the reminder rather than written
 * down as forty-eight, because whatever the reminder clock becomes, this is twice
 * it.
 */
export const WEEK_WAITED_ON_FOR_HOURS = REMINDER_AFTER_HOURS * 2

/**
 * The week the rates and both rings are over: the last finished week. The most
 * recent ISO week before the current one, in the Ministry's timezone, whose
 * Check-In Sequences have all closed or opened `WEEK_WAITED_ON_FOR_HOURS` ago.
 *
 * Not simply the week before this one. A relationship-week belongs to the week
 * its sequence opened in, and a sequence stays open while answers can still
 * come -- its questions are reminded and given up on a day apart, and a new
 * week's cadence displaces whatever is left. So a Ministry that checks in late
 * in the week would see the week before this one read 0% on Monday and climb as
 * the answers arrived, the very thing a window of last week exists to stop.
 * Waiting for the week to finish holds the figures still from the moment it
 * does until the next one does, whatever day the cadence falls on.
 *
 * Closed is `closedAt` set, however the sequence ended -- answered through, or
 * abandoned because it was given up on, displaced, opted out of or emptied by a
 * Pause -- because nothing more can arrive in a closed sequence. Every one of
 * the week's sequences, not most: one still running is one whose answers would
 * still move the figures.
 *
 * But waited on for forty-eight hours from its opening and no longer. A Leader
 * who answers nothing is passed over one relationship at a time, two days each,
 * so their conversation can run until the next cadence displaces it; waiting on
 * it would make *last week* quietly mean the week before last for as long as
 * they stayed silent. The answers that matter have come by then, and one that
 * arrives later may still move last week's figures, which is accepted.
 *
 * A week nobody was asked in has nothing still running, so it is finished and
 * reads as empty rather than as the week before it, which would be a different
 * week under the words *last week*.
 */
export const lastFinishedWeek = (
  sequences: readonly { readonly openedAt: Date; readonly closedAt: Date | null }[],
  now: Date,
  timeZone: string,
): IsoWeek => {
  const waitedOn = WEEK_WAITED_ON_FOR_HOURS * 3_600_000
  const running = new Set(
    sequences
      .filter((sequence) => sequence.closedAt === null && now.getTime() - sequence.openedAt.getTime() < waitedOn)
      .map((sequence) => isoWeekOf(sequence.openedAt, timeZone)),
  )

  // Each step back passes one week that is in the set, and the set is finite.
  let week = weekAfter(isoWeekOf(now, timeZone), -1)
  while (running.has(week)) week = weekAfter(week, -1)
  return week
}
