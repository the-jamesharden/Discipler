import type { Satisfaction } from './check-in'

/**
 * The numbers the Overview tab reads off the Week-by-Week History. Facts in, rates
 * out, and the three rates are kept apart on purpose: the response rate and the
 * meeting rate answer different questions and must never be conflated.
 *
 * Over every relationship-week on record, not a recent window. A dashboard that
 * quietly truncated its own denominator would show a rate nothing on the screen
 * could explain.
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
  /** Outstanding plus good over rated. */
  readonly quality: number
}

export const NO_CHECK_INS: CheckInCounts = {
  sent: 0,
  answered: 0,
  held: 0,
  rated: { outstanding: 0, good: 0, concern: 0 },
}

/**
 * A whole-number percentage, and zero where there is nothing to divide by. Zero
 * rather than NaN because an empty Ministry's Overview reads *0%*, which is the
 * honest empty state the tab promises, rather than a blank.
 */
export const percentage = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.round((part / whole) * 100)

export const ratedTotal = (counts: CheckInCounts): number =>
  counts.rated.outstanding + counts.rated.good + counts.rated.concern

export const checkInRates = (counts: CheckInCounts): CheckInRates => ({
  response: percentage(counts.answered, counts.sent),
  meeting: percentage(counts.held, counts.answered),
  quality: percentage(counts.rated.outstanding + counts.rated.good, ratedTotal(counts)),
})
