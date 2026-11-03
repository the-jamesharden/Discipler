import {
  CLARIFICATIONS_PER_QUESTION,
  CHECK_IN_WORDING,
  REMINDER_AFTER_HOURS,
} from '~/domain/check-in'
import { DISCIPLERS_CHECK_IN_WORDS } from '~/domain/check-in-words'
import { AGE_BANDS, FIRST_HOUR, LAST_HOUR } from '~/domain/intake'
import { INTAKE_LINK_LIFETIME_DAYS } from '~/domain/intake-link'
import { INVITATION_LIFETIME_DAYS } from '~/domain/invitations'
import { EXCHANGE_EXPIRES_AFTER_HOURS } from '~/domain/keywords'
import {
  AI_GUIDE_CHAT_KEPT_DAYS,
  AI_GUIDE_QUESTIONS_PER_DAY,
  CHECK_IN_SENTENCE,
  CHURCH_PLANT_FREE_MONTHS,
  CHURCH_PLANT_WINDOW,
  EMAIL_CODE,
  EXPONENTIAL_OFFER,
  MONTHLY_PRICE_CENTS,
  OFFICE_HOURS_EVERY_WEEKS,
  PASSWORD_RESET_LINK_MINUTES,
  PEOPLE_ON_THE_FIRST_PRICE,
  REFERRAL_CREDIT_HELD_DAYS,
  SETUP_STEPS,
  TEST_CHECK_IN_OPEN_HOURS,
  TEST_CHECK_INS_PER_DAY,
  TRIAL_DAYS,
  TRIAL_ENDING_EMAIL_DAYS_BEFORE,
  VERIFY_CODE_DIGITS,
  YEARLY_DISCOUNT_PERCENT,
} from '~/domain/launch-terms'
import { LARGEST_FILE_BYTES, MOST_ITEMS } from '~/domain/materials'
import { QUIET_MINUTES_BEFORE_A_MATERIAL_TEXT } from '~/domain/material-notices'
import { DEFAULT_AGE_BAND_GAP, QUIET_HOURS } from '~/domain/ministry-settings'
import {
  checkInThankYou,
  concernDetailRequest,
  helpMessage,
  meetingQuestion,
  satisfactionQuestion,
} from '~/domain/outbound-copy'
import { SCHEDULED_QUESTION_TIMES_OUT_AFTER_HOURS } from '~/domain/outstanding-reply'
import { DEFAULT_PAUSE_PERIOD_WEEKS, PAUSE_PERIODS } from '~/domain/pause'
import { NOT_MEETING_WEEKS_BEFORE_STALLED, UNANSWERED_WEEKS_BEFORE_STALLED } from '~/domain/relationship-state'
import { ACCEPTANCE_ESCALATION_DAYS, ACCEPTANCE_REMINDER_DAYS } from '~/domain/relationships'
import { LONGEST_PASSWORD_BYTES, SHORTEST_PASSWORD } from '~/domain/accounts'
import { TIER_CUTOFFS } from '~/domain/suggestions'
import { WEEKS_ON_THE_CHART } from '~/domain/growth'
import { hourLabel } from '../settings/copy'
import { SETUP_VIDEOS, type SetupVideo } from './setup-videos'

/**
 * What the help docs' placeholders stand for. A page never types a number: it
 * writes `{{reminderAfter}}`, and the help library fills it in from here, and here
 * reads it from the constant that enforces it (Exponential launch, ticket 34). So a
 * constant that changes changes every page that states it, and a page cannot go
 * on promising the old number -- the one kind of wrong a pastor has no way to
 * notice.
 *
 * The example texts are composed by the functions that compose the real ones, for
 * the same reason: a reworded text rewords the help page that quotes it.
 *
 * Each value is the words as a page says them, unit and all, so a page never
 * has to know whether the number is one or several.
 */

/** `24 hours`, and `an hour` for one, the way a sentence says it. */
export const duration = (count: number, unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'): string =>
  count === 1 ? `${unit === 'hour' ? 'an' : 'a'} ${unit}` : `${count} ${unit}s`

/** `once`, and `2 times`. */
const times = (count: number): string => (count === 1 ? 'once' : `${count} times`)

/** `one band`, and `2 bands`. */
const bands = (count: number): string => (count === 1 ? 'one band' : `${count} bands`)

/** `$97`, `$931.20` and `$1,411.20`: whole dollars bare, and cents only where there are some. */
export const dollars = (cents: number): string => {
  const whole = Math.floor(cents / 100)
  const rest = cents % 100
  return `$${whole.toLocaleString('en-US')}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`
}

/** `1, 2, 4, 8 or 12`. */
const orList = (items: readonly (string | number)[]): string =>
  items.length < 2
    ? items.map(String).join('')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`

/** `December 11, 2026`, from a calendar date, read as that date wherever the reader is. */
const calendarDate = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** A year of monthly bills at a discount, in cents, kept whole by multiplying first. */
const yearAtDiscount = (monthlyCents: number, percent: number): number =>
  (monthlyCents * 12 * (100 - percent)) / 100

/** The Setup videos page's list, or a line saying none is ready yet. */
export const setupVideoList = (videos: readonly SetupVideo[]): string =>
  videos.length === 0
    ? 'The first videos are being recorded now, and they will be listed here as soon as they are ready.'
    : videos
        .map((video) => `- [${video.title.replace(/[[\]\\]/g, '\\$&')}](${encodeURI(video.url)})`)
        .join('\n')

/** The church and the person every example text names. Made up, and nobody's. */
const EXAMPLE_CHURCH = 'Riverside Chapel'
const EXAMPLE_DISCIPLE = 'Jordan'
/** Help shows a check-in as a church with no words of its own sends it. */
const EXAMPLE_CHECK_IN = {
  ministryName: EXAMPLE_CHURCH,
  subject: EXAMPLE_DISCIPLE,
  words: DISCIPLERS_CHECK_IN_WORDS,
}

/** `your first year`, which is how the offer is said to a church, while it is twelve months. */
const firstMonths = (months: number): string => (months === 12 ? 'your first year' : `your first ${months} months`)

export const HELP_FACTS: Readonly<Record<string, string>> = {
  // The check-in rhythm.
  reminderAfter: duration(REMINDER_AFTER_HOURS, 'hour'),
  givenUpAfter: duration(SCHEDULED_QUESTION_TIMES_OUT_AFTER_HOURS, 'hour'),
  clarifications: times(CLARIFICATIONS_PER_QUESTION),
  stalledSilent: duration(UNANSWERED_WEEKS_BEFORE_STALLED, 'week'),
  stalledNotMeeting: duration(NOT_MEETING_WEEKS_BEFORE_STALLED, 'week'),
  quietEarliest: hourLabel(QUIET_HOURS.earliest),
  quietLatest: hourLabel(QUIET_HOURS.latest),
  keywordExchangeOpen: duration(EXCHANGE_EXPIRES_AFTER_HOURS, 'hour'),
  pausePeriods: orList(PAUSE_PERIODS),
  defaultPause: duration(DEFAULT_PAUSE_PERIOD_WEEKS, 'week'),

  // Intake, pairing and invitations.
  gridFirstHour: hourLabel(FIRST_HOUR),
  gridLastHour: hourLabel(LAST_HOUR),
  ageBands: AGE_BANDS.join(', '),
  defaultAgeGap: bands(DEFAULT_AGE_BAND_GAP),
  excellentHours: String(TIER_CUTOFFS.excellentSlots),
  excellentDays: String(TIER_CUTOFFS.excellentDays),
  goodHours: String(TIER_CUTOFFS.goodSlots),
  intakeLinkLifetime: duration(INTAKE_LINK_LIFETIME_DAYS, 'day'),
  invitationLifetime: duration(INVITATION_LIFETIME_DAYS, 'day'),
  acceptanceReminder: duration(ACCEPTANCE_REMINDER_DAYS, 'day'),
  acceptanceEscalation: duration(ACCEPTANCE_ESCALATION_DAYS, 'day'),

  // Overview, Materials and accounts.
  weeksOnTheChart: String(WEEKS_ON_THE_CHART),
  materialItems: String(MOST_ITEMS),
  largestFile: `${LARGEST_FILE_BYTES / (1024 * 1024)} MB`,
  materialTextWait: duration(QUIET_MINUTES_BEFORE_A_MATERIAL_TEXT, 'minute'),
  shortestPassword: String(SHORTEST_PASSWORD),
  longestPassword: String(LONGEST_PASSWORD_BYTES),
  passwordResetLink: duration(PASSWORD_RESET_LINK_MINUTES, 'minute'),

  // Sign-up and setup.
  emailCodeDigits: String(EMAIL_CODE.digits),
  emailCodeLifetime: duration(EMAIL_CODE.lifetimeMinutes, 'minute'),
  verifyCodeDigits: String(VERIFY_CODE_DIGITS),
  setupSteps: String(SETUP_STEPS.length),
  testCheckInsPerDay: String(TEST_CHECK_INS_PER_DAY),
  testCheckInOpen: duration(TEST_CHECK_IN_OPEN_HOURS, 'hour'),
  checkInSentenceLongest: String(CHECK_IN_SENTENCE.longest),

  // Billing, offers and referrals.
  trialDays: duration(TRIAL_DAYS, 'day'),
  trialEndingEmail: duration(TRIAL_ENDING_EMAIL_DAYS_BEFORE, 'day'),
  priceUpToTheLimit: dollars(MONTHLY_PRICE_CENTS.upToTheLimit),
  priceAboveTheLimit: dollars(MONTHLY_PRICE_CENTS.aboveTheLimit),
  peopleOnTheFirstPrice: String(PEOPLE_ON_THE_FIRST_PRICE),
  yearlyDiscount: `${YEARLY_DISCOUNT_PERCENT}%`,
  yearlyPriceUpToTheLimit: dollars(yearAtDiscount(MONTHLY_PRICE_CENTS.upToTheLimit, YEARLY_DISCOUNT_PERCENT)),
  yearlyPriceAboveTheLimit: dollars(yearAtDiscount(MONTHLY_PRICE_CENTS.aboveTheLimit, YEARLY_DISCOUNT_PERCENT)),
  exponentialCode: EXPONENTIAL_OFFER.code,
  exponentialTrialDays: duration(EXPONENTIAL_OFFER.trialDays, 'day'),
  exponentialDiscount: `${EXPONENTIAL_OFFER.discountPercent}%`,
  exponentialDiscountSpan: firstMonths(EXPONENTIAL_OFFER.discountMonths),
  exponentialLastDay: calendarDate(EXPONENTIAL_OFFER.lastDay),
  churchPlantFree: duration(CHURCH_PLANT_FREE_MONTHS, 'month'),
  plantLaunchedWithin: duration(CHURCH_PLANT_WINDOW.launchedWithinYears, 'year'),
  plantLaunchingWithin: duration(CHURCH_PLANT_WINDOW.launchingWithinMonths, 'month'),
  referralCreditHeld: duration(REFERRAL_CREDIT_HELD_DAYS, 'day'),

  // Help itself.
  aiQuestionsPerDay: String(AI_GUIDE_QUESTIONS_PER_DAY),
  aiChatKept: duration(AI_GUIDE_CHAT_KEPT_DAYS, 'day'),
  officeHoursEvery: duration(OFFICE_HOURS_EVERY_WEEKS, 'week'),
  setupVideos: setupVideoList(SETUP_VIDEOS),

  // Texts, word for word, from the composers that send them.
  exampleChurch: EXAMPLE_CHURCH,
  exampleMeetingQuestion: meetingQuestion({
    ...EXAMPLE_CHECK_IN,
    discloseOptOut: false,
  }),
  exampleSatisfactionQuestion: satisfactionQuestion({
    ...EXAMPLE_CHECK_IN,
    wording: CHECK_IN_WORDING,
  }),
  exampleConcernRequest: concernDetailRequest(EXAMPLE_CHECK_IN),
  exampleThankYou: checkInThankYou(EXAMPLE_CHECK_IN),
  exampleHelpReply: helpMessage({ ministryName: EXAMPLE_CHURCH }),
}
