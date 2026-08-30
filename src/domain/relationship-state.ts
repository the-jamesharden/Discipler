import { daysSince } from './clock'
import { isoWeekOf, type IsoWeek } from './week'

/**
 * What a relationship reads as right now, derived from its history and nothing
 * else. There is no `state` column and there will not be one: a stored state is a
 * second answer waiting to disagree with the record it was computed from, and the
 * Week-by-Week History is the source everything in Discipler derives from.
 *
 * A relationship holds exactly one state. Concerns are deliberately not among
 * them -- they are badges that stand beside a relationship until an Admin resolves
 * one, so a Healthy relationship can carry unresolved Concerns.
 */
export type RelationshipState =
  | 'awaiting_leader_acceptance'
  | 'healthy'
  | 'stalled'
  | 'needs_care'
  | 'paused'
  | 'ended'

/**
 * The two thresholds, and they are not to be tightened. Two weeks is long enough
 * that a fading relationship still reaches an Admin while it can be recovered, and
 * three weeks of honest *we did not meet* is a scheduling problem rather than
 * wrongdoing. Lowering either would turn Care Needed into a list nobody reads.
 */
export const UNANSWERED_WEEKS_BEFORE_STALLED = 2
export const NOT_MEETING_WEEKS_BEFORE_STALLED = 3

/**
 * What one relationship-week came to.
 *
 * `unanswered` is the one that needs saying out loud: a week counts as unanswered
 * when an open Check-In Sequence *covered* this relationship and no reply arrived
 * for it -- whether or not its question was ever sent. Counting only questions
 * actually sent has a hole big enough to defeat the whole ticket, because a silent
 * Leader with four relationships takes eight days to work through one sequence and
 * a new week abandons it first: their third and fourth relationships would never
 * be asked, never accrue a counter, and stay Healthy forever.
 *
 * Weeks that are genuinely absent -- Paused, and Awaiting Leader Acceptance --
 * produce no entry at all, because no sequence covers them.
 */
export type RelationshipWeekOutcome = 'met' | 'did_not_meet' | 'unanswered'

export interface RelationshipWeek {
  /** The ISO week in the Ministry's timezone, never the interval since a prompt. */
  readonly week: IsoWeek
  readonly outcome: RelationshipWeekOutcome
  /**
   * When the Leader answered, on a week they did, and null on one they did not.
   * The silence duration is measured from the latest of these, so it says days
   * since anybody last heard from them rather than weeks multiplied by seven.
   */
  readonly answeredAt: Date | null
}

/**
 * Why a relationship needs attention, and for how long.
 *
 * The unit travels with the reason rather than beside it. *Gone silent, 23 days*
 * and *responding, not meeting, 3 weeks* call for completely different
 * conversations, and an Admin has to know which one they are walking into before
 * they pick up the phone -- so the two cannot share a counter, and a union is what
 * stops a caller reading weeks out of a silence.
 */
export type CareReason =
  | { readonly kind: 'gone_silent'; readonly days: number }
  | { readonly kind: 'not_meeting'; readonly weeks: number }

/** One Concern as the record holds it. The text is deliberately not here. */
export interface RaisedConcern {
  readonly raisedAt: Date
  readonly resolvedAt: Date | null
}

/**
 * One relationship's history, as the derivation needs it. Facts only: no state, no
 * counters, nothing already decided by a query.
 */
export interface RelationshipHistory {
  /** Null while it is Awaiting Leader Acceptance. */
  readonly acceptedAt: Date | null
  /** Ticket 13's. Terminal once set. */
  readonly endedAt: Date | null
  /** Ticket 12's. Masks whatever the history would otherwise derive. */
  readonly pausedAt: Date | null
  /** The Ministry's IANA zone. Both counters are anchored against it. */
  readonly timeZone: string
  /** In any order; sorted here, so no caller's `order by` is load-bearing. */
  readonly weeks: readonly RelationshipWeek[]
  readonly concerns: readonly RaisedConcern[]
}

export interface DerivedRelationshipState {
  readonly state: RelationshipState
  /**
   * Empty unless the state is Stalled, and never more than one entry while the two
   * Stalled conditions are the only reasons there are: both are read off the most
   * recent week, and one week has one outcome.
   */
  readonly reasons: readonly CareReason[]
  /** Outstanding Concerns, which is what the badge shows a count of. */
  readonly openConcerns: number
}

/**
 * How many weeks the most recent run of one outcome goes back, over the weeks that
 * exist. Absent weeks are not in the list at all, so a run either side of a Pause
 * joins rather than restarting: an absent week is evidence of nothing, in both
 * directions.
 */
const trailingRunOf = (
  outcome: RelationshipWeekOutcome,
  weeks: readonly RelationshipWeek[],
): number => {
  let run = 0
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    if (weeks[index]?.outcome !== outcome) break
    run += 1
  }
  return run
}

/**
 * One entry per ISO week, in order.
 *
 * The collapse is the ISO anchor doing its job rather than a defensive tidy-up. A
 * coordinator moving the cadence from late Sunday to early Monday puts two prompts
 * inside seven days, and counting both would advance the stall threshold twice for
 * one week of silence -- the exact miscount the ISO week was chosen to prevent, and
 * one nothing on any screen would show.
 *
 * A week anything was answered in is an answered week: the later answer wins, and
 * an answer of any kind beats a silence. Sorting is lexicographic because
 * `2026-W35` sorts chronologically -- the ISO year leads, which is why it is
 * carried at all.
 */
const inOrder = (weeks: readonly RelationshipWeek[]): readonly RelationshipWeek[] => {
  const byWeek = new Map<IsoWeek, RelationshipWeek>()

  for (const week of weeks) {
    const standing = byWeek.get(week.week)
    const beatsIt =
      !standing ||
      (week.answeredAt !== null &&
        (standing.answeredAt === null ||
          week.answeredAt.getTime() >= standing.answeredAt.getTime()))

    if (beatsIt) byWeek.set(week.week, week)
  }

  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week))
}

export const deriveRelationshipState = (
  history: RelationshipHistory,
  now: Date,
): DerivedRelationshipState => {
  const openConcerns = history.concerns.filter(
    (raised) => raised.resolvedAt === null,
  ).length

  const settled = (state: RelationshipState): DerivedRelationshipState => ({
    state,
    reasons: [],
    openConcerns,
  })

  // The three states nothing in the history can argue with, in the order they
  // win. Ended is terminal; Paused masks the derived state so a Leader stepping
  // back for a season does not appear in the care queue; and a relationship
  // nobody has accepted has sent no check-ins and accrued no silence.
  if (history.endedAt !== null) return settled('ended')
  if (history.acceptedAt === null) return settled('awaiting_leader_acceptance')
  if (history.pausedAt !== null) return settled('paused')

  const weeks = inOrder(history.weeks)

  const silentWeeks = trailingRunOf('unanswered', weeks)
  const notMeetingWeeks = trailingRunOf('did_not_meet', weeks)

  // Days since the Leader last said anything, and since they agreed to lead when
  // they never have. Not the silent weeks multiplied by seven: an Admin reading
  // *gone silent, 23 days* is being told when contact actually stopped.
  const lastHeardFrom =
    weeks.reduce<Date | null>(
      (latest, week) => week.answeredAt ?? latest,
      null,
    ) ?? history.acceptedAt

  const reasons: readonly CareReason[] =
    silentWeeks >= UNANSWERED_WEEKS_BEFORE_STALLED
      ? [{ kind: 'gone_silent', days: daysSince(lastHeardFrom, now) }]
      : notMeetingWeeks >= NOT_MEETING_WEEKS_BEFORE_STALLED
        ? [{ kind: 'not_meeting', weeks: notMeetingWeeks }]
        : []

  const thisWeek = isoWeekOf(now, history.timeZone)
  const concernThisWeek = history.concerns.some(
    (raised) =>
      raised.resolvedAt === null && isoWeekOf(raised.raisedAt, history.timeZone) === thisWeek,
  )

  // An assertion rather than a precedence rule, which the settled comment on
  // ticket 10 asks for by name. The two cannot both hold today: a Concern needs a
  // `1` and then a `C`, and that `1` establishes both that the week was answered
  // and that a meeting happened -- clearing both Stalled conditions with the very
  // reply that raises the Concern. A precedence rule would be dead code that goes
  // quietly wrong the day a Participant check-in or an Admin can raise one. This
  // fails loudly at exactly that moment instead.
  if (reasons.length > 0 && concernThisWeek) {
    throw new Error(
      'Stalled and Needs Care both hold on one relationship, which nothing should ' +
        'be able to produce: something now raises a Concern without answering the week',
    )
  }

  if (concernThisWeek) return settled('needs_care')
  if (reasons.length > 0) return { state: 'stalled', reasons, openConcerns }

  return settled('healthy')
}
