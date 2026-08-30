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
 * will construct. That is the whole of the guard on the way in -- a Pause is a
 * `ministry_event`, and that table takes any `jsonb` by design because it holds
 * facts of every shape. The `pause_expired` *item* carries a check constraint
 * repeating the rule, but no constraint stands over the event itself, so the way
 * back is `readStandingPause` below, which checks rather than casts.
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

/**
 * One stored pause, read back and checked rather than cast.
 *
 * Both readers go through here -- the command connection the tick expires pauses
 * on, and the signed-in session Care Needed is drawn from -- so the two cannot
 * answer a drifted row differently. They did, briefly, and the pair of answers was
 * the worst of both: one path masked the relationship and the other refused to
 * run.
 *
 * It **throws**, and the alternative was considered and rejected. A period that is
 * not one of the five leaves nothing to guess at: reading it as no pause at all
 * puts a Leader who is on holiday back in the care queue, and defaulting it to two
 * weeks restarts somebody's review on a date nobody chose. Both are wrong answers
 * given confidently, which is the one failure this codebase spends everywhere to
 * avoid -- and the row cannot be written through the command boundary at all, so
 * reaching here means somebody wrote SQL and the message says which row.
 */
export const readStandingPause = (pause: {
  readonly relationshipId: string
  readonly pausedAt: Date
  readonly periodWeeks: unknown
}): StandingPause => {
  if (!isPausePeriod(pause.periodWeeks)) {
    throw new Error(
      `The pause on relationship ${pause.relationshipId} carries no period anybody ` +
        `could have selected: ${String(pause.periodWeeks)}`,
    )
  }

  return { pausedAt: pause.pausedAt, periodWeeks: pause.periodWeeks }
}
