/**
 * The terms and limits the Exponential launch decided, written once
 * (`.scratch/exponential-launch/spec.md`).
 *
 * The help docs state these numbers (Exponential launch, ticket 34), and they were
 * written before the code that enforces most of them. So that a page never says one
 * number while the product enforces another, each lives here, named, and **the
 * ticket that enforces it imports it from here** rather than writing its own: the
 * ticket is named beside each. A ticket that finds a better home for one moves it
 * and leaves the help docs' import pointing at the new place; it never copies it.
 *
 * Money is in whole cents, so no price is ever a float.
 */

/** Every church's free trial, before the first real charge (ticket 04). */
export const TRIAL_DAYS = 30

/** The two monthly prices, in cents (ticket 04). Every church starts on the first. */
export const MONTHLY_PRICE_CENTS = { upToTheLimit: 9_700, aboveTheLimit: 14_700 } as const

/**
 * People in active relationships, Disciplers and Disciples counted together, that
 * the first price covers (tickets 04 and 14). A church above it for a whole month
 * emails the team to follow up; nothing changes price by itself.
 */
export const PEOPLE_ON_THE_FIRST_PRICE = 200

/** Billing yearly is this much off twelve monthly payments (ticket 04). */
export const YEARLY_DISCOUNT_PERCENT = 20

/** Discipler emails the church this long before its trial ends (ticket 33). */
export const TRIAL_ENDING_EMAIL_DAYS_BEFORE = 7

/** The Exponential special offer (tickets 04 and 20). */
export const EXPONENTIAL_OFFER = {
  code: 'EXPO26',
  trialDays: 60,
  discountPercent: 20,
  /** The discount runs for this many monthly bills, or the first yearly one. */
  discountMonths: 12,
  /** The last day the code is accepted, through its end, Pacific time. */
  lastDay: '2026-12-11',
} as const

/** A church plant's free months after its trial, once approved (ticket 19). */
export const CHURCH_PLANT_FREE_MONTHS = 12

/** What counts as a church plant: launched within these years, or launching within these months (ticket 19). */
export const CHURCH_PLANT_WINDOW = { launchedWithinYears: 3, launchingWithinMonths: 12 } as const

/**
 * How long an earned referral credit waits after the invited church's first real
 * payment, and is taken back if that payment is refunded or disputed (ticket 32).
 */
export const REFERRAL_CREDIT_HELD_DAYS = 30

/** Test check-ins one Admin may send in a day, in the church's timezone (ticket 28). */
export const TEST_CHECK_INS_PER_DAY = 3

/** An unanswered test check-in ends this long after it was sent (ticket 28). */
export const TEST_CHECK_IN_OPEN_HOURS = 1

/** The length of the code Twilio Verify texts to check an Admin's phone (ticket 09). */
export const VERIFY_CODE_DIGITS = 6

/** The email code at sign-up (ticket 11). */
export const EMAIL_CODE = {
  digits: 6,
  lifetimeMinutes: 10,
  tries: 5,
  resendAfterSeconds: 60,
  /** Emails one address may be sent in an hour, whichever attempts ask. */
  perEmailPerHour: 5,
  /** Emails one network may ask for in an hour. A conference's wifi is one network. */
  perNetworkPerHour: 30,
} as const

/** The Help menu's contact, bug and feature form (ticket 25). */
export const SUPPORT_SUBMISSIONS = {
  /** A submission is deleted this long after it came in (the privacy policy promises it). */
  keptMonths: 12,
  /** What one signed-in Admin may send in an hour. */
  perAdminPerHour: 5,
  /** What one network may send signed out in an hour. A conference's wifi is one network. */
  perNetworkPerHour: 10,
} as const

/**
 * What a church may do for its first days, whoever opened it (ticket 37, Q81). An import
 * that would take the Roster past `peopleOnTheRoster` is refused, and texts past
 * `textsPerWeek` wait on the queue. support@ is emailed when a church hits either, and
 * `npm run new-church-limit` lifts them.
 */
export const NEW_CHURCH_LIMITS = { firstDays: 30, peopleOnTheRoster: 300, textsPerWeek: 1_500 } as const

/** How long the emailed "Forgot password?" link works (ticket 22). */
export const PASSWORD_RESET_LINK_MINUTES = 30

/**
 * The setup bar's steps, in order (ticket 26). Each ticks itself when the thing
 * happens, never by an Admin ticking it, and the bar never goes down.
 */
export const SETUP_STEPS = [
  'checkin_time_confirmed',
  'tour_finished',
  'test_check_in_sent',
  'people_added',
  'first_intake_received',
  'first_relationship_created',
  'first_relationship_accepted',
] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

/**
 * The longest one sentence of "What the check-in says" may be, and the length
 * past which its counter shows (ticket 40).
 */
export const CHECK_IN_SENTENCE = { longest: 160, counterFrom: 120 } as const

/** Questions one Admin may ask the AI guide in a day (ticket 31). */
export const AI_GUIDE_QUESTIONS_PER_DAY = 30

/** How long an AI guide chat is kept before it is deleted (ticket 31). */
export const AI_GUIDE_CHAT_KEPT_DAYS = 90

/** Office hours come round this often (ticket 30); the next date is in its own file. */
export const OFFICE_HOURS_EVERY_WEEKS = 2
