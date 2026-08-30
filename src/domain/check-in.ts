import type { MemberRole } from './relationships'
import type { PersonId, RelationshipId } from './ids'
import type { Branded } from './branded'
import { hours } from './clock'
import { cadenceInstantOf, isoWeekOf, type Cadence } from './week'

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

/**
 * The enumerated list, and the only place a reply becomes a fact.
 *
 * A list rather than a rule. Bounded edit distance was considered and rejected:
 * at distance two, `no` reaches `not`, `now`, `know` and `so`, so nearly every
 * short English word becomes a neighbour of the two-character tokens. What is
 * here is what Leaders have actually typed, and it grows from the unreadable
 * replies history records -- never from typos somebody imagined.
 *
 * Multi-word entries are tokens and not phrases with a wrapper around them.
 * `we did` and `we didnt` carry polarity, so neither can be stripped as though
 * it were decoration: `no we did` would strip to `no` and record the opposite of
 * what the Leader said. The rule that keeps that from ever happening is
 * structural rather than remembered -- polarity lives here, and PLEASANTRIES
 * holds nothing that has any.
 *
 * A `Map` rather than an object, because an object answers for keys nobody put in
 * it: `{}['constructor']` is a function, not `undefined`, so a Leader texting
 * `constructor` would be read as having answered. Typescript cannot see that --
 * an index signature types the lookup as though the miss were total -- and an
 * enumerated list whose membership test is not exact is not enumerated.
 */
const MET_TOKENS: ReadonlyMap<string, boolean> = new Map([
  ['1', true],
  ['yes', true],
  ['y', true],
  ['yeah', true],
  ['we did', true],
  ['yes we did', true],
  ['2', false],
  ['no', false],
  ['n', false],
  ['nope', false],
  ['we didnt', false],
  ['no we didnt', false],
])

const SATISFACTION_TOKENS: ReadonlyMap<string, Satisfaction> = new Map([
  ['a', 'outstanding'],
  ['great', 'outstanding'],
  // A typo that happened. `gret` is one edit from `great` and one from `greet`,
  // which is exactly why the list is enumerated instead of computed.
  ['gret', 'outstanding'],
  ['b', 'good'],
  ['good', 'good'],
  ['c', 'concern'],
  ['concern', 'concern'],
  ['oncern', 'concern'],
])

/**
 * The closed list, and the one invariant it has to keep: **nothing here carries
 * polarity**. Every entry is a greeting or a courtesy, so removing it cannot
 * change what the message said -- which is what makes the ADR's warning about
 * fragments that invert meaning something the list cannot express rather than
 * something a reviewer has to catch.
 *
 * Anything that does mean yes or no is a token in the tables above. That is the
 * same treatment the ADR gives `we didn't`: part of a token, never a wrapper.
 */
const PLEASANTRIES: readonly string[] = [
  'hi',
  'hey',
  'hello',
  'ok',
  'okay',
  'thanks',
  'thank you',
  'please',
  'sorry',
]

/**
 * Longest first, so `thank you` is taken as one courtesy rather than matching
 * `you` and leaving `thank` behind. Ordered once here rather than on every reply.
 */
const STRIPPABLE = [...PLEASANTRIES].sort((a, b) => b.length - a.length)

/**
 * Down to words and nothing else: lower case, no punctuation, no emoji, single
 * spaces. An emoji is removed rather than read, because sentiment is never
 * inferred from free text and a thumbs-up on its own is free text with the words
 * taken out.
 *
 * Apostrophes are removed rather than turned into a space, straight and curly
 * alike: `didn't` and `didn’t` both have to reach the one token `didnt`, and a
 * phone's autocorrect must not decide whether a Leader was understood. Every
 * other punctuation mark becomes a space, because it separates words rather than
 * sitting inside one.
 */
const wordsOf = (body: string): string =>
  body
    .toLowerCase()
    .replace(/['’ʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The pleasantries off both ends, repeatedly, so `hi yes please` reaches `yes`.
 *
 * Never down to nothing: a message that is only a greeting answered no question,
 * and stripping it to the empty string and then matching would make whichever
 * token the empty string happened to reach the answer to every `hi` ever sent.
 */
const withoutPleasantries = (words: string): string => {
  let remaining = words

  for (let taken = true; taken; ) {
    taken = false
    for (const pleasantry of STRIPPABLE) {
      const lead = `${pleasantry} `
      const trail = ` ${pleasantry}`
      if (remaining.startsWith(lead)) {
        remaining = remaining.slice(lead.length)
        taken = true
      } else if (remaining.endsWith(trail)) {
        remaining = remaining.slice(0, -trail.length)
        taken = true
      }
    }
  }

  return remaining
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
 * What a Leader typed, as a fact or as nothing at all.
 *
 * Whole-message, never substring. `it wasn't great` *contains* `great`, and
 * reading it as an outstanding week would convert a relationship that needs care
 * into a healthy one, clear nothing anybody would notice and produce no signal
 * that it happened. The Leader answered honestly, Discipler recorded the
 * opposite, and the Admin never finds out. See
 * `docs/adr/0003-whole-message-reply-matching.md`.
 *
 * So: punctuation and emoji off, case folded, the closed list of pleasantries
 * taken from both ends, and what is left must *be* a token. Anything else is
 * unreadable, which costs one clarifying message. That is the trade being made
 * deliberately -- the failure mode is visible rather than silent -- and it is why
 * a reply carrying two answers is refused as well: accepting `1 and it was great`
 * would advance two steps on one message and record a rating for a meeting
 * nobody confirmed happened.
 *
 * A token is read against the question that is open, never against the whole set.
 * `1` answering *how did it go* is unreadable, because a satisfaction rating is
 * the only thing that question has an answer for -- and reading it as anything
 * else would record a rating nobody gave.
 */
export const readCheckInReply = (question: CheckInQuestion, body: string): CheckInReply => {
  // Prose is the point here, so nothing is matched at all -- including the
  // tokens. Trimmed only, because leading whitespace is the transport's and not
  // something the Leader typed, and everything else is the Leader's own words.
  if (question === 'concern_detail') {
    const detail = body.trim()
    return detail.length > 0 ? { kind: 'concern_detail', detail } : UNREADABLE
  }

  const token = withoutPleasantries(wordsOf(body))

  if (question === 'met') {
    const met = MET_TOKENS.get(token)
    return met === undefined ? UNREADABLE : { kind: 'met', met }
  }

  const satisfaction = SATISFACTION_TOKENS.get(token)
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
  /**
   * When this relationship's check-in falls, already resolved as
   * `coalesce(r.checkin_day, ms.checkin_day)` by the dispatcher's query.
   *
   * Per relationship rather than per Ministry because the override columns exist
   * and are read from the first line of that query, even though nothing surfaces
   * them in V1 and every one of them is null. A Leader holds one conversation
   * covering everything they lead, so the earliest cadence among them is what
   * makes them due -- with the columns unset that is simply the Ministry's.
   */
  readonly cadence: Cadence
}

/** The question a sequence is currently waiting on, and what it belongs to. */
export interface OpenPrompt {
  readonly promptId: CheckInPromptId
  readonly relationshipId: RelationshipId
  readonly position: number
  readonly question: CheckInQuestion
  /** When it was sent. The twenty-four hours to the reminder are measured here. */
  readonly askedAt: Date
  /**
   * When it was re-sent, or null while it has not been. One reminder per
   * question: this is what says which of the two clocks is running, and a second
   * tick an hour later has to find the same answer as the first.
   */
  readonly remindedAt: Date | null
  /**
   * How many clarifications Discipler has already spent on this question, capped
   * at `CLARIFICATIONS_PER_QUESTION`.
   *
   * Kept against the question and not the conversation. A Leader who mistypes the
   * meeting question twice has spent nothing against the rating question that
   * follows it -- they are different questions with different valid replies, and
   * a Leader who has just been told which ones are valid is the one most likely to
   * get the next one right.
   */
  readonly clarificationsSent: number
}

/**
 * How often Discipler will say *those were the valid replies* before it stops
 * saying anything. Two, and then silence.
 *
 * It caps Discipler's side and nothing else. The question stays open, a valid
 * reply is still accepted right up until the sequence advances past it, and the
 * Leader is never locked out -- a third unreadable message is still recorded,
 * because that is where the enumerated list grows from.
 */
export const CLARIFICATIONS_PER_QUESTION = 2

/**
 * How long an unanswered question waits before it is re-sent, and how long the
 * reminder waits before the conversation moves on without it.
 *
 * The same twenty-four hours both times. A forgotten text is recoverable once;
 * after that, chasing further would be Discipler asking a Leader for something
 * they have now not given twice, and the silence is itself the answer ticket 10
 * reads.
 */
export const REMINDER_AFTER_HOURS = 24

/**
 * What the passage of time has done to the question a conversation is waiting on:
 * re-send it, give up on it, or neither.
 *
 * A function of the prompt and the clock alone, so *twenty-four hours* is
 * provable in a millisecond and the tick can run as often or as rarely as the
 * scheduler likes without changing the answer.
 */
export type CheckInLapse = 'remind' | 'pass_over' | null

export const lapseOfOpenQuestion = (awaiting: OpenPrompt, now: Date): CheckInLapse => {
  const elapsedSince = (moment: Date) => now.getTime() - moment.getTime()
  const waited = hours(REMINDER_AFTER_HOURS)

  // Measured from the reminder rather than from the question, so a tick that ran
  // late does not spend both clocks at once and pass over a question the Leader
  // was never actually reminded about.
  if (awaiting.remindedAt) {
    return elapsedSince(awaiting.remindedAt) >= waited ? 'pass_over' : null
  }

  return elapsedSince(awaiting.askedAt) >= waited ? 'remind' : null
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
   * The Ministry's IANA timezone. The week boundary and the calendar month are
   * both resolved against it, and neither is ever a relationship-level fact: a
   * Leader is in one place, whatever they lead.
   */
  readonly timeZone: string
  /**
   * Every live relationship this Person leads, in any order. The rules about
   * which of them are asked about live here rather than in the query, so they can
   * be driven by a test with no database anywhere near them.
   */
  readonly leads: readonly CheckInRelationship[]
  readonly openSequence: OpenSequence | null
  /**
   * When this Person's last check-in conversation opened, for the monthly
   * opt-out rule. Null for a Leader who has never been asked.
   *
   * The conversation and not the last question in it: a Leader answering on the
   * 1st is sent the next question of *last month's* conversation on the 1st, and
   * measuring from that would make the new month's opening question look like the
   * month's second check-in -- so the month would carry no opt-out language at all.
   */
  readonly lastCheckInAt: Date | null
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
 * A question given up on: reminded once, unanswered twice, and now behind the
 * conversation rather than in front of it.
 *
 * It moves the sequence exactly as far as an answer of *no* would, and that is
 * the whole point -- abandonment becomes an ordinary unanswered question with no
 * special case anywhere downstream. Nothing is recorded as answered, so what
 * ticket 10 reads is silence, which is what it was.
 */
export const PASSED_OVER = { kind: 'passed_over' } as const

/** What ends a question's turn: a reply that was read, or nobody replying at all. */
export type CheckInResolution = CheckInReply | typeof PASSED_OVER

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
  reply: CheckInResolution,
): CheckInAdvance => {
  const askAbout = (
    question: CheckInQuestion,
    relationship: CheckInRelationship,
    position: number,
  ): CheckInAdvance => ({ kind: 'ask', question, relationship, position })

  const current = sequence.covering[awaiting.position - 1]

  // The turn continues on the same relationship. A meeting that happened has a
  // quality to report; a Concern has detail behind it. Neither is ever reached
  // any other way.
  if (current) {
    if (reply.kind === 'met' && reply.met) {
      return askAbout('satisfaction', current, awaiting.position)
    }
    if (reply.kind === 'satisfaction' && reply.satisfaction === 'concern') {
      return askAbout('concern_detail', current, awaiting.position)
    }
  }

  // This relationship's turn is over. `position` is one-based, so it indexes the
  // next relationship without arithmetic.
  const next = sequence.covering[awaiting.position]
  if (!next) return { kind: 'finish' }

  return askAbout('met', next, awaiting.position + 1)
}

/**
 * Whether this Leader's check-in is due now, and the cadence instant that made it
 * so -- or null when it is not. The instant is the return value rather than a
 * bare `true` because it is what gets stamped on the outbound row, and deriving
 * it twice would let the stamp and the decision disagree.
 *
 * *A new week comes due* means a new ISO week in the Ministry timezone, never
 * *seven days since the last prompt*. Under that second reading a cadence edit
 * produces one week carrying two prompts and one carrying none, and ticket 10's
 * consecutive counters misfire silently. See
 * `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.
 *
 * Three conditions, in the order they are cheapest to disprove:
 *
 * - There is something to ask about. A Participant leads nothing, and a Leader
 *   whose every relationship is paused has an empty conversation nobody can
 *   finish.
 * - This ISO week has not already had its prompt. That single test is what makes
 *   the dispatcher idempotent: it may run every hour, or twice, or miss a day.
 * - The cadence instant for this ISO week has arrived. Once it has, it stays
 *   arrived for the rest of the week -- a run that never happened on Monday
 *   evening sends on Tuesday rather than skipping the week.
 */
export const checkInDueThisWeek = (
  snapshot: CheckInSnapshot,
  now: Date,
): Date | null => {
  const covering = relationshipsToAskAbout(snapshot.leads)
  if (covering.length === 0) return null

  const week = isoWeekOf(now, snapshot.timeZone)

  // Asked already this week. Not *within seven days*: a cadence moved earlier
  // shortens the gap between two prompts and moved later lengthens it, and
  // neither is a second prompt or a missed one.
  if (
    snapshot.lastCheckInAt &&
    isoWeekOf(snapshot.lastCheckInAt, snapshot.timeZone) === week
  ) {
    return null
  }

  // The earliest cadence among the relationships this conversation covers. With
  // the override columns null -- which is every row in V1 -- they all carry the
  // Ministry's and this is simply that. The day one of them is surfaced, a Leader
  // is asked as soon as their earliest relationship falls due, and the one
  // conversation covers the rest.
  const due = covering
    .map((relationship) =>
      cadenceInstantOf(week, snapshot.timeZone, relationship.cadence),
    )
    .reduce((earliest, instant) => (instant < earliest ? instant : earliest))

  return due.getTime() <= now.getTime() ? due : null
}
