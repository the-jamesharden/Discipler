import { minutes } from './clock'
import { withinQuietHours } from './ministry-settings'
import { calendarDayOf, startOfNextDayIn } from './week'

/**
 * Discipler under Twilio's daily limit (Exponential launch, ticket 07). A brand may
 * send so many texts a day, counted across every church because the brand is
 * Discipler's, and the count starts again at midnight Pacific. Over it, Twilio
 * answers a send with error 30023.
 *
 * Reaching it loses nothing: what is on the queue stays on the queue. This module
 * says what a hold is and when a text may go again, and it says when each check-in
 * in an hour may leave.
 */

/** Where Twilio's day starts, and the only reason Discipler has a Pacific clock. */
export const DAILY_CAP_ZONE = 'America/Los_Angeles'

/** Thrown by a transport when the vendor says the day's limit is reached. */
export class DailyCapReached extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DailyCapReached'
  }
}

/** The limit was reached on one Pacific day, and nothing goes until that day is over. */
export interface NewDailyCapHold {
  /** The Pacific day it was reached in, as `2026-11-10`. */
  readonly day: string
  readonly reachedAt: Date
  /** Midnight Pacific at the end of `day`, when Twilio starts counting again. */
  readonly heldUntil: Date
}

export interface DailyCapHold extends NewDailyCapHold {
  /** When support@ was told, or null while it is still owed the email. */
  readonly alertedAt: Date | null
}

export const holdFrom = (reachedAt: Date): NewDailyCapHold => ({
  day: calendarDayOf(reachedAt, DAILY_CAP_ZONE),
  reachedAt,
  heldUntil: startOfNextDayIn(reachedAt, DAILY_CAP_ZONE),
})

/** Whether Twilio is still refusing: nothing is sent to anybody, for any church. */
export const holdIsStanding = (hold: DailyCapHold, now: Date): boolean =>
  now.getTime() < hold.heldUntil.getTime()

/**
 * Whether a text the hold kept back stays back after the limit has reset, because
 * midnight Pacific is 3am in New York. It waits for its church's morning, as
 * everything Discipler starts on its own schedule does.
 *
 * Only what was queued before the hold lifted. A reply to somebody texting at 12:05am
 * Pacific is answered then, as an act a person takes always is.
 */
export const waitsForTheMorning = (
  hold: DailyCapHold,
  enqueuedAt: Date,
  now: Date,
  timeZone: string,
): boolean =>
  enqueuedAt.getTime() < hold.heldUntil.getTime() && !withinQuietHours(now, timeZone)

/**
 * How often the send pass runs: `/cron/tick` in `vercel.json`, which a test holds
 * this to.
 *
 * **Spreading needs passes under an hour apart.** A text only leaves on a pass, so a
 * check-in given 10:40 by a tick that runs at 10:00 and 11:00 would go an hour late.
 * At 60 spreading is off, so change the cron and this constant in one commit.
 */
export const SEND_PASS_EVERY_MINUTES: number = 5

const HOUR = minutes(60)

/**
 * The moment one check-in in an hour may leave, so the hour's check-ins go spread
 * across it instead of all at once: `index` of the `count` the tick found due, evenly
 * spaced from `now`, the first of them at once.
 *
 * Null while passes are an hour apart, which is what leaves today's sends as they
 * were. See `SEND_PASS_EVERY_MINUTES`.
 */
export const checkInNotBefore = ({
  index,
  count,
  now,
  passEveryMinutes = SEND_PASS_EVERY_MINUTES,
}: {
  readonly index: number
  readonly count: number
  readonly now: Date
  readonly passEveryMinutes?: number
}): Date | null =>
  passEveryMinutes >= 60
    ? null
    : new Date(now.getTime() + Math.floor((index * HOUR) / count))
