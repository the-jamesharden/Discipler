import type { MaterialId } from './ids'

/**
 * A Material Assignment is a period, not a column. The relationship was working
 * through one thing from a date until another date, and assigning a new Material
 * closes the previous period rather than overwriting it -- which is what makes
 * *what were they using in March* a question the data can still answer in
 * October.
 *
 * The interface an Admin assigns through is deferred; the history is not, and it
 * cannot be reconstructed afterwards. That is the whole reason this exists before
 * anything that reads it: a week whose Material nobody recorded is a week nothing
 * can ever recover, and getting it wrong silently invalidates every report built
 * on top of it later.
 *
 * Nothing here touches a database. The periods come from `material_assignment`,
 * which stores facts; every rule about which period a week belongs to is decided
 * here, where a test can drive a Material changing mid-week in a millisecond.
 */

/**
 * One period a relationship spent on one Material.
 *
 * `materialId` is null on exactly one period: the one acceptance opens, before
 * the Ministry has assigned anything. That is a real period with no Material in
 * it rather than an absence of rows -- a report asking what was in use that week
 * then gets *none*, which is a fact, instead of nothing at all, which is
 * indistinguishable from a defect.
 *
 * `endedAt` is null on the period that is still running. There is at most one.
 */
export interface MaterialPeriod {
  readonly materialId: MaterialId | null
  /** The Material's title, or null on the period with no Material. */
  readonly title: string | null
  readonly startedAt: Date
  /** Null while it is the period still running. */
  readonly endedAt: Date | null
}

/**
 * One relationship-week, as much of it as attribution needs: when the check-in
 * conversation covering it opened, and when the Leader first said something about
 * this relationship in it.
 *
 * Both are facts `relationship_weeks` already holds. The rule that picks between
 * them is below.
 */
export interface AttributableWeek {
  readonly openedAt: Date
  /**
   * The first reply that landed for this relationship in that conversation, or
   * null when none ever did. First rather than last: a check-in is several
   * messages -- did you meet, how was it -- and the moment the Leader started
   * reporting is the moment that names the meeting.
   */
  readonly firstAnsweredAt: Date | null
}

/**
 * The period an instant falls in, or null when it falls before the history
 * starts.
 *
 * Half-open, `[startedAt, endedAt)`. A period runs up to the instant its
 * successor begins and not through it, which is what makes an instant belong to
 * exactly one period at the boundary -- and what makes a zero-length period
 * contain no instant at all. That is not an edge case to tolerate but the reason
 * assigning a Material at the very instant of acceptance is permitted: the
 * opening period closes at its own start, covers nothing, and leaves no gap.
 *
 * Null before the first period begins. No check-in week exists before acceptance,
 * so an instant earlier than that is not a week whose Material went unrecorded --
 * it is an instant no meeting could have been reported in.
 *
 * The periods are not assumed to arrive in order. The database holds them
 * gapless and non-overlapping, so at most one can match however they are sorted,
 * and a caller who has not sorted them gets the same answer as one who has.
 */
export const materialInUseAt = (
  periods: readonly MaterialPeriod[],
  at: Date,
): MaterialPeriod | null =>
  periods.find(
    (period) =>
      at.getTime() >= period.startedAt.getTime() &&
      (period.endedAt === null || at.getTime() < period.endedAt.getTime()),
  ) ?? null

/**
 * The instant a week is attributed by.
 *
 * The rule is *the Material assigned at the moment the check-in was answered*,
 * because that is the meeting being reported on -- so an answered week is
 * attributed by its first answer, and one Material change mid-week moves the
 * whole week or none of it. A week is never divided between two.
 *
 * A week nobody answered has no such moment, and it still has to be attributed:
 * the history has to be complete, and an unanswered week is exactly the kind that
 * a later report must not silently drop. It falls back to the moment the
 * conversation covering it opened, which is the only instant that week is known
 * by.
 */
const attributedBy = (week: AttributableWeek): Date => week.firstAnsweredAt ?? week.openedAt

/**
 * Which Material a relationship-week belongs to.
 *
 * Never null for a week of an accepted relationship, which is the property the
 * opening period exists to hold: the answer for a week before anything was
 * assigned is a period saying *no Material*, not the absence of an answer.
 */
export const materialForWeek = (
  periods: readonly MaterialPeriod[],
  week: AttributableWeek,
): MaterialPeriod | null => materialInUseAt(periods, attributedBy(week))
