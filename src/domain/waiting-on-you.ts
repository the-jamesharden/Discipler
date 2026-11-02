import { calendarDayOf } from './week'

/**
 * The unpaired pop-up (Exponential launch, ticket 29): the card at the bottom
 * right of the Overview that tells an Admin how many people are waiting on them.
 *
 * Two counts over the Roster, leaving out Admins and anyone opted out:
 *
 *   * `toPair`, the people who are Ready to Pair and in no relationship on either
 *     side. Ready to Pair already means discipled by nobody; leading somebody is
 *     being in a relationship too, so a Leader is not counted as waiting.
 *   * `awaitingIntake`, the people whose Participation Status is No Intake
 *     Submitted.
 */
export interface WaitingOnYou {
  readonly toPair: number
  readonly awaitingIntake: number
}

/** Whether the card has anything to say. It shows only when it has. */
export const isAnybodyWaiting = (waiting: WaitingOnYou): boolean =>
  waiting.toPair > 0 || waiting.awaitingIntake > 0

/**
 * Which showing of the card a visit to the Overview belongs to. The card shows on
 * the first visit of each showing and not again in it, and a showing is one
 * sign-in on one of the church's own days: a new sign-in, or midnight in the
 * Ministry's timezone, starts the next one.
 *
 * The sign-in is the Auth session the token names, so signing in again on the
 * same day is a new sign-in, and two devices are two.
 */
export const showingOf = (sessionId: string, now: Date, timeZone: string): string =>
  `${calendarDayOf(now, timeZone)}/${sessionId}`
