import type { NewHistoryEvent } from './history'
import type { MinistryId, PersonId } from './ids'
import type {
  AgeBand,
  AvailabilitySlot,
  ConsentSource,
  DiscipleshipGoalId,
  Gender,
} from './intake'
import type { NewRelationship } from './relationships'
import type { NewPerson } from './roster'

/**
 * Commands return effects; they never perform I/O. The application service is the
 * only thing that turns an effect into a database write or a queued message, which
 * is what makes the whole domain drivable from a test with no infrastructure.
 */

export interface OutboundMessageDraft {
  readonly ministryId: MinistryId
  /** Null when the recipient is not a Person on the Roster -- an Admin, say. */
  readonly personId: PersonId | null
  readonly toPhone: string | null
  readonly body: string
  readonly enqueuedAt: Date
}

/**
 * What one completed Intake produces. The submission and the consents travel
 * together because they are one act: the form is the only thing that grants
 * consent, and a submission recorded without its consents would read as a Person
 * who filled the form in and agreed to nothing.
 */
/**
 * One consent decision as the form captured it. A refusal is a decision and is
 * recorded; it is not the absence of one.
 */
export interface ConsentDecision {
  readonly consent: 'sms' | 'contact_sharing'
  readonly granted: boolean
}

export interface IntakeRecord {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly submittedAt: Date
  readonly ageBand: AgeBand
  readonly gender: Gender
  readonly goalId: DiscipleshipGoalId
  readonly availability: readonly AvailabilitySlot[]
  /**
   * Optional on the form. When it is given it lands on the Person, because an
   * address somebody typed about themselves is better than one copied out of a
   * spreadsheet -- which is the same reason an import refuses to overwrite it.
   */
  readonly email: string | null
  /** The consent version the Person actually saw, recorded with each decision. */
  readonly consentVersion: string
  readonly source: ConsentSource
  /**
   * Every consent the form asked about, with what the Person decided. Both are
   * recorded, including a refusal.
   *
   * A declined consent used to write no row at all, and the send-time check asked
   * whether one existed. That reads a first refusal correctly and a *withdrawal* not
   * at all: absence cannot distinguish "never asked" from "asked and said no", and it
   * leaves an earlier grant standing as the only record. The current decision is the
   * latest record for that Person and kind -- `app.current_consent` in the database.
   */
  readonly consentDecisions: readonly ConsentDecision[]
}

export type Effect =
  | { readonly kind: 'history.append'; readonly event: NewHistoryEvent }
  | { readonly kind: 'person.create'; readonly person: NewPerson }
  | { readonly kind: 'intake.record'; readonly intake: IntakeRecord }
  | { readonly kind: 'message.enqueue'; readonly message: OutboundMessageDraft }
  | { readonly kind: 'relationship.create'; readonly relationship: NewRelationship }

export const appendHistory = (event: NewHistoryEvent): Effect => ({
  kind: 'history.append',
  event,
})

export const recordIntake = (intake: IntakeRecord): Effect => ({
  kind: 'intake.record',
  intake,
})

export const enqueueMessage = (message: OutboundMessageDraft): Effect => ({
  kind: 'message.enqueue',
  message,
})

export const createRelationship = (relationship: NewRelationship): Effect => ({
  kind: 'relationship.create',
  relationship,
})

export const createPerson = (person: NewPerson): Effect => ({
  kind: 'person.create',
  person,
})
