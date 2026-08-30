import { weeks } from './clock'

/**
 * A Pause: the Admin's way of acting on something they were told offline, and the
 * reason a holiday does not put a Leader in the care queue.
 *
 * It is a fact with a date on it rather than a column that gets overwritten, like
 * every other thing that happens to a relationship. What stands right now is read
 * back from the `relationship.paused` and `relationship.resumed` events in
 * history; this module is the arithmetic over one of them.
 *
 * Nothing here decides what a Pause *masks*. That is
 * `deriveRelationshipState`'s, which reports `Paused` while one stands and
 * whatever the history yields once it does not.
 */

/**
 * The five periods, and there is no sixth. *A summer away and a fortnight away
 * are not the same thing*, and a free-text number of weeks would be a date an
 * Admin has to compute in their head from a screen that already knows it.
 *
 * A union rather than a number, so a three-week pause is not a value TypeScript
 * will construct. The database repeats the rule as a check constraint on the
 * `pause_expired` payload, because a future writer that bypasses this boundary
 * must still be refused.
 */
export type PausePeriodWeeks = 1 | 2 | 4 | 8 | 12

export const PAUSE_PERIODS: readonly PausePeriodWeeks[] = [1, 2, 4, 8, 12]

/**
 * What a Pause runs for when nobody says. Two weeks is the ordinary case -- a
 * holiday, an illness, a fortnight of shift work -- and it is the number the
 * Keyword Exchange offers back as well, so both routes into a Pause default the
 * same way from the same constant.
 */
export const DEFAULT_PAUSE_PERIOD_WEEKS: PausePeriodWeeks = 2

/** Narrows a number off a database row to a period, or says plainly it is not one. */
export const isPausePeriod = (value: unknown): value is PausePeriodWeeks =>
  PAUSE_PERIODS.some((period) => period === value)

/**
 * The Pause standing on one relationship right now: when it was taken and for how
 * long. Absent rather than dated-in-the-past, so *paused* and *paused until* are
 * one fact and cannot disagree.
 */
export interface StandingPause {
  readonly pausedAt: Date
  readonly periodWeeks: PausePeriodWeeks
}

/**
 * When the period runs out. Computed from the two facts rather than stored beside
 * them: a date frozen into the payload would be a second answer to a question the
 * first two already answer, and the two would disagree the day anything edits
 * either.
 */
export const pauseExpiresAt = (pause: StandingPause): Date =>
  new Date(pause.pausedAt.getTime() + weeks(pause.periodWeeks))

/**
 * Whether the period has run out, against the injected clock like every other
 * time-dependent rule.
 *
 * **Expiry resumes nothing.** It is a condition an Admin is told about, not a
 * transition: the relationship stays `Paused` until somebody decides otherwise,
 * because nobody's check-ins should restart on a date they have forgotten.
 */
export const pauseHasExpired = (pause: StandingPause, now: Date): boolean =>
  now.getTime() >= pauseExpiresAt(pause).getTime()
