import type { AccountRefusal } from '~/domain/accounts'
import type { AvailabilityOverlay } from '~/domain/availability-overlay'
import type {
  IntakeLinkSnapshot,
  InvitationSnapshot,
  PausedRelationship,
  PersonContact,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type { CheckInSnapshot } from '~/domain/check-in'
import type { ConcernResolution, ConcernViewing, NewConcern } from '~/domain/concerns'
import type {
  CheckInAnswer,
  CheckInClarification,
  CheckInReminder,
  CheckInSequenceClosure,
  DiscipleshipGoalOrder,
  DiscipleshipGoalRemoval,
  DiscipleshipGoalRenaming,
  IntakeRecord,
  LeadEligibility,
  LeaderAcceptance,
  MaterialAssignment,
  KeywordExchangeClarification,
  KeywordExchangeClosure,
  KeywordExchangeTarget,
  NewCheckInPrompt,
  NewCheckInSequence,
  NewDiscipleshipGoal,
  NewKeywordExchange,
  OutboundMessageDraft,
  OutstandingReplyClosure,
  OutstandingReplySweep,
  ParticipantDeparture,
  PersonOptIn,
  PersonOptOut,
  RelationshipCancellation,
  RelationshipEnding,
} from '~/domain/effects'
import type {
  FollowUpPayload,
  FollowUpResolution,
  NewFollowUpItem,
} from '~/domain/follow-up'
import type { OfferedGoal } from '~/domain/discipleship-goals'
import type { IntakeLinkState, IntakeLinkToken, NewIntakeLink } from '~/domain/intake-link'
import type { InboundSnapshot } from '~/domain/keywords'
import type {
  OutboundMessageKind,
  SerialisationOfAMessage,
} from '~/domain/outstanding-reply'
import type { InvitationToken, NewInvitation } from '~/domain/invitations'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { AgeBand, DiscipleshipGoalId, Gender } from '~/domain/intake'
import type {
  ConcernId,
  FollowUpItemId,
  MaterialId,
  MinistryId,
  OutboundMessageId,
  PersonId,
  RelationshipId,
} from '~/domain/ids'
import type { ParticipationStatus } from '~/domain/participation'
import type { NewRelationship } from '~/domain/relationships'
import type { CareReason, RelationshipState } from '~/domain/relationship-state'
import type { InvitationState } from '~/domain/invitations'
import type { MemberRole } from '~/domain/relationships'
import type { NewPerson, PhoneNumber, RosterKey } from '~/domain/roster'

/**
 * Everything the application service needs from the outside world. The domain
 * knows none of these; they exist so the command boundary can stay pure.
 */

/**
 * One command's unit of work: the reads it needs and the writes it makes, on one
 * connection inside one transaction.
 *
 * It reads as well as writes, which is why it is not called a sink. The Roster is
 * read in order to decide what to write to it, and doing that before the
 * transaction opens would let two Admins importing the same spreadsheet at once
 * both find the Roster empty.
 */
/**
 * One read of the Roster, answering the two questions anything writing to it has:
 * have I seen this exact line before, and do I already hold this number.
 */
export interface RosterReadback {
  readonly people: ReadonlyMap<RosterKey, PersonId>
  readonly namesByNumber: ReadonlyMap<PhoneNumber, readonly string[]>
}

export interface UnitOfWork {
  /**
   * Everyone already on this Ministry's Roster: by `rosterKey` against the
   * identifier behind it, and by number against the names it holds. Intake needs
   * the Person behind a key, because whoever is filling the form in is usually
   * already on a Roster somebody uploaded; an import needs both, because a number
   * it already holds under another name is neither a duplicate nor a new Person
   * until an Admin says which.
   */
  peopleOnRoster(): Promise<RosterReadback>
  /**
   * Everyone in this Ministry with at least one Intake submission already on file.
   * Read inside the unit of work like the Roster, and for the same reason: two
   * submissions racing each other must not both read "never submitted" and both
   * enqueue a Welcome Message.
   */
  peopleWhoCompletedIntake(): Promise<ReadonlySet<PersonId>>
  /**
   * The Ministry's name, in whose voice every outbound message speaks. Read inside
   * the unit of work like everything else, so a command cannot compose a message
   * for a Ministry the connection is not acting for.
   */
  ministryName(): Promise<string>
  /**
   * Refuses with a `RosterImportRefused` when one of these people is already on the
   * Roster -- the case the read above is meant to catch, left to the database as the
   * backstop against two imports racing each other.
   */
  createPeople(people: readonly NewPerson[]): Promise<void>
  appendHistory(events: readonly NewHistoryEvent[]): Promise<readonly HistoryEvent[]>
  /**
   * The submission, its availability, the consents it granted, and the email it
   * carried. One call because they are one act, and because the outbound queue
   * refuses a message to anybody with no SMS consent on file -- so the consent has
   * to be written before the Welcome Message is enqueued, not merely in the same
   * transaction.
   */
  recordIntake(intake: IntakeRecord): Promise<void>
  enqueueMessages(messages: readonly OutboundMessageDraft[]): Promise<void>
  /**
   * Closes whatever conversation this number is holding, so the next scheduled
   * message to it may go out. Does nothing where the number holds none, and
   * nothing at all where the Person has no number.
   */
  closeOutstandingReply(closure: OutstandingReplyClosure): Promise<void>
  /**
   * Closes every conversation the clock has run out on, in one statement. The
   * cutoffs arrive already worked out -- the windows are the Check-In Rhythm's and
   * are read against the injected clock, so nothing here has to know what
   * forty-eight hours means.
   */
  sweepOutstandingReplies(sweep: OutstandingReplySweep): Promise<void>
  /**
   * Refuses with a `PairingRefused` carrying a code when a participation cap or the
   * one-role-per-relationship rule is broken. The caps can only be judged against
   * the Ministry's other relationships, so the database is the only thing in a
   * position to judge them -- and it must not do so silently.
   */
  createRelationship(relationship: NewRelationship): Promise<void>
  /**
   * The names and numbers of the people a command names. Pairing needs them
   * because it texts every Leader an Invitation Link, and a message needs a
   * recipient and a greeting.
   */
  contactsFor(ids: readonly PersonId[]): Promise<ReadonlyMap<PersonId, PersonContact>>
  /**
   * The token as the database holds it, with everyone holding an open membership
   * on the relationship it names. Null when nothing answers to it.
   *
   * An expired or consumed token still resolves. The page has to tell the
   * difference between a link that has run out and one that was never real, and
   * refusing to resolve either would make those the same screen.
   */
  resolveInvitation(token: InvitationToken): Promise<InvitationSnapshot | null>
  issueInvitation(invitation: NewInvitation): Promise<void>
  /**
   * Replaces the live invitation this Person holds to this relationship with a new
   * token and a new window. One row throughout: the partial unique index permits
   * one live invitation per person per relationship, and a dead token left beside
   * a live one is a second way in that nothing can revoke.
   */
  reissueInvitation(invitation: NewInvitation): Promise<void>
  /**
   * One Leader agreeing to lead, as one write. The token is spent, the name is
   * stored as given, the account is linked to the Person record, the membership is
   * stamped -- and the relationship itself is stamped when this was the last open
   * leader membership left to agree.
   */
  acceptInvitation(acceptance: LeaderAcceptance): Promise<void>
  /**
   * Raising an item that already stands changes nothing. Twenty taps on "not my
   * number" is one condition, and the Admin sees one thing to act on.
   */
  raiseFollowUp(item: NewFollowUpItem): Promise<void>
  /**
   * Refuses with a `FollowUpRefused` when the item is gone or already closed. Two
   * Admins clicking Resolve on the same row is ordinary, and only the database can
   * see which of them got there first.
   */
  resolveFollowUp(resolution: FollowUpResolution): Promise<void>
  /**
   * Every relationship in this Ministry that nobody has accepted, with the Leaders
   * still to agree and whether each has been reminded. Everything the tick needs to
   * decide anything, read in one place so the domain fetches nothing.
   */
  unacceptedRelationships(): Promise<readonly UnacceptedRelationship[]>
  /**
   * Every relationship in this Ministry a Pause currently stands on, with the
   * period it was taken for and whether an Admin already has an expiry item open
   * on it. Everything the tick needs to decide a Pause has run out, read in one
   * place so the domain fetches nothing.
   *
   * Whether it *has* run out is not answered here. That is a question about time,
   * and every one of those is decided at the command boundary against the
   * injected clock -- which is what lets a twelve-week pause be proven by a test
   * that runs in milliseconds.
   */
  pausedRelationships(): Promise<readonly PausedRelationship[]>
  /**
   * One relationship as the database holds it now, or null when this Ministry has
   * none by that identifier -- which is the same answer for one that belongs to
   * another Ministry, because the policy on the connection shows neither.
   */
  relationshipFor(id: RelationshipId): Promise<RelationshipSnapshot | null>
  /**
   * Withdraws a relationship nobody accepted and closes every open membership on
   * it, which is the whole of returning everyone to the suggestion pool.
   */
  cancelRelationship(cancellation: RelationshipCancellation): Promise<void>
  /**
   * Ends a relationship that ran and closes every open membership on it, in one
   * transaction and through the one database function that ends a relationship --
   * which is what keeps *no open membership outlives its relationship* true of
   * every write path rather than of this one.
   *
   * Refuses with an `EndingRefused` when the database disagrees with the snapshot
   * the domain decided from: two Admins clicking End is ordinary, and only the
   * second one is wrong.
   */
  endRelationship(ending: RelationshipEnding): Promise<void>
  /**
   * Closes one Participant's open membership and nothing else. The row is dated,
   * never deleted, so the weeks they were present for stay attached to the
   * relationship -- and a readmission later is a second row rather than this one
   * reopened.
   */
  departFromRelationship(departure: ParticipantDeparture): Promise<void>
  /**
   * Closes the Material period that was running and opens a new one at the same
   * instant, through the one database function that writes either -- which is what
   * keeps *periods never overlap and never leave gaps* true of every write path
   * rather than of the one that happens to be careful.
   *
   * Refuses with a `MaterialAssignmentRefused` when the database disagrees with the
   * snapshot the domain decided from, or when the Material or the Admin belongs to
   * another Ministry.
   */
  assignMaterial(assignment: MaterialAssignment): Promise<void>

  /**
   * Everything a check-in command needs about one Person: the live relationships
   * they lead, the conversation already open with them if there is one, and when
   * they were last asked anything.
   *
   * Read for the Person and never for a relationship. A Leader holding three of
   * them has one conversation, and the position in it is the only thing that says
   * which relationship a `1` is about.
   */
  checkInFor(id: PersonId): Promise<CheckInSnapshot | null>
  /**
   * Every Leader in this Ministry the cadence could make due, with the cadence
   * already resolved as `coalesce(r.checkin_day, ms.checkin_day)`.
   *
   * *Could*, not *is*. Nothing here reads a clock: which of them a new ISO week
   * has come due for is decided at the command boundary against the injected
   * one, so the whole cadence -- the day, the hour, the timezone, the week
   * boundary and what a mid-week edit does to it -- is provable by a test with no
   * database and no fortnight of waiting.
   */
  leadersDueForCheckIn(): Promise<readonly CheckInSnapshot[]>

  openCheckInSequence(sequence: NewCheckInSequence): Promise<void>
  askCheckInQuestion(prompt: NewCheckInPrompt): Promise<void>
  recordCheckInAnswer(answer: CheckInAnswer): Promise<void>
  /** One clarification spent on the open question, against a cap of two. */
  clarifyCheckInQuestion(clarification: CheckInClarification): Promise<void>
  /** The one re-send an unanswered question gets, stamped on that same prompt. */
  remindCheckInQuestion(reminder: CheckInReminder): Promise<void>
  closeCheckInSequence(closure: CheckInSequenceClosure): Promise<void>

  /** The carrier opt-out, at the level the carrier applies it: the Person. */
  optPersonOut(optOut: PersonOptOut): Promise<void>

  /**
   * The carrier re-opt-in, `START`, which dates the standing opt-out rather than
   * deleting it. `STOP` in March and `START` in April are two facts.
   */
  optPersonIn(optIn: PersonOptIn): Promise<void>

  /**
   * What the Person an inbound text came from holds, what they last asked for, and
   * whether Discipler may still text them.
   *
   * Read alongside `checkInFor` and behind the same advisory lock it takes, so a
   * keyword and a newly-due conversation cannot both find nothing outstanding. Two
   * reads rather than one because they answer different questions: this one serves
   * a Participant, who has no check-in state at all.
   */
  inboundFor(id: PersonId): Promise<InboundSnapshot | null>

  /**
   * A Keyword Exchange, opened. Refused by a partial unique index if one already
   * stands for this Person, which is what makes *at most one open per Person* a
   * property of the data rather than of whichever path happened to write it.
   */
  openKeywordExchange(exchange: NewKeywordExchange): Promise<void>

  /**
   * A menu answered: the relationship the exchange has settled on, and the moment
   * it put its next question. Resets the clarification count, because the
   * confirmation is a new question.
   */
  setKeywordExchangeTarget(target: KeywordExchangeTarget): Promise<void>

  /** One of the two clarifications Discipler will spend on an exchange's question. */
  clarifyKeywordExchange(clarification: KeywordExchangeClarification): Promise<void>

  /** An exchange that is no longer open, and why. */
  closeKeywordExchange(closure: KeywordExchangeClosure): Promise<void>

  /**
   * An Admin's plan that this Person may lead. Set either way round -- withdrawing
   * it is the same write with the other answer -- and it stands alone: it neither
   * reads nor changes Intake, an account, or any membership.
   */
  setLeadEligibility(eligibility: LeadEligibility): Promise<void>

  /**
   * Every Discipleship Goal option this Ministry offers, in the order the form
   * shows them, each with how many people's current Intake answer points at it.
   *
   * The count comes back with the options rather than being asked for separately,
   * because the one edit that needs it is the one that destroys it: after the
   * removal there is nothing left to count.
   */
  discipleshipGoals(): Promise<readonly OfferedGoal[]>

  /** One option, appended to the Ministry's list at the position it was given. */
  addDiscipleshipGoal(goal: NewDiscipleshipGoal): Promise<void>

  /**
   * One option, reworded. The row is updated rather than replaced, which is what
   * keeps every answer pointing at it: a reworded option is the same option.
   */
  renameDiscipleshipGoal(renaming: DiscipleshipGoalRenaming): Promise<void>

  /** The Ministry's whole list, renumbered into the order it was handed. */
  reorderDiscipleshipGoals(order: DiscipleshipGoalOrder): Promise<void>

  /**
   * One option, deleted. The database blanks it on every submission that chose
   * it, and refuses to delete the last option a Ministry has.
   */
  removeDiscipleshipGoal(removal: DiscipleshipGoalRemoval): Promise<void>

  /**
   * The link that reopens one Person's Intake. Replaces whatever link that Person
   * held: one live link each is what an Admin means by *send them a new one*.
   */
  issueIntakeLink(link: NewIntakeLink): Promise<void>

  /**
   * The link a re-submission arrived on, or null where the token names nothing.
   * Answers for an expired link too: whether it has run out is decided against the
   * injected clock, and a read that refused to resolve one would make *this link
   * has expired* and *this link was never real* the same page.
   */
  resolveIntakeLink(token: IntakeLinkToken): Promise<IntakeLinkSnapshot | null>

  /**
   * The link this Person already holds, or null where they hold none. Read on
   * `intake.reopen`'s behalf so that asking for a link somebody already has does
   * not mint a second one and stop the first from working.
   */
  intakeLinkFor(person: PersonId): Promise<IntakeLinkSnapshot | null>

  raiseConcern(concern: NewConcern): Promise<void>
  /** One Admin opening one Concern's text, recorded before the text is handed over. */
  recordConcernViewing(viewing: ConcernViewing): Promise<void>
  /**
   * Refuses with a `ConcernRefused` when the Concern is gone or somebody else has
   * already closed it -- the second Admin's click must not overwrite the first
   * Admin's name with their own.
   */
  resolveConcern(resolution: ConcernResolution): Promise<void>
  /**
   * The Leader's words, or null when the Concern is gone or has been resolved and
   * cleared.
   *
   * Read through the command connection and nowhere else. The authenticated role
   * holds no grant on that column at all, so this read is only reachable from
   * inside a transaction that has just recorded who did it -- which is what makes
   * reading a Concern without leaving a trace unrepresentable rather than merely
   * discouraged.
   */
  concernDetailFor(id: ConcernId): Promise<string | null>
}

/**
 * Minting the account a Leader signs in with. It is the one thing the application
 * needs from the outside world that creates a user rather than reading or writing
 * a row, which is why it is a port of its own rather than part of the unit of work:
 * it happens before the transaction and it cannot be rolled back with it.
 */
export interface LeaderAccounts {
  /**
   * The number is the one on file, never one that was typed -- a forwarded link
   * must not be able to re-point an account at somebody else's phone.
   */
  create(
    phone: string | null,
    password: string,
  ): Promise<{ readonly userId: string } | { readonly refusal: AccountRefusal }>
  /**
   * Undoes a `create` whose acceptance did not land.
   *
   * An account is minted before the command that links it, so a failure in between
   * leaves a login belonging to no Person -- and the number it holds is the one the
   * retry needs, which is why the retry was refused rather than recovering. This
   * puts the number back.
   *
   * It refuses an account any Person already holds. That account was not made by
   * the attempt that is failing, and deleting it would sign a working Leader out of
   * their Ministry for good.
   */
  discard(userId: string): Promise<void>
}

/**
 * Which Ministry an inbound text belongs to, and who on it sent it. The one
 * question that cannot be answered inside a Ministry-scoped unit of work, because
 * a text message arrives with a phone number and no session, no URL and no token.
 *
 * A number held by more than one Person resolves to nobody rather than to a
 * guess: filing one congregant's answer against another's relationship is worse
 * than not reading the message. Ticket 26 is what makes a shared number
 * resolvable.
 */
export interface InboundSender {
  readonly ministryId: MinistryId
  readonly personId: PersonId
}

export interface InboundReader {
  resolveSender(fromPhone: string): Promise<InboundSender | null>
}

export interface EffectStore {
  /**
   * A command's effects land together or not at all. A half-applied command would
   * leave history claiming something that never reached anyone, or a message
   * reaching someone with no record that it did.
   *
   * The Ministry is named up front rather than inferred from each row, so the
   * store can scope the whole unit of work to it and let the database refuse
   * anything that falls outside.
   */
  transact<T>(ministryId: MinistryId, work: (unit: UnitOfWork) => Promise<T>): Promise<T>
}

/**
 * Every Ministry there is, by id alone.
 *
 * The one read in Discipler that is not scoped to a Ministry, and it is separate
 * from `EffectStore` for that reason: that port's contract is that the Ministry is
 * named up front, and a method here that answered *all of them* would contradict
 * the sentence it is written under.
 *
 * It exists because the scheduled tick is per-Ministry and the scheduler is not.
 * Something has to turn *it is nine o'clock* into *it is nine o'clock for each of
 * these*, and this is the smallest thing that can: ids, no names, no rows, nothing
 * a caller could render or leak across a boundary.
 */
export interface MinistryDirectory {
  everyMinistry(): Promise<readonly MinistryId[]>
}

/**
 * The Leader Dashboard's ports.
 *
 * One relationship as the Leader who leads it sees it: the availability overlay,
 * the Material assigned to it, and the name and number of everyone in it. Three
 * things and nothing else -- no message history, no analytics, and nothing about
 * anybody the Leader does not lead.
 */

/** The Material a relationship is working through, or null where none is assigned. */
export interface AssignedMaterial {
  readonly materialId: MaterialId
  readonly title: string
  /** The Ministry's own typed content. Null where the Material is a PDF alone. */
  readonly body: string | null
  /** What the Admin's file was called, kept so a link can carry its own name. */
  readonly pdfFilename: string | null
  /**
   * A short-lived link to the PDF, or null where there is none to link to. Minted
   * per render rather than stored: a URL that outlived the assignment would be a
   * Material readable by a Leader it was taken away from.
   */
  readonly pdfUrl: string | null
}

/**
 * One person in the relationship, as the Leader's screen shows them.
 *
 * The name is always there and the number is not. Contact-sharing consent is
 * checked at the moment of display, never assumed from enrolment, so `phone` is
 * null for a Person who declined it, withdrew it, was never asked, or has no number
 * on file -- four states the screen deliberately cannot tell apart, because a
 * Leader who could would be reading a consent decision by inference.
 */
export interface RelationshipContact {
  readonly personId: PersonId
  readonly fullName: string
  readonly role: MemberRole
  /**
   * Whether this is the Leader reading the page. Not the same question as `role`:
   * a group may hold several Leaders, and only one of them is signed in.
   */
  readonly isYou: boolean
  readonly phone: PhoneNumber | null
}

export interface RelationshipLed {
  readonly relationshipId: RelationshipId
  readonly ministryId: MinistryId
  readonly ministryName: string
  /**
   * Whether a Pause currently stands on it. The one thing about a relationship's
   * condition this surface carries: a Pause is the Leader's own act and the reason
   * their weekly check-ins have stopped arriving. How a relationship is *doing* --
   * Healthy, Stalled, Needs Care -- is the Admin's reading and lives on Care Needed.
   */
  readonly paused: boolean
  readonly overlay: AvailabilityOverlay
  readonly material: AssignedMaterial | null
  /** Everyone in it, in the order the overlay draws them: the reader, then the rest. */
  readonly contacts: readonly RelationshipContact[]
}

export interface LeaderDashboardReader {
  /**
   * Every relationship the signed-in user currently holds an open leader membership
   * on, across every Ministry they hold a Person record in.
   *
   * No Ministry argument, and that is the point rather than an omission. Every other
   * reader here names the Ministry it acts for because an Admin surface is scoped by
   * a tier the session already carries; this list is a live query for open leader
   * memberships and nothing else, so an Admin who leads two relationships sees them
   * without a second account, and a Leader whose last relationship ends stops seeing
   * the surface without anybody revoking anything.
   */
  listRelationshipsLed(): Promise<readonly RelationshipLed[]>
}

/**
 * One open relationship a Person holds a membership in, from that Person's side:
 * what they are in it, and who else is.
 *
 * The role is what makes the row legible. A Person leading two relationships and a
 * Person being discipled in two are the same list of names and opposite situations,
 * and it is the first of them that reads `Ready to Pair` -- the status an Admin
 * takes for a bug unless the row says why.
 */
export interface RosterRelationship {
  /**
   * Named so the row can act on it. Every act an Admin takes about a relationship
   * from the Roster is about one of *these* relationships rather than about the
   * Person, and without the id the row can describe them and do nothing.
   */
  readonly relationshipId: RelationshipId
  readonly role: MemberRole
  /** Everyone else in it, whatever their role. A group shows all of them. */
  readonly withNames: readonly string[]
  /**
   * Derived from `relationship.accepted_at`, never stored as a status. It is the
   * absence of an acceptance rather than a state anybody sets, which is why it
   * belongs on the relationship and not beside the Participation Status: it says
   * nothing about the Person whose row it is on, and both sides of the same
   * relationship read it the same way.
   */
  readonly awaitingAcceptance: boolean
}

export interface RosterEntry {
  readonly personId: PersonId
  readonly fullName: string
  /**
   * Derived, never stored, and it answers one question: is this Person being
   * discipled. Leading a relationship does not set it. Computed by one SQL function
   * over Intake, consent and open participant memberships.
   */
  readonly participationStatus: ParticipationStatus
  /** Every open relationship they are in, each with their role in it. */
  readonly relationships: readonly RosterRelationship[]
  /**
   * An Admin's plan that this Person may lead, recorded before Intake and kept
   * afterwards. Stored, unlike the status beside it, and deliberately independent
   * of it: it does not make them pairable, does not stand in for Intake, and says
   * nothing about what they already lead.
   */
  readonly eligibleToLead: boolean
}

/** The live Intake link one Person holds, for the Admin who is about to send it. */
export interface IssuedIntakeLink {
  readonly token: IntakeLinkToken
  readonly expiresAt: Date
}

export interface RosterReader {
  /** Scoped to one Ministry, and enforced as such in the database, not here. */
  listRoster(ministryId: MinistryId): Promise<readonly RosterEntry[]>

  /**
   * The link this Person currently holds, or null where they hold none and where
   * the one on file has run out. Live is the whole of what this promises: the
   * caller is an Admin about to send it, and a token that no longer opens anything
   * is worse to them than no token at all.
   *
   * Read one at a time and never with the Roster. Every Person's token on one page
   * would be a page full of credentials, most of them for rows nobody is acting on;
   * this answers for the one an Admin has just asked about.
   */
  liveIntakeLink(
    ministryId: MinistryId,
    person: PersonId,
  ): Promise<IssuedIntakeLink | null>
}

/**
 * The sending layer's ports. They live here with every other port rather than
 * beside `dispatchQueue`, so that the one place naming what the application needs
 * from the outside world stays the one place.
 */

/**
 * Whether the queue may send this row on this drain. `held` is not a failure and
 * not a refusal: `claim` says what each of its causes is.
 */
export type ClaimOutcome = 'claimed' | 'held'

/** Why the sending layer refused a message. Codes, never prose. */
export type WithholdingReason =
  | 'recipient_opted_out'
  | 'recipient_has_no_sms_consent'
  | 'recipient_has_no_phone'

export interface QueuedMessage {
  readonly id: OutboundMessageId
  readonly personId: PersonId | null
  readonly toPhone: string | null
  readonly body: string
  /**
   * What serialisation reads, and the only thing that says whether this message
   * takes the recipient's number or waits for it. The rules are
   * `~/domain/outstanding-reply`'s; the queue holds none of them.
   */
  readonly kind: OutboundMessageKind
  /**
   * Whose contact details this message would include. Resolved at send time,
   * because contact-sharing consent is checked when a message is sent and never
   * assumed from enrolment -- and a body that already carried the number would
   * leave nothing to withhold.
   */
  readonly disclosesPersonId: PersonId | null
}

export interface ContactDetails {
  readonly fullName: string
  readonly phone: PhoneNumber
}

/**
 * Every method names the Ministry it acts for. The queue is drained on a trusted
 * connection with no session behind it, so nothing else is in a position to say
 * which Ministry a read belongs to -- and a port that took only a `PersonId` would
 * be asking the database to answer across all of them.
 */
export interface OutboundQueue {
  /** Everything enqueued for this Ministry and neither sent nor withheld. */
  due(ministryId: MinistryId): Promise<readonly QueuedMessage[]>
  /**
   * The number this Ministry sends from, or null where none is provisioned yet.
   *
   * Read here rather than taken from configuration because sending identity is a
   * property of the Ministry: a number in the environment is one congregation's
   * people receiving texts from another's the first time a second Ministry is
   * onboarded, and by then it is a migration against live message history.
   */
  sendingNumber(ministryId: MinistryId): Promise<string | null>
  /** Whether this Person may be sent to *right now*, not when they were queued. */
  mayReceive(ministryId: MinistryId, personId: PersonId): Promise<WithholdingReason | null>
  /** The details to disclose, or null where the Person has not agreed to share. */
  contactToShare(ministryId: MinistryId, personId: PersonId): Promise<ContactDetails | null>
  /**
   * Takes the row and, where the message expects a reply, the recipient's number
   * with it. **Asking and taking are one transaction**, because the question two
   * workers must not both answer yes to is *is this number free* -- and a check
   * made before the write is a check both of them pass.
   *
   * The row lock stops two workers picking up the same row. It cannot stop them
   * taking the same *number*, because there they hold two different rows and share
   * nothing but the key: what refuses the second of them is the unique index on
   * `(ministry_id, prompt_key) where prompt_state = 'open'`. See ADR 0013.
   *
   * `claimed` -- send it. `held` -- not on this drain: the number is holding a
   * conversation, or another worker has the row, or another worker took the number
   * between the check and the write. All three come back the same way because all
   * three mean the same thing to a dispatcher: leave the row alone and let the next
   * drain try it.
   *
   * A claim that takes the number takes it *before* the vendor is called rather
   * than after. That is the only ordering in which two workers cannot both decide
   * the number is free, and it is paid for by `release`.
   */
  claim(
    ministryId: MinistryId,
    id: OutboundMessageId,
    message: SerialisationOfAMessage,
    at: Date,
  ): Promise<ClaimOutcome>
  /**
   * Gives the number back after the vendor refused the message. Without it a
   * message Twilio could not deliver would hold its recipient's conversation for
   * two days over nothing.
   */
  release(ministryId: MinistryId, id: OutboundMessageId): Promise<void>
  markSent(ministryId: MinistryId, id: OutboundMessageId, at: Date): Promise<void>
  withhold(
    ministryId: MinistryId,
    id: OutboundMessageId,
    reason: WithholdingReason,
    at: Date,
  ): Promise<void>
}

/** Twilio lives behind this and nowhere else. It is not a domain concept. */
export interface MessageTransport {
  /**
   * `from` is passed rather than held, because one transport serves every Ministry
   * and each of them sends as itself. A transport that closed over a number would
   * make the identity a property of the deployment, which is the thing the spec
   * rules out.
   *
   * Throws when the vendor refuses. The row stays neither sent nor withheld, so the
   * next drain picks it up again -- see `dispatchQueue`, which keeps one refusal
   * from taking the rest of the queue down with it.
   */
  deliver(from: string, to: string, body: string): Promise<void>
}

export interface DiscipleshipGoalOption {
  readonly id: DiscipleshipGoalId
  readonly label: string
}

/** What the Intake form needs to render itself, for a visitor with no session. */
export interface IntakePage {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
}

/**
 * The same page, reopened by the one Person a token names, with what they last
 * told this Ministry already in it.
 *
 * The link state travels with it rather than being resolved into a refusal here.
 * A link that has run out and a token that was never real reach their holder as
 * different pages: one sends them back to whoever issued it, the other is a URL
 * that means nothing.
 */
export interface ReopenedIntakePage extends IntakePage {
  readonly personId: PersonId
  readonly state: IntakeLinkState
  readonly prefill: IntakePrefill
}

/**
 * What a Person already told this Ministry, as the form takes it back. Every field
 * is nullable: an Admin may send the link to somebody who has never submitted, and
 * a blank form is the right thing to show them.
 */
export interface IntakePrefill {
  readonly fullName: string | null
  readonly phone: string | null
  readonly email: string | null
  readonly ageBand: AgeBand | null
  readonly gender: Gender | null
  readonly goalId: DiscipleshipGoalId | null
  /**
   * Slot keys as the grid submits them -- `monday:midday`. Deliberately the form's
   * own wire shape rather than `AvailabilitySlot`, because this is what the form
   * takes back: `IntakeFormFields.availability` is the same list of strings, and a
   * prefill in a different shape would be parsed on the way in and re-encoded on
   * the way out for no reader's benefit.
   */
  readonly availability: readonly string[]
  /**
   * The decision that currently stands, never merely the last one recorded. A
   * Person who granted contact sharing and later declined it sees `declined`,
   * because that is what the form has to let them change back.
   */
  readonly contactSharing: 'granted' | 'declined' | null
}

/**
 * One option as the settings surface shows it: what it says, and what removing it
 * would cost.
 *
 * The same count the command boundary decides against, and from the same
 * definition in the database -- so the number an Admin was warned with and the
 * number history records cannot disagree.
 */
export interface DiscipleshipGoalListing {
  readonly id: DiscipleshipGoalId
  readonly label: string
  /** How many people's current Intake answer points at this option. */
  readonly chosenBy: number
}

/**
 * What the settings surface needs to show a Ministry its own list. Read through
 * the signed-in Admin's session, so the policies are what scope it -- an Admin
 * sees their Ministry's options and no other Ministry's, and goals are never
 * shared or compared across Ministries.
 */
export interface DiscipleshipGoalReader {
  listDiscipleshipGoals(
    ministryId: MinistryId,
  ): Promise<readonly DiscipleshipGoalListing[]>
}

export interface IntakeReader {
  /** Null when the link names no Ministry this Discipler holds. */
  readIntakePage(id: string): Promise<IntakePage | null>

  /** Null when the token names nobody. Expired links still answer. */
  readReopenedIntakePage(token: string): Promise<ReopenedIntakePage | null>
}

/**
 * What the Invitation Link's page shows before anything is asked of its holder:
 * who they have been matched with, for which Ministry, and the number Discipler
 * will text them -- displayed, never requested.
 */
export interface InvitationPage {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly personId: PersonId
  readonly fullName: string
  /** Displayed so a Leader cannot mistype their way out of their own check-ins. */
  readonly phone: string | null
  readonly role: MemberRole
  readonly state: InvitationState
  /**
   * The account this Person already holds, or null. A Leader may lead any number
   * of one-to-ones, so a second invitation reaches somebody who accepted a first
   * one -- and there is exactly one account per Person, not one per relationship.
   */
  readonly userId: string | null
  /**
   * The people on the *other* side of the relationship: the Participants to a
   * Leader, the Leaders to a Participant. This is the reveal, and it is scoped
   * because a Participant's membership grants them no sight of anyone -- the
   * other Participants included -- which is the rule the policies on
   * `relationship_member` state and which this read, on the trusted connection,
   * is not policed by.
   */
  readonly withNames: readonly string[]
  /** How many Participants it holds. Copy branches on this and never on `kind`. */
  readonly participantCount: number
}

export interface InvitationReader {
  /**
   * Resolving does not consume. A Leader who opens the link and is interrupted by
   * a phone call returns to the same message rather than needing a re-issue.
   *
   * Null when nothing answers to the token, which is the same answer for a token
   * that was never real and one whose relationship has been deleted -- neither
   * tells its holder anything about a Ministry they have not proved they belong to.
   */
  readInvitationPage(token: string): Promise<InvitationPage | null>
}

/**
 * One Follow-Up Item, as Care Needed shows it. The oldest of the three sources and
 * the only one that is a stored row an Admin closes by hand.
 */
export interface FollowUpCareItem {
  readonly id: FollowUpItemId
  readonly raisedAt: Date
  readonly relationshipId: RelationshipId | null
  readonly personId: PersonId | null
  /** The Person the item is about, when it is about one. */
  readonly personName: string | null
  /**
   * When the relationship the item is about was created. The underlying fact, kept
   * alongside the derived one: history and any later question about this item are
   * answered from the instant, never from a number somebody rounded.
   */
  readonly relationshipCreatedAt: Date | null
  /**
   * How long it has waited, in whole days, as of the moment this was read. What
   * the Care Needed view shows -- computed here off `relationshipCreatedAt` and
   * the injected clock rather than frozen into the payload, because an item raised
   * on day five is still the same item on day twenty and must not still say five.
   *
   * Null exactly when `relationshipCreatedAt` is: an item about a Person and no
   * relationship has nothing that has been waiting.
   */
  readonly waitedDays: number | null
  /**
   * The kind and what it carries, as one value. Not a `kind` field beside a
   * payload: those are two things that can disagree, and only one of them can be
   * narrowed by the compiler at the point a screen reads the period out.
   */
  readonly payload: FollowUpPayload
}

/**
 * One relationship whose *derived* state asks for attention -- today, a Stalled
 * one. Not a stored row and nothing to close: it clears itself the moment the
 * Leader answers, which is exactly why it could never have been a Follow-Up Item.
 */
export interface RelationshipCareItem {
  readonly relationshipId: RelationshipId
  readonly state: RelationshipState
  /**
   * Which condition fired, with its own unit. *Gone silent, 23 days* and
   * *responding, not meeting, 3 weeks* are different conversations, and an Admin
   * has to know which one they are walking into before they pick up the phone.
   */
  readonly reasons: readonly CareReason[]
  /** Who to call, and who the relationship is for. */
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /** Unresolved Concerns standing beside it. A Stalled relationship may have some. */
  readonly openConcerns: number
}

/** One outstanding Concern, without the words. Opening those is a command. */
export interface OutstandingConcern {
  readonly id: ConcernId
  readonly raisedAt: Date
  readonly raisedBy: PersonId
  readonly raisedByName: string | null
}

/**
 * The Concerns outstanding on one relationship, gathered into a single item so
 * that several show as a count rather than as several rows an Admin has to notice
 * are about the same people.
 *
 * The text is deliberately absent. It is reached one Person at a time through
 * `CommandService.openConcern`, which records the viewing in the same transaction
 * that returns it -- and the authenticated role holds no grant on that column, so
 * no other path to it exists.
 */
export interface ConcernCareItem {
  readonly relationshipId: RelationshipId
  /** Newest first. The count the badge shows is this length. */
  readonly concerns: readonly OutstandingConcern[]
  readonly participantNames: readonly string[]
}

/**
 * One thing for an Admin to look at, from whichever of the three sources raised
 * it. A tagged union rather than three lists, because Care Needed is one surface
 * and the sources are a fact about where an item came from, not about how urgent
 * it is.
 */
export type CareNeededItem =
  | ({ readonly source: 'follow_up' } & FollowUpCareItem)
  | ({ readonly source: 'relationship' } & RelationshipCareItem)
  | ({ readonly source: 'concern' } & ConcernCareItem)

export interface CareNeededReader {
  /**
   * Everything outstanding in one Ministry, from all three sources: open Follow-Up
   * Items, relationships whose derived state asks for attention, and unresolved
   * Concerns.
   *
   * Open items only, and enforced as such in the database rather than here. Each
   * follow-up item carries how long it has waited as of the read, which is why an
   * implementation of this needs a clock -- as does the state derivation, which
   * asks what week it is. A resolved item leaves the view and stays in the table,
   * because how fast a Ministry closes its care items is a question it should be
   * able to ask later.
   */
  listCareNeeded(ministryId: MinistryId): Promise<readonly CareNeededItem[]>
  /**
   * The details behind `Nudge`: the Participant's number, so the Admin can make the
   * call themselves. Null where the Person has not currently agreed to share them.
   *
   * One Person at a time rather than a column on every care item. The list is read
   * to decide who needs a call; a number on every row would disclose the whole
   * Ministry's contact details to answer a question nobody asked of most of them.
   *
   * Named like `OutboundQueue.contactToShare` and deliberately not shared with it.
   * That one runs on the trusted connection the queue is drained on; this one runs
   * as the signed-in Admin, where the consent rule is reachable only through the
   * definer function that checks Ministry membership first. Same rule, two paths to
   * it, because the two callers are not the same principal.
   */
  contactToShare(ministryId: MinistryId, personId: PersonId): Promise<ContactDetails | null>
}
