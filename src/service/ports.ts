import type { IntakeRecord, OutboundMessageDraft } from '~/domain/effects'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { MinistryId, PersonId } from '~/domain/ids'
import type { ParticipationStatus } from '~/domain/participation'
import type { NewRelationship } from '~/domain/relationships'
import type { NewPerson, RosterKey } from '~/domain/roster'

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
export interface UnitOfWork {
  /**
   * Everyone already on this Ministry's Roster, by `rosterKey`, against the
   * identifier behind it. An import asks only whether a key is present; Intake
   * needs the Person, because whoever is filling the form in is usually already on
   * a Roster somebody uploaded.
   */
  peopleOnRoster(): Promise<ReadonlyMap<RosterKey, PersonId>>
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
