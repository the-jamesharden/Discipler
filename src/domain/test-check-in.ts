import type { Branded } from './branded'
import { readCheckInReply, CHECK_IN_WORDING, CLARIFICATIONS_PER_QUESTION, type CheckInQuestion, type Satisfaction } from './check-in'
import type { CheckInWords } from './check-in-words'
import { hours } from './clock'
import type { PersonId } from './ids'
import { TEST_CHECK_IN_OPEN_HOURS, TEST_CHECK_INS_PER_DAY } from './launch-terms'
import { calendarDayOf } from './week'

/**
 * The test check-in (Exponential launch, ticket 28; ADR-0031): a real check-in an Admin
 * sends to their own phone to see what their Leaders get.
 *
 * It walks the same three questions as a real conversation and reads replies with the
 * same reader, but it is a state machine of its own, on a table of its own, and it names
 * no relationship: nothing here can reach a Meeting Response, a Concern or a count.
 *
 * Every rule about it is here, against an injected clock, so that the hour and the day
 * in a church's timezone are provable in a millisecond.
 */

export type TestCheckInId = Branded<string, 'TestCheckInId'>

export const testCheckInId = (value: string): TestCheckInId => value as TestCheckInId

/**
 * How a test ended. Only `completed` is an Admin answering it; none of the others texts
 * anything, and each takes with it any of the test's texts still on the queue.
 *
 * `gave_way`: a real check-in was about to be texted to that phone.
 * `replaced`: the Admin pressed Send another with this one still open.
 * `opted_out`: the Admin replied STOP.
 * `timed_out`: nobody answered it for `TEST_CHECK_IN_OPEN_HOURS`.
 */
export type TestCheckInEnding = 'completed' | 'timed_out' | 'gave_way' | 'replaced' | 'opted_out'

/** A test still waiting on the Admin, as the reply router reads it. */
export interface OpenTestCheckIn {
  readonly id: TestCheckInId
  readonly question: CheckInQuestion
  /** When the question now open was texted. The hour runs from here. */
  readonly askedAt: Date
  readonly clarificationsSent: number
  /** Who `[name]` stands for: "your mentee". Kept, so one test reads one way throughout. */
  readonly subject: string
  /** The sentences it opened with, which it finishes with whatever a Save does meanwhile. */
  readonly words: CheckInWords
}

/**
 * Whether a test can still take a reply. The sweep on the tick writes the ending; this
 * is what makes the hour exact, so a `1` a minute past it is not caught by a test that
 * only the next tick would have closed.
 */
export const testCheckInIsLive = (test: Pick<OpenTestCheckIn, 'askedAt'>, now: Date): boolean =>
  now.getTime() - test.askedAt.getTime() < hours(TEST_CHECK_IN_OPEN_HOURS)

/** The moment before which a question left open has run out. */
export const testCheckInsLapsedBy = (now: Date): Date =>
  new Date(now.getTime() - hours(TEST_CHECK_IN_OPEN_HOURS))

/** How many of these sends fell on today, in the church's timezone. */
export const testCheckInsSentToday = (
  sentAt: readonly Date[],
  now: Date,
  timeZone: string,
): number => {
  const today = calendarDayOf(now, timeZone)
  return sentAt.filter((at) => calendarDayOf(at, timeZone) === today).length
}

export const testCheckInsLeftToday = (sentToday: number): number =>
  Math.max(0, TEST_CHECK_INS_PER_DAY - sentToday)

/**
 * Why a test cannot go. The screen owns the sentences.
 *
 * `no_phone`: this Admin has no row on their own Roster, or it has no phone.
 * `opted_out`: the phone replied STOP, and only START undoes that.
 * `declined`: their latest decision about texts is no, which a press does not overturn
 *   (`docs/consent-language.md`: a later Intake wins over sign-up's consent).
 * `agreement_needed`: the card's agreement was not on the screen they pressed.
 * `limit_reached`: `TEST_CHECK_INS_PER_DAY`.
 * `real_question_open`: a real question is out or queued on that phone.
 * `church_has_no_access`: the texting gate would close it anyway (ticket 05).
 */
export type TestCheckInRefusal =
  | 'test_check_in.no_phone'
  | 'test_check_in.opted_out'
  | 'test_check_in.declined'
  | 'test_check_in.agreement_needed'
  | 'test_check_in.limit_reached'
  | 'test_check_in.real_question_open'
  | 'test_check_in.church_has_no_access'

/** Everything the decision needs about one Admin, read under the lock the tick also takes. */
export interface TestCheckInStanding {
  /** Null where this Admin has no Roster row with a phone. */
  readonly personId: PersonId | null
  readonly phone: string | null
  readonly optedOut: boolean
  /** Their latest decision about texts: yes, no, or never asked. */
  readonly smsDecision: boolean | null
  /** Whether they have agreed to the wording that names the test, at sign-up or on the card. */
  readonly agreed: boolean
  /** When this Admin's latest tests went out, enough of them to count a day. */
  readonly sentAt: readonly Date[]
  readonly realQuestionOpen: boolean
  readonly hasAccess: boolean
  readonly timeZone: string
}

/** Whether the card must show its agreement above the button. */
export const needsTheAgreement = (standing: TestCheckInStanding): boolean => !standing.agreed

/**
 * The first reason a test cannot go, or null. The daily limit comes before an open
 * question, since answering the question would not help.
 */
export const testCheckInRefusal = (
  standing: TestCheckInStanding,
  now: Date,
): TestCheckInRefusal | null => {
  if (!standing.personId || !standing.phone) return 'test_check_in.no_phone'
  if (standing.optedOut) return 'test_check_in.opted_out'
  if (standing.smsDecision === false) return 'test_check_in.declined'
  if (testCheckInsSentToday(standing.sentAt, now, standing.timeZone) >= TEST_CHECK_INS_PER_DAY) {
    return 'test_check_in.limit_reached'
  }
  if (standing.realQuestionOpen) return 'test_check_in.real_question_open'
  if (!standing.hasAccess) return 'test_check_in.church_has_no_access'
  return null
}

/** What a reply does to a test, for the boundary to turn into effects and texts. */
export type TestCheckInTurn =
  /** Not an answer to the question open. The question stays open, and Discipler may say so. */
  | { readonly kind: 'unreadable'; readonly clarify: boolean }
  | {
      readonly kind: 'ask'
      readonly question: Exclude<CheckInQuestion, 'met'>
      readonly met: boolean | null
      readonly satisfaction: Satisfaction | null
    }
  | {
      readonly kind: 'finish'
      readonly met: boolean | null
      readonly satisfaction: Satisfaction | null
    }

/**
 * The ladder a real conversation climbs for one relationship: whether they met, then
 * how it went, then the words after a concern. Read by the one reader real replies go
 * through, at the wording every question is sent with now.
 *
 * What a Concern's detail says is not kept anywhere: it is an Admin trying the product,
 * and there is nobody to tell.
 */
export const testCheckInTurn = (test: OpenTestCheckIn, body: string): TestCheckInTurn => {
  const reply = readCheckInReply({ question: test.question, wording: CHECK_IN_WORDING }, body)

  switch (reply.kind) {
    case 'unreadable':
      return { kind: 'unreadable', clarify: test.clarificationsSent < CLARIFICATIONS_PER_QUESTION }
    case 'met':
      return reply.met
        ? { kind: 'ask', question: 'satisfaction', met: true, satisfaction: null }
        : { kind: 'finish', met: false, satisfaction: null }
    case 'satisfaction':
      return reply.satisfaction === 'concern'
        ? { kind: 'ask', question: 'concern_detail', met: null, satisfaction: 'concern' }
        : { kind: 'finish', met: null, satisfaction: reply.satisfaction }
    case 'concern_detail':
      return { kind: 'finish', met: null, satisfaction: null }
  }
}
