import { hours } from './clock'
import { EXCHANGE_EXPIRES_AFTER_HOURS } from './keywords'
import { REMINDER_AFTER_HOURS } from './check-in'

/**
 * **A phone holds one conversation at a time.** The number is the unit, never the
 * Person: a household where three people are reachable on one handset is still one
 * thread, and a second question landing on it would make *the most recent prompt
 * owns the next reply* file one person's answer against another's question.
 *
 * Everything the rule needs is here, as functions of a message kind and a clock, so
 * the queue worker that enforces it holds no product knowledge of its own and a
 * forty-eight hour wait is provable in a millisecond.
 *
 * *Question* rather than *prompt* throughout, because `CONTEXT.md` avoids the second
 * word: the concept is an **Outstanding Reply**, and "prompt" survives only in two
 * column names the glossary grants an exemption to.
 */

/**
 * What kind of message a queued row is, which is the only thing that decides how
 * serialisation treats it. Three kinds, because there are three answers to the two
 * questions worth asking -- does it take the number, and will it wait for it.
 */
export type OutboundMessageKind =
  /**
   * A Response-Required Message the Check-In Rhythm scheduled: the meeting
   * question, the satisfaction question, the Concern detail request. It takes the
   * number when it goes out, and it waits when the number is busy.
   */
  | 'scheduled_question'
  /**
   * A Response-Required Message an inbound keyword opened: the menu that asks
   * which relationship, the confirmation that asks how long. It takes the number,
   * and it **never** waits -- see `waitsForAnOpenReply`.
   */
  | 'keyword_question'
  /**
   * Everything else: the Welcome and Starter Messages, the closing thank-you, a
   * reminder re-send, a clarification, an Invitation Link, an acknowledgement.
   * None of them is answered, so none of them takes the number.
   */
  | 'no_reply'

/**
 * Whether sending this message makes the number busy. True of exactly the
 * Response-Required Messages: a message nobody is expected to answer cannot own
 * the next reply, so it has nothing to hold the phone for.
 *
 * A Starter Message that opened one would block its own relationship's first
 * check-in, which is the concrete case the rule was settled against.
 */
export const opensAnOutstandingReply = (kind: OutboundMessageKind): boolean =>
  kind !== 'no_reply'

/**
 * Whether this message waits when the number is already busy.
 *
 * **Keyword commands and their questions always preempt**, so a `keyword_question`
 * never waits: a Leader who texts `PAUSE` gets the menu immediately rather than
 * after answering the check-in they are trying to pause. It supersedes the open
 * question instead, which is the Check-In Rhythm's own rule and not a second one.
 *
 * A `no_reply` message never waits either, and this is not a convenience. A
 * next-day reminder re-sends the very question that is holding the number: held
 * behind it, it could only ever be released by the timeout that makes it pointless.
 */
export const waitsForAnOpenReply = (kind: OutboundMessageKind): boolean =>
  kind === 'scheduled_question'

/**
 * How the queue is to treat one message, as one answer rather than two booleans a
 * caller has to keep in step. The queue makes the decision atomic; this is the
 * decision.
 */
export interface SerialisationOfAMessage {
  readonly opensAnOutstandingReply: boolean
  readonly waitsForAnOpenReply: boolean
}

export const serialisationOf = (
  kind: OutboundMessageKind,
): SerialisationOfAMessage => ({
  opensAnOutstandingReply: opensAnOutstandingReply(kind),
  waitsForAnOpenReply: waitsForAnOpenReply(kind),
})

/**
 * What a reply settles: whichever question was out on that number, of either kind.
 */
export const WHATEVER_WAS_ASKED: readonly OutboundMessageKind[] = [
  'scheduled_question',
  'keyword_question',
]

/**
 * What a new week replaces: last week's question and nothing else.
 *
 * A Keyword Exchange still out is a request the Leader made and has not withdrawn,
 * running on its own twenty-four hour clock, and a Monday morning is not an answer
 * to it. So this week's first question waits behind one -- which is what *keyword
 * commands always preempt* comes to when the two rules meet.
 */
export const LAST_WEEKS_QUESTION: readonly OutboundMessageKind[] = ['scheduled_question']

/**
 * How long a scheduled question can own a number: twenty-four hours to the
 * reminder and twenty-four more before the sequence advances past it. After that a
 * reply can no longer change anything, so it is no longer worth anybody's wait.
 *
 * Derived from the reminder rather than written down as forty-eight, because it is
 * not an independent number: whatever the reminder clock becomes, this is twice it.
 */
export const SCHEDULED_QUESTION_TIMES_OUT_AFTER_HOURS = REMINDER_AFTER_HOURS * 2

/**
 * One kind of question and the moment before which its answer can no longer change
 * anything.
 *
 * Cutoffs rather than a rule the queue evaluates per row: the windows are the
 * product's, read here against the injected clock, and what crosses the boundary is
 * a list of instants. A sweep carrying `interval '48 hours'` in SQL would be the
 * database holding a Check-In Rhythm rule and reading its own clock to apply it.
 */
export interface OutstandingReplyCutoff {
  readonly kind: OutboundMessageKind
  /**
   * Inclusive, like every other window in the Check-In Rhythm: a question is
   * reminded *at* twenty-four hours and passed over *at* twenty-four more, so it
   * stops holding the number at the same instant rather than a tick afterwards.
   */
  readonly openedNoLaterThan: Date
}

/**
 * Every window there is, which is every kind that opens a conversation at all. A
 * `no_reply` message is absent because it is never open, so there is nothing about
 * it for a clock to run out on.
 */
export const outstandingReplyCutoffs = (
  now: Date,
): readonly OutstandingReplyCutoff[] => [
  {
    kind: 'scheduled_question',
    openedNoLaterThan: new Date(
      now.getTime() - hours(SCHEDULED_QUESTION_TIMES_OUT_AFTER_HOURS),
    ),
  },
  {
    // A Keyword Exchange expires after twenty-four hours with no reminder, and its
    // question stops owning the number at the same moment. One rule, not two: a
    // reply Discipler would no longer act on is not one anything should wait for.
    kind: 'keyword_question',
    openedNoLaterThan: new Date(now.getTime() - hours(EXCHANGE_EXPIRES_AFTER_HOURS)),
  },
]
