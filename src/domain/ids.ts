import type { Branded } from './branded'

/**
 * Identifiers are branded so a PersonId cannot be passed where a MinistryId is
 * expected. The brand exists only at compile time; the runtime value is a uuid.
 */

export type MinistryId = Branded<string, 'MinistryId'>
export type PersonId = Branded<string, 'PersonId'>
export type RelationshipId = Branded<string, 'RelationshipId'>
export type EventId = Branded<string, 'EventId'>
export type OutboundMessageId = Branded<string, 'OutboundMessageId'>
export type FollowUpItemId = Branded<string, 'FollowUpItemId'>
export type ConcernId = Branded<string, 'ConcernId'>
export type MaterialId = Branded<string, 'MaterialId'>
/** Minted by the database rather than the boundary, like `EventId`: the row is
 * the identifier's source, and nothing needs to name a submission before it
 * exists. */
export type IntakeSubmissionId = Branded<string, 'IntakeSubmissionId'>

export const ministryId = (value: string): MinistryId => value as MinistryId
export const personId = (value: string): PersonId => value as PersonId
export const relationshipId = (value: string): RelationshipId => value as RelationshipId
export const eventId = (value: string): EventId => value as EventId
export const outboundMessageId = (value: string): OutboundMessageId =>
  value as OutboundMessageId
export const followUpItemId = (value: string): FollowUpItemId => value as FollowUpItemId
export const concernId = (value: string): ConcernId => value as ConcernId
export const materialId = (value: string): MaterialId => value as MaterialId
export const intakeSubmissionId = (value: string): IntakeSubmissionId =>
  value as IntakeSubmissionId

/**
 * Where new identifiers come from. Injected for the same reason the clock is: a
 * command that mints an id from inside the domain is no longer a pure function of
 * its inputs, and a test cannot say what it produced.
 */
export interface IdSource {
  next(): string
}

/**
 * Deterministic identifiers, in the same spirit as `createTestClock`: a test that
 * cannot say which id a command produced cannot assert much about what it wrote.
 * The shape is a valid uuid so the database accepts it unchanged.
 */
export const createSequentialIds = (): IdSource => {
  let issued = 0
  return {
    next: () => `00000000-0000-4000-8000-${String(++issued).padStart(12, '0')}`,
  }
}
