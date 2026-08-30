import { days, hours } from './clock'
import { calendarDayOf, isoWeekOf } from './week'

/**
 * How often one Person may be nudged, and the rule that answers it.
 *
 * **The limit is enforced at the sending layer, not at the button.** A disabled
 * button is a courtesy; the limit is the rule, and any future feature that sends a
 * message inherits it without exception. The reason is not tidiness: Discipler's
 * entire participant-facing surface is SMS, and a Ministry that over-messages its
 * own congregation gets its number carrier-flagged -- at which point every
 * relationship in that Ministry goes dark at once.
 *
 * Nothing in here reads a clock or touches the database. It is given the nudges
 * already sent and the instant to judge them at, which is what lets twelve hours,
 * a day and a week be proven in a test that runs in milliseconds.
 */

export interface NudgeLimits {
  /** The shortest gap between two nudges to the same Person, in milliseconds. */
  readonly cooldown: number
  readonly perDay: number
  readonly perWeek: number
}

/**
 * One nudge per twelve hours, at most two per day, at most four per week.
 *
 * Pilot starting values, to be tuned from pilot data. They are named once here
 * rather than written as numbers at the call sites, so that tuning them is an edit
 * in one place and a reader who wants to know the ceiling does not have to find
 * every path that sends.
 *
 * Not a Ministry column. They are the same for every Ministry until something
 * decides otherwise, and a per-Ministry setting is a question ticket 22 has not
 * been asked. `dispatchQueue` takes them as an argument, so a Ministry-scoped
 * source can replace this constant without the rule changing shape.
 */
export const PILOT_NUDGE_LIMITS: NudgeLimits = {
  cooldown: hours(12),
  perDay: 2,
  perWeek: 4,
}

/**
 * An observation about these three numbers, not a rule: at twelve hours, the
 * cooldown already allows at most two sends in a twenty-four hour day, so
 * `perDay` cannot be the ceiling that binds while `cooldown` stands where it is.
 * The weekly cap does bind, and does most of the work.
 *
 * Noted because it would otherwise look like dead code to whoever tunes these
 * next. `perDay` is enforced and tested on its own terms; a cooldown tuned down
 * from pilot data is exactly what leaves the day as the ceiling that holds, and
 * that is the case it is there for.
 */

/** Which ceiling refused a nudge. Codes, never prose, as every refusal here is. */
export type NudgeRefusal =
  | 'nudge_within_cooldown'
  | 'nudge_daily_cap_reached'
  | 'nudge_weekly_cap_reached'

/**
 * How far back the sending layer has to look before it can decide.
 *
 * The ISO week in progress can have opened seven days ago, and both the day and
 * the cooldown are shorter than that at every value the pilot uses. Eight days
 * covers all three with a day to spare for a Ministry whose wall clock is most of
 * one behind UTC. Derived from the limits rather than hardcoded, so raising the
 * cooldown past a week widens the lookback instead of silently reading too little.
 */
export const nudgeHistoryWindow = (limits: NudgeLimits): number =>
  Math.max(limits.cooldown, days(8))

/**
 * Whether a nudge may go out now, given every nudge already **sent** to this Person.
 *
 * Sent, not enqueued. A message the sending layer withheld never reached anybody,
 * and a message ticket 20 is holding behind an open conversation has not reached
 * them yet -- so neither one spent any of the budget. The caps are a
 * ministry-conduct rule about what a congregant actually receives, which is also
 * why they are counted per Person while ticket 20's hold is counted per phone
 * number. Two limiters sit on the same queue and they are not the same limiter.
 *
 * The day and the week are the Ministry's own. `isoWeekOf` is the same function
 * the check-in counters use, so *at most four per week* names the same seven days
 * on every surface. A rolling seven days would have been easier and wrong: the
 * weekly cap and the check-in week would then disagree about which week a given
 * Tuesday belonged to, and an Admin reading both would have no way to tell.
 *
 * The three ceilings are checked in the order the rule states them, and the first
 * one that binds is the one reported. Nothing turns on the order -- a refusal is a
 * refusal -- but a fixed order means the recorded reason for a given history is
 * always the same reason.
 */
export const nudgeRefusedBy = (
  sentAlready: readonly Date[],
  now: Date,
  timeZone: string,
  limits: NudgeLimits,
): NudgeRefusal | null => {
  const withinCooldown = sentAlready.some(
    (sentAt) => now.getTime() - sentAt.getTime() < limits.cooldown,
  )
  if (withinCooldown) return 'nudge_within_cooldown'

  const today = calendarDayOf(now, timeZone)
  const sentToday = sentAlready.filter((sentAt) => calendarDayOf(sentAt, timeZone) === today)
  if (sentToday.length >= limits.perDay) return 'nudge_daily_cap_reached'

  const thisWeek = isoWeekOf(now, timeZone)
  const sentThisWeek = sentAlready.filter((sentAt) => isoWeekOf(sentAt, timeZone) === thisWeek)
  if (sentThisWeek.length >= limits.perWeek) return 'nudge_weekly_cap_reached'

  return null
}
