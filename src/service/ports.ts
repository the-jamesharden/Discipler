import type { AccountRefusal } from '~/domain/accounts'
import type { InvitationSnapshot, PersonContact } from '~/domain/boundary'
import type { IntakeRecord, LeaderAcceptance, OutboundMessageDraft } from '~/domain/effects'
import type { NewFollowUpItem } from '~/domain/follow-up'
import type { InvitationToken, NewInvitation } from '~/domain/invitations'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { DiscipleshipGoalId } from '~/domain/intake'
import type { MinistryId, OutboundMessageId, PersonId } from '~/domain/ids'
import type { ParticipationStatus } from '~/domain/participation'
import type { NewRelationship } from '~/domain/relationships'
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

export interface RosterEntry {
  readonly personId: PersonId
  readonly fullName: string
  /**
   * Derived, never stored, and it answers one question: is this Person being
   * discipled. Leading a relationship does not set it. Computed by one SQL function
   * over Intake, consent and open participant memberships.
   */
  readonly participationStatus: ParticipationStatus
  /** Everyone this Person is currently in a relationship with, whatever their role. */
  readonly withNames: readonly string[]
}

export interface RosterReader {
  /** Scoped to one Ministry, and enforced as such in the database, not here. */
  listRoster(ministryId: MinistryId): Promise<readonly RosterEntry[]>
}

/**
 * The sending layer's ports. They live here with every other port rather than
 * beside `dispatchQueue`, so that the one place naming what the application needs
 * from the outside world stays the one place.
 */

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
  /** Whether this Person may be sent to *right now*, not when they were queued. */
  mayReceive(ministryId: MinistryId, personId: PersonId): Promise<WithholdingReason | null>
  /** The details to disclose, or null where the Person has not agreed to share. */
  contactToShare(ministryId: MinistryId, personId: PersonId): Promise<ContactDetails | null>
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
  deliver(to: string, body: string): Promise<void>
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

export interface IntakeReader {
  /** Null when the link names no Ministry this Discipler holds. */
  readIntakePage(id: string): Promise<IntakePage | null>
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
