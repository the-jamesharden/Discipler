import type { MemberRole } from './relationships'
import type { PersonId, RelationshipId } from './ids'
import type { Branded } from './branded'

/**
 * The weekly conversation, as a set of rules with no infrastructure in them. One
 * sequence per Leader covers every relationship they lead, asked one after
 * another; this module decides the order, the question ladder and what a reply
 * means, and the boundary turns those decisions into messages and history.
 */

export type CheckInSequenceId = Branded<string, 'CheckInSequenceId'>
export type CheckInPromptId = Branded<string, 'CheckInPromptId'>

export const checkInSequenceId = (value: string): CheckInSequenceId =>
  value as CheckInSequenceId
export const checkInPromptId = (value: string): CheckInPromptId => value as CheckInPromptId

/**
 * The three questions asked about one relationship, in the only order they are
 * ever asked in. `satisfaction` follows a meeting that happened; `concern_detail`
 * follows a Concern. Neither is ever reached any other way.
 */
export type CheckInQuestion = 'met' | 'satisfaction' | 'concern_detail'

/**
 * What `A`, `B` and `C` are recorded as. The stored value is the word, not the
 * letter the message advertised: the letters are copy and could be renumbered,
 * and a pilot's first check-in cannot be re-tokenised afterwards.
 */
export type Satisfaction = 'outstanding' | 'good' | 'concern'

const SATISFACTION_TOKENS: Readonly<Record<string, Satisfaction>> = {
  A: 'outstanding',
  B: 'good',
  C: 'concern',
}

/**
 * The carrier opt-out, and the only keyword this ticket handles. The rest of the
 * set -- `HELP`, `PAUSE`, `RESUME`, `SWAP` -- is ticket 17's.
 *
 * Whole-message and case-insensitive: carriers treat the word that way, and a
 * Leader typing `stop` means what a Leader typing `STOP` means. Prose that merely
 * contains it is prose, because reading *please stop asking me this* as an
 * opt-out would stop a Ministry texting somebody who asked for nothing of the
 * kind.
 */
export const isStopKeyword = (body: string): boolean => body.trim().toUpperCase() === 'STOP'

export type CheckInReply =
  | { readonly kind: 'met'; readonly met: boolean }
  | { readonly kind: 'satisfaction'; readonly satisfaction: Satisfaction }
  | { readonly kind: 'concern_detail'; readonly detail: string }
  | { readonly kind: 'unreadable' }

const UNREADABLE: CheckInReply = { kind: 'unreadable' }

/**
 * Strict tokens only: `1`, `2`, `A`, `B`, `C`, exactly, once the transport's
 * surrounding whitespace is gone. Synonyms, known typos, case folding and the
 * closed list of strippable pleasantries are ticket 09's, and until they land a
 * reply that is not one of these is unreadable rather than guessed at.
 *
 * A token is read against the question that is open, never against the whole set.
 * `1` answering *how did it go* is unreadable, because a satisfaction rating is
 * the only thing that question has an answer for -- and reading it as anything
 * else would record a rating nobody gave.
 */
export const readCheckInReply = (question: CheckInQuestion, body: string): CheckInReply => {
  // Prose is the point here, so nothing is matched at all -- including the
  // tokens. Trimmed only, because leading whitespace is the transport's and not
  // something the Leader typed.
  if (question === 'concern_detail') {
    const detail = body.trim()
    return detail.length > 0 ? { kind: 'concern_detail', detail } : UNREADABLE
  }

  const token = body.trim()

  if (question === 'met') {
    if (token === '1') return { kind: 'met', met: true }
    if (token === '2') return { kind: 'met', met: false }
    return UNREADABLE
  }

  const satisfaction = SATISFACTION_TOKENS[token]
  return satisfaction ? { kind: 'satisfaction', satisfaction } : UNREADABLE
}

/**
 * One relationship as the sequence sees it: what it is called in a message, when
 * it started -- which is the order the Leader is asked in -- and the two
 * conditions that take it out of the conversation.
 */
export interface CheckInRelationship {
  readonly relationshipId: RelationshipId
  /**
   * The role the prompt is sent for. `leader` on every row today, and recorded
   * rather than assumed: a Person who leads one relationship and is discipled in
   * another shares one phone number across both, and the role is what tells their
   * messages apart in the data when Participant check-ins are added.
   */
  readonly role: MemberRole
  /**
   * `relationship.created_at`. Earliest first, so the conversation is in the same
   * order every week and a Leader can predict which one is being asked about.
   */
  readonly startedAt: Date
  /** Everyone being discipled in it, for the sentence that names them. */
  readonly participantNames: readonly string[]
  /** Null while it is Awaiting Leader Acceptance. */
  readonly acceptedAt: Date | null
  readonly paused: boolean
}

/** The question a sequence is currently waiting on, and what it belongs to. */
export interface OpenPrompt {
  readonly promptId: CheckInPromptId
  readonly relationshipId: RelationshipId
  readonly position: number
  readonly question: CheckInQuestion
}

export interface OpenSequence {
  readonly sequenceId: CheckInSequenceId
  readonly startedAt: Date
  /**
   * The relationships this sequence covers, in the order it opened with. Held on
   * the sequence rather than re-derived, so a relationship paused halfway through
   * a conversation does not renumber the questions still to come.
   */
  readonly covering: readonly CheckInRelationship[]
  /** Null once the final question has been answered and before it is closed. */
  readonly awaiting: OpenPrompt | null
}

/**
 * Everything a check-in decision needs about one Person. Loaded around the
 * command, never fetched from inside it.
 */
export interface CheckInSnapshot {
  readonly personId: PersonId
  readonly phone: string | null
  /**
   * Every live relationship this Person leads, in any order. The rules about
   * which of them are asked about live here rather than in the query, so they can
   * be driven by a test with no database anywhere near them.
   */
  readonly leads: readonly CheckInRelationship[]
  readonly openSequence: OpenSequence | null
  /**
   * When this Person was last sent a check-in question, for the monthly opt-out
   * rule. Null for a Leader who has never been asked.
   */
  readonly lastAskedAt: Date | null
}

/**
 * Which relationships this week's conversation covers, in the order it asks
 * about them.
 *
 * Awaiting Leader Acceptance and Paused are dropped rather than asked and
 * ignored: both send no check-ins and accrue no silence, and a question that was
 * asked is a question that can go unanswered. Ordering is by start date so the
 * conversation reads the same way every week.
 */
export const relationshipsToAskAbout = (
  leads: readonly CheckInRelationship[],
): readonly CheckInRelationship[] =>
  leads
    .filter((relationship) => relationship.acceptedAt !== null && !relationship.paused)
    .slice()
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

/**
 * What a reply does to the conversation: the next question to send, or the fact
 * that there is nothing left to ask.
 */
export type CheckInAdvance =
  | {
      readonly kind: 'ask'
      readonly question: CheckInQuestion
      readonly relationship: CheckInRelationship
      /** Which relationship's turn it now is, one-based. */
      readonly position: number
    }
  | { readonly kind: 'finish' }

/**
 * The question ladder, and the only place it is written down.
 *
 * Per relationship: *did you meet* first, *how did it go* only on a yes, *what
 * was the Concern* only on a concern. Anything that ends a relationship's turn
 * moves to the next one's opening question -- and where a closing thank-you would
 * have fallen, that question is what is sent instead. The thank-you arrives only
 * after the final relationship, which is how a Leader knows the conversation is
 * finished.
 */
export const advanceCheckIn = (
  sequence: OpenSequence,
  awaiting: OpenPrompt,
  reply: CheckInReply,
): CheckInAdvance => {
  const current = sequence.covering[awaiting.position - 1]

  // The turn continues on the same relationship. A meeting that happened has a
  // quality to report; a Concern has detail behind it. Neither is ever reached
  // any other way.
  if (current) {
    if (reply.kind === 'met' && reply.met) {
      return {
        kind: 'ask',
        question: 'satisfaction',
        relationship: current,
        position: awaiting.position,
      }
    }
    if (reply.kind === 'satisfaction' && reply.satisfaction === 'concern') {
      return {
        kind: 'ask',
        question: 'concern_detail',
        relationship: current,
        position: awaiting.position,
      }
    }
  }

  // This relationship's turn is over. `position` is one-based, so it indexes the
  // next relationship without arithmetic.
  const next = sequence.covering[awaiting.position]
  if (!next) return { kind: 'finish' }

  return {
    kind: 'ask',
    question: 'met',
    relationship: next,
    position: awaiting.position + 1,
  }
}
