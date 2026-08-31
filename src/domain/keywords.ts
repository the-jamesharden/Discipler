import type { Branded } from './branded'
import { CLARIFICATIONS_PER_QUESTION } from './check-in'
import { hours } from './clock'
import type { PersonId, RelationshipId } from './ids'
import { plainWords } from './inbound-text'
import { DEFAULT_PAUSE_PERIOD_WEEKS, PAUSE_PERIODS, type PausePeriodWeeks } from './pause'
import type { MemberRole } from './relationships'

/**
 * The inbound keyword commands, as a set of rules with no infrastructure in them.
 *
 * A Leader may pause their check-ins for a season, come back early, or ask to be
 * matched with someone else, each by texting one word -- with no Admin approval and
 * no difficult conversation. This module decides which word was texted, which
 * relationship it applies to, and what a reply inside a Keyword Exchange means. The
 * boundary turns those decisions into messages, history and pauses.
 */

/**
 * The keyword set, and there is no sixth relationship word.
 *
 * `START` is in it because Discipler has to recognise it, not because it means
 * anything to a relationship: it is the carrier-level re-opt-in that reverses
 * `STOP` and restores messaging, and it resumes nothing. Attaching relationship
 * meaning to it was considered and rejected -- carriers act on `START` before this
 * webhook is consulted, so any meaning here would be contingent on vendor
 * configuration, and making it resume a relationship would release a Resume Message
 * to third parties as a side effect of somebody fixing their own opt-out. See
 * `docs/product-rules.md`, *Settled: `START` Is Carrier-Level Only*.
 */
export const KEYWORDS = ['STOP', 'START', 'HELP', 'PAUSE', 'RESUME', 'SWAP'] as const

export type Keyword = (typeof KEYWORDS)[number]

/**
 * The three that act on a single relationship, and therefore the three that have to
 * resolve a target before they can do anything. They are also the only three that
 * open a Keyword Exchange, which is what *a second keyword replaces the first*
 * means in practice: `HELP` answers itself and `START`/`STOP` are about the Person
 * rather than any relationship, so none of the three can be the second keyword that
 * replaces an open exchange.
 */
export const RELATIONSHIP_KEYWORDS = ['PAUSE', 'RESUME', 'SWAP'] as const

export type RelationshipKeyword = (typeof RELATIONSHIP_KEYWORDS)[number]

export const isRelationshipKeyword = (keyword: Keyword): keyword is RelationshipKeyword =>
  RELATIONSHIP_KEYWORDS.some((each) => each === keyword)

/**
 * What one inbound message is, as a keyword or as nothing at all.
 *
 * **Bare and exact**, which is stricter than the check-in reader beside it and
 * deliberately so. Prose that merely contains the word is prose: reading *please
 * stop asking me this* as an opt-out would stop a Ministry texting somebody who
 * asked for nothing of the kind, and reading *we had to pause for a bit* as a
 * `PAUSE` would suspend a relationship on the strength of a Leader describing one.
 * The Leader who means the keyword sends the keyword.
 *
 * Case-insensitive and trimmed, because a carrier treats the word that way and a
 * Leader typing `pause` means what a Leader typing `PAUSE` means. Nothing else is
 * taken off: no punctuation stripping and no pleasantries, which is the whole of
 * *bare*. This is the same rule `STOP` has always been matched by, now saying so
 * for the whole set rather than for one word.
 */
export const readKeyword = (body: string): Keyword | null => {
  const spoken = body.trim().toUpperCase()
  return KEYWORDS.find((keyword) => keyword === spoken) ?? null
}

/**
 * One relationship as a keyword sees it: which side of it this Person is on, when
 * it started -- which is the order a menu numbers them in -- and the two conditions
 * eligibility turns on.
 *
 * It carries every open member rather than a list of names, because two of the
 * three keywords need more than names: a resume writes to everybody in the
 * relationship, and a `swap_requested` item names the Person who asked. Names for a
 * menu line are `otherSideOf` below, derived from the members rather than loaded
 * beside them, so the sentence and the recipients cannot disagree.
 */
export interface KeywordRelationship {
  readonly relationshipId: RelationshipId
  /** Which side of it this Person is on. A Person may hold one of each. */
  readonly role: MemberRole
  /** `relationship.created_at`. Earliest first, so a menu numbers the same way twice. */
  readonly startedAt: Date
  /** Null while it is Awaiting Leader Acceptance. */
  readonly acceptedAt: Date | null
  /**
   * Null while it is live. Carried rather than filtered out, because an exchange
   * reads its options back by the identifiers it printed a menu from: dropping an
   * entry would renumber every line below it, and a Leader's `2` would select the
   * relationship their message meant to leave alone.
   */
  readonly endedAt: Date | null
  readonly paused: boolean
  /** Everyone holding an open membership, whatever their role. */
  readonly members: readonly KeywordMember[]
}

/**
 * One member of a relationship a keyword names. The same three facts every other
 * snapshot in the domain carries about somebody a message may reach, and no
 * acceptance date -- a keyword acts on the relationship, never on one Leader's
 * agreement to lead it.
 */
export interface KeywordMember {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly fullName: string
  readonly phone: string | null
  /**
   * Whether Discipler may text this member at all: no opt-out standing, and SMS
   * consent that currently holds.
   *
   * Carried rather than assumed, because opting out ends no relationship -- that is
   * the point of it being person-level -- so somebody who texted `STOP` is still an
   * open member of everything they were in. The outbound queue refuses a message to
   * them at the floor, and the whole command is one transaction: a Resume Message
   * composed for them would roll back the resume itself, and a Leader coming back
   * early would lose it with nothing on any screen to say why.
   *
   * They are still **named** in the copy. What the message says is a fact about the
   * relationship; who receives it is a fact about each person's own consent, and
   * the two are not the same question.
   */
  readonly reachable: boolean
}

/**
 * Everything a keyword decision needs about one Person. Loaded around the command
 * like every other snapshot here, so the rules stay drivable with no database in
 * the room.
 *
 * Separate from `CheckInSnapshot` rather than folded into it, though one inbound
 * message consults both. The check-in snapshot answers *which question is this
 * Person's conversation waiting on*; this one answers *what does this Person hold,
 * and what did they ask for*. A Participant has the second and never the first, and
 * a snapshot that had to serve both would carry `leads` for somebody who leads
 * nothing.
 */
export interface InboundSnapshot {
  readonly personId: PersonId
  /**
   * Every live relationship this Person holds, on either side, in any order. Which
   * of them a keyword may act on is a rule and lives here rather than in the query,
   * so it can be driven by a test with no database anywhere near it.
   */
  readonly holds: readonly KeywordRelationship[]
  /**
   * The Keyword Exchange standing open for this Person, or null. At most one, which
   * the database repeats as a partial unique index.
   *
   * *Open* here means unclosed, not live: whether twenty-four hours have run out is
   * a question about time and every one of those is answered against the injected
   * clock, never in SQL.
   */
  readonly exchange: OpenKeywordExchange | null
  /**
   * When Discipler last sent this Person the acknowledgement that answers a message
   * it could make nothing of, or null for somebody it never has. The rate limit on
   * that acknowledgement is measured from here.
   */
  readonly lastAcknowledgedAt: Date | null
  /** Whether an opt-out currently stands on them, which is the only thing `START` acts on. */
  readonly optedOut: boolean
  /**
   * Whether Discipler may text them at all: no opt-out standing, **and** SMS consent
   * that currently holds.
   *
   * Both halves, because the outbound queue's floor is both -- and because a text
   * arrives with no session and no consent test in front of it. `app.sender_of_inbound`
   * resolves any Person by their number, so a Person imported onto the Roster who
   * never completed Intake can text this webhook, and every reply Discipler might
   * compose for them is one the database refuses. The refusal aborts the whole
   * transaction, so their message would fail outright and the delivery vendor would
   * retry the identical failure for as long as it kept trying.
   *
   * Deliberately not merged with `optedOut`. `START` acts on the opt-out and only on
   * the opt-out, and somebody who never consented has nothing for it to reverse.
   */
  readonly mayBeTexted: boolean
}

/**
 * Whether this Person leads anything at all, which is what routes `PAUSE` and
 * `RESUME`.
 *
 * A Leader with nothing eligible is told plainly and nothing is raised; a Person
 * who leads nothing gets an Admin's attention, because *a Participant texting
 * `PAUSE` is most often somebody who wants out and has no other route*.
 *
 * Read off open memberships rather than off an intended role, and *leads nothing*
 * rather than *is a Participant*: somebody on the Roster who holds neither side is
 * as unable to reach their Ministry as a Participant is, and dropping their text
 * is the one outcome that clearly fails them.
 */
export const leadsAnything = (holds: readonly KeywordRelationship[]): boolean =>
  holds.some((relationship) => relationship.role === 'leader')

/**
 * The people on the other side of a relationship from the Person holding it. What a
 * menu line names, and who a Resume Message tells a Leader they are meeting again.
 */
export const otherSideOf = (
  relationship: KeywordRelationship,
  from: MemberRole,
): readonly string[] =>
  relationship.members
    .filter((member) => member.role !== from)
    .map((member) => member.fullName)

/**
 * Which relationships this keyword may act on, in the order a menu numbers them.
 *
 * **Eligibility is per command, and that is the whole of target resolution.**
 * Exactly one eligible relationship applies directly; more than one opens a
 * numbered menu; none draws a plain reply. Because the set is per command,
 * ambiguity is rarer than the raw relationship count suggests -- a Leader holding
 * three relationships of which one is paused resolves a `RESUME` with no menu at
 * all.
 *
 * - `PAUSE` -- what they lead, active and not already paused. A relationship
 *   nobody has accepted sends no check-ins and covers no week, so there is nothing
 *   to suspend, and `Paused` masking `Awaiting Leader Acceptance` would hide a
 *   relationship the acceptance escalation is still counting the days on.
 * - `RESUME` -- what they lead and have paused. Nothing else has a resume in it.
 * - `SWAP` -- everything live they hold, on either side, **including `Paused` and
 *   including `Awaiting Leader Acceptance`**, where it reads as a decline. Without
 *   that a Leader matched with somebody they know is wrong has no way to say so,
 *   and their only option is a silence indistinguishable from being on holiday.
 *
 * **The target is never inferred from Check-In Sequence position.** That position
 * disambiguates a check-in *answer*; borrowing it here would make `RESUME` and
 * `SWAP` -- which normally arrive with no sequence open at all -- behave differently
 * from `PAUSE` for no reason a Leader could predict. Nothing in this function can
 * see a sequence, which is what makes that structural rather than remembered.
 */
export const eligibleFor = (
  keyword: RelationshipKeyword,
  holds: readonly KeywordRelationship[],
): readonly KeywordRelationship[] => {
  const eligible = holds.filter((relationship) => {
    // Nothing is done to a relationship that is over, whichever keyword asked.
    // Checked here rather than by the loader because an exchange's options are read
    // back by identifier and may have ended in the hours since the menu went out.
    if (relationship.endedAt !== null) return false
    if (keyword === 'SWAP') return true
    if (relationship.role !== 'leader') return false
    if (keyword === 'RESUME') return relationship.paused
    return relationship.acceptedAt !== null && !relationship.paused
  })

  return inMenuOrder(eligible)
}

/**
 * The order a menu numbers relationships in, and the order it will number them in
 * again tomorrow.
 *
 * By start date, then by identifier. The tiebreak is not decoration: two
 * relationships formed in the same instant is ordinary -- an Admin pairing a Leader
 * with three people does it in one sitting -- and `sort` is stable, so a tie there
 * fell through to whatever order the rows arrived in, which is the order of a scan
 * and not a fact about the Ministry. A menu whose numbering is not a function of
 * the data is a menu whose `2` means something different on the retry.
 *
 * The same rule `relationshipsToAskAbout` sorts a conversation by, for the same
 * reason and deliberately not shared with it: that one orders what a Leader is
 * asked about and this one orders what they are offered, and the day either wants a
 * different order it must be free to have one.
 */
const inMenuOrder = (
  relationships: readonly KeywordRelationship[],
): readonly KeywordRelationship[] =>
  [...relationships].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() ||
      a.relationshipId.localeCompare(b.relationshipId),
  )

export type KeywordExchangeId = Branded<string, 'KeywordExchangeId'>

export const keywordExchangeId = (value: string): KeywordExchangeId =>
  value as KeywordExchangeId

/**
 * The short SMS conversation Discipler opens when an inbound keyword needs
 * something resolved before it can act: which relationship it applies to, or how
 * long a pause should run.
 *
 * Two steps at most, and which one it is on is read off `target` rather than stored
 * beside it -- a step column and a resolved target would be two answers to one
 * question, free to disagree. A null target is the numbered menu; a target is the
 * pause confirmation, which is the only second step there is.
 */
export interface OpenKeywordExchange {
  readonly exchangeId: KeywordExchangeId
  readonly keyword: RelationshipKeyword
  /**
   * When the Leader's keyword opened this exchange. The twenty-four hours to expiry
   * are measured from here and from nothing else -- not from the latest thing
   * Discipler said inside it, which is what makes a Leader who mistypes twice and
   * replies correctly nineteen hours later still get their pause.
   */
  readonly openedAt: Date
  /**
   * When Discipler last put a question inside this exchange: the moment it opened,
   * or the moment a selection moved it on to the confirmation. What decides whether
   * this exchange or an open check-in question owns the next reply.
   *
   * A clarification does not move it. A clarification restates the question that is
   * already out, exactly as a check-in reminder re-sends the question rather than
   * asking a new one, and neither is a new prompt for a reply to belong to.
   */
  readonly promptedAt: Date
  /** The eligible relationships, in the order the menu numbered them. */
  readonly options: readonly KeywordRelationship[]
  /**
   * The relationship this exchange has settled on, or null while it is still
   * asking. Only a `PAUSE` ever has one: `RESUME` and `SWAP` apply the moment a
   * selection lands, so there is no state between choosing and acting for them to
   * be in.
   */
  readonly target: KeywordRelationship | null
  /**
   * How many clarifications Discipler has already spent on the question this
   * exchange is currently asking, capped at `CLARIFICATIONS_PER_QUESTION`.
   *
   * Against the question and not the exchange, like a check-in's: a Leader who
   * mistypes the menu twice has spent nothing against the confirmation that follows
   * it, and a Leader who has just been told which replies are valid is the one most
   * likely to get the next one right.
   */
  readonly clarificationsSent: number
}

/**
 * How long an unanswered Keyword Exchange waits before it is no longer open.
 *
 * Twenty-four hours, **with no reminder** -- which is the difference between this
 * and a check-in question. A check-in question is Discipler's question and is worth
 * re-sending once; an exchange is something the Leader initiated, and re-prompting
 * somebody about a request they abandoned is nagging.
 */
export const EXCHANGE_EXPIRES_AFTER_HOURS = 24

export const exchangeExpiresAt = (exchange: OpenKeywordExchange): Date =>
  new Date(exchange.openedAt.getTime() + hours(EXCHANGE_EXPIRES_AFTER_HOURS))

/**
 * Whether the twenty-four hours have run out, against the injected clock like every
 * other time-dependent rule.
 *
 * **Expiry raises and changes nothing.** No item, no history, no message: the
 * request is simply no longer outstanding. The row is closed as `expired` the next
 * time anything looks at it, which is bookkeeping rather than an event -- there is
 * nothing for anybody to be told about a request its owner walked away from.
 */
export const exchangeHasExpired = (exchange: OpenKeywordExchange, now: Date): boolean =>
  now.getTime() >= exchangeExpiresAt(exchange).getTime()

/**
 * Whether this exchange still owns replies. Open and inside its window; either half
 * alone is half the question.
 */
export const exchangeIsLive = (
  exchange: OpenKeywordExchange | null,
  now: Date,
): exchange is OpenKeywordExchange => exchange !== null && !exchangeHasExpired(exchange, now)

/**
 * Whether Discipler will spend another clarification on this exchange's question.
 *
 * Two, and then it stops talking -- not listening. The exchange stays open and a
 * valid reply is still honoured right up until it expires. Only Discipler's side is
 * capped, and the cap is the check-in's own constant because it is the same rule
 * and not a second one that happens to use the same number.
 */
export const mayClarify = (exchange: OpenKeywordExchange): boolean =>
  exchange.clarificationsSent < CLARIFICATIONS_PER_QUESTION

/**
 * What a reply inside a Keyword Exchange turns out to be.
 *
 * `select` and `confirm` are different shapes because they end different steps: one
 * settles which relationship, the other settles that the Leader meant it and for
 * how long. A single `number` shape would have made `4` at the confirmation
 * indistinguishable from `4` at the menu.
 */
export type ExchangeReply =
  | { readonly kind: 'select'; readonly relationship: KeywordRelationship }
  | { readonly kind: 'confirm'; readonly periodWeeks: PausePeriodWeeks }
  | { readonly kind: 'unreadable' }

const UNREADABLE: ExchangeReply = { kind: 'unreadable' }

/**
 * The words that confirm a pause on the terms already offered. Written forms only:
 * the numbers at the confirmation mean weeks, so a `1` here is *one week* and never
 * *the first option*, and there is no numeric way to say yes.
 */
const CONFIRMATIONS: readonly string[] = ['yes', 'y', 'yeah', 'yep', 'confirm']

/**
 * The five periods, said in words as well as digits, and each accepting a trailing
 * `week` or `weeks`.
 *
 * The confirmation message offers digits, so the digits are what most Leaders will
 * send. The words are here because a phone offers `Two weeks` as a completion and
 * because *both written and numeric forms are accepted* is the rule -- and because
 * the cost of not reading `2 weeks` is a clarification spent telling somebody the
 * thing they just said.
 */
const PERIOD_WORDS: ReadonlyMap<string, PausePeriodWeeks> = new Map([
  ['1', 1],
  ['one', 1],
  ['2', 2],
  ['two', 2],
  ['4', 4],
  ['four', 4],
  ['8', 8],
  ['eight', 8],
  ['12', 12],
  ['twelve', 12],
])

/** `two weeks` and `2 weeks` down to the number, and nothing else touched. */
const withoutTheUnit = (words: string): string =>
  words.replace(/ weeks?$/, '')

/**
 * What a Leader typed inside an exchange, as a decision or as nothing at all.
 *
 * Whole-message, never substring, for the reason ADR-0003 gives: `not 1` *contains*
 * `1`, and reading it as a selection would pause a relationship the Leader was
 * telling Discipler not to pause. Punctuation and case come off, because `1.` off a
 * phone keyboard is the digit the menu offered; nothing else does.
 *
 * A reply is read against the step that is open, never against both. `4` at a menu
 * of two relationships is unreadable rather than four weeks, and `yes` at a menu is
 * unreadable rather than a selection of the first option -- guessing either would
 * act on a relationship nobody named.
 */
export const readExchangeReply = (
  exchange: OpenKeywordExchange,
  body: string,
): ExchangeReply => {
  const words = plainWords(body)

  // The confirmation step. Only a `PAUSE` ever reaches it, and it is the only step
  // where a number means weeks.
  if (exchange.target) {
    if (CONFIRMATIONS.includes(words)) {
      return { kind: 'confirm', periodWeeks: DEFAULT_PAUSE_PERIOD_WEEKS }
    }

    const periodWeeks = PERIOD_WORDS.get(withoutTheUnit(words))
    return periodWeeks === undefined ? UNREADABLE : { kind: 'confirm', periodWeeks }
  }

  // The numbered menu. One-based, because that is how it was read out.
  if (!/^\d+$/.test(words)) return UNREADABLE

  const relationship = exchange.options[Number(words) - 1]
  return relationship ? { kind: 'select', relationship } : UNREADABLE
}

/**
 * How long Discipler waits before it will answer the same Person's unreadable
 * message again.
 *
 * Twenty-four hours, matching every other window in the product. A Participant in a
 * back-and-forth with their Leader must not be auto-replied to on every message --
 * an acknowledgement per *thanks!* is a Ministry's number arguing with a
 * congregant -- and one a day is enough for somebody who genuinely needs to be told
 * that texting back does not reach anybody.
 *
 * **Not stated in the spec, which says only *rate-limited*.** Twenty-four hours is
 * this implementation's answer to a question the ticket left open, chosen to match
 * the reminder and the exchange rather than introducing a third duration.
 */
export const ACKNOWLEDGEMENT_WINDOW_HOURS = 24

/**
 * Whether Discipler will answer a message it could make nothing of, or has already
 * said this recently enough.
 */
export const mayAcknowledge = (lastAcknowledgedAt: Date | null, now: Date): boolean =>
  lastAcknowledgedAt === null ||
  now.getTime() - lastAcknowledgedAt.getTime() >= hours(ACKNOWLEDGEMENT_WINDOW_HOURS)

/**
 * The periods the confirmation offers as alternatives: the five, minus whichever
 * one it has already proposed.
 *
 * Composed from `PAUSE_PERIODS` rather than written out in the copy, so the message
 * cannot advertise a sixth period or fail to offer a fifth. Offering the proposed
 * number back as an alternative would be inviting a Leader to change their mind to
 * what it already says.
 */
export const otherPeriodsThan = (
  periodWeeks: PausePeriodWeeks,
): readonly PausePeriodWeeks[] => PAUSE_PERIODS.filter((each) => each !== periodWeeks)
