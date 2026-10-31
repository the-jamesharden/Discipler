import type { Branded } from './branded'
import type { PhoneNumber } from './roster'

/**
 * Checking an Admin's own phone with a texted code (Exponential launch, ticket 09).
 *
 * The first time an Admin asks for a test check-in, Discipler proves the phone on
 * their Roster row is theirs: Twilio Verify texts a 6-digit code from Twilio's own
 * senders, and the Admin types it back. Once a phone has passed, that Admin is
 * never asked about that phone again.
 *
 * The code itself never touches Discipler. Twilio makes it, sends it and judges
 * it; what lives here is everything around that -- which numbers may be sent one,
 * how many may be sent, and when an attempt is over -- so that the vendor is asked
 * only questions Discipler has already decided are worth asking.
 */

/**
 * The area codes that dial with +1 and are not the United States: Canada, the
 * Caribbean and Atlantic countries in the North American plan, and the US
 * territories, which Twilio's geographic permissions list as countries of their
 * own and so would refuse under a "United States only" service.
 *
 * A list of what is *not* the US rather than of what is, because it is the shorter
 * and the slower to change. A new Canadian overlay missing from here reaches
 * Twilio, whose own permissions refuse it; this list is so that the common case is
 * refused without spending a request, not the only guard.
 */
const NOT_US_AREA_CODES = new Set([
  // Canada, every province and territory.
  '204', '226', '236', '249', '250', '257', '263', '289', '306', '343', '354', '365',
  '367', '368', '382', '387', '403', '416', '418', '428', '431', '437', '438', '450',
  '460', '468', '474', '506', '514', '519', '548', '579', '581', '584', '587', '604',
  '613', '639', '647', '672', '683', '705', '709', '742', '753', '778', '780', '782',
  '807', '819', '825', '867', '873', '879', '902', '905', '942',
  // Canada's non-geographic codes.
  '600', '622',
  // The Caribbean and Atlantic countries.
  '242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664', '721',
  '758', '767', '784', '809', '829', '849', '868', '869', '876',
  // The US territories: the Virgin Islands, the Northern Marianas, Guam, American
  // Samoa and Puerto Rico.
  '340', '670', '671', '684', '787', '939',
])

/**
 * Whether a number is in the United States, the only country the Verify service
 * sends to (spec, "Verify"). Asked before Twilio is, so a number it would refuse
 * costs nothing and counts against nothing.
 */
export const isUsPhone = (phone: PhoneNumber): boolean => {
  const match = /^\+1([2-9]\d{2})[2-9]\d{6}$/.exec(phone)
  return match !== null && !NOT_US_AREA_CODES.has(match[1]!)
}

/** Six digits, as the Admin typed them with the spacing taken out. */
export type PhoneCode = Branded<string, 'PhoneCode'>

/**
 * A code as typed, or null when it cannot be one. Read before Twilio is asked,
 * so a slip -- five digits, a letter -- is told at once and is not spent as one of
 * the five tries an attempt allows.
 */
export const readPhoneCode = (raw: string): PhoneCode | null => {
  const code = raw.replace(/[\s-]/g, '')
  return /^\d{6}$/.test(code) ? (code as PhoneCode) : null
}

/**
 * How many codes may be sent, counted per Admin and per phone, each on its own.
 * Per Admin, so one account cannot run up Twilio's bill across many numbers; per
 * phone, so many accounts cannot flood one number that is somebody else's.
 *
 * An hour's limit for a burst and a day's for a slow drip. Generous against the
 * one honest use -- a code, a resend or two, once in an Admin's life -- and every
 * code costs money at Twilio, so the limits are about cost and abuse, not about
 * guessing: guessing is the five tries below.
 */
export const CODE_REQUEST_LIMITS: readonly { readonly withinMinutes: number; readonly atMost: number }[] = [
  { withinMinutes: 60, atMost: 5 },
  { withinMinutes: 24 * 60, atMost: 10 },
]

/** The longest window above, which is how far back a store has to read. */
export const CODE_REQUEST_LOOKBACK_MINUTES = Math.max(
  ...CODE_REQUEST_LIMITS.map((limit) => limit.withinMinutes),
)

/** When each recent code was asked for, by this Admin and to this phone. */
export interface RecentCodeRequests {
  readonly byAdmin: readonly Date[]
  readonly toPhone: readonly Date[]
}

/**
 * Whether one more code may be sent. Every request counts, a refused one at
 * Twilio included: each is a request to a vendor that charges for it, and a
 * request that failed is the likeliest to be repeated.
 */
export const codeRequestAllowed = (recent: RecentCodeRequests, now: Date): boolean =>
  CODE_REQUEST_LIMITS.every(({ withinMinutes, atMost }) => {
    const since = now.getTime() - withinMinutes * 60_000
    const within = (times: readonly Date[]) => times.filter((at) => at.getTime() > since).length
    return within(recent.byAdmin) < atMost && within(recent.toPhone) < atMost
  })

/**
 * How long a code works after it was sent. It is Twilio's to enforce -- the
 * Verify service's own code lifetime, left at its default of ten minutes -- and
 * kept here only so Discipler stops offering a code Twilio has already let go.
 */
export const PHONE_CODE_LIFETIME_MINUTES = 10

/**
 * How many codes an attempt may try. The fifth wrong one ends it, which is also
 * where Twilio stops a verification of its own accord.
 */
export const TRIES_PER_ATTEMPT = 5

/** How an attempt ended. Once ended, it never opens again: a new code is a new attempt. */
export type PhoneCheckEnding = 'verified' | 'wrong_codes' | 'expired'

/**
 * One attempt at checking one phone for one Admin: the run of codes sent to it,
 * a resend included, until it is verified, tried five times, or left to expire.
 */
export interface PhoneCheckAttempt {
  readonly id: string
  /** When its latest code was asked for. A resend moves this on. */
  readonly lastCodeAt: Date
  /**
   * Twilio's name for the verification, once Twilio has accepted a code for
   * sending. Null while no code of this attempt has been sent.
   */
  readonly verificationSid: string | null
  /** Codes tried against it so far, the one in flight included. */
  readonly codesTried: number
  readonly ending: PhoneCheckEnding | null
}

/** Where an attempt stands at a moment, which is all anything acts on. */
export type AttemptStanding =
  | { readonly kind: 'open'; readonly triesLeft: number }
  /** Still open on record, but its code has stopped working; `at` is when it did. */
  | { readonly kind: 'expired'; readonly at: Date }
  | { readonly kind: 'ended'; readonly ending: PhoneCheckEnding }

export const attemptStanding = (attempt: PhoneCheckAttempt, now: Date): AttemptStanding => {
  if (attempt.ending) return { kind: 'ended', ending: attempt.ending }
  if (attempt.codesTried >= TRIES_PER_ATTEMPT) return { kind: 'ended', ending: 'wrong_codes' }

  const expiresAt = new Date(attempt.lastCodeAt.getTime() + PHONE_CODE_LIFETIME_MINUTES * 60_000)
  if (now.getTime() >= expiresAt.getTime()) return { kind: 'expired', at: expiresAt }

  return { kind: 'open', triesLeft: TRIES_PER_ATTEMPT - attempt.codesTried }
}
