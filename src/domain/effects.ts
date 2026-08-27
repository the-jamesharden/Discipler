import type { NewHistoryEvent } from './history'
import type { MinistryId, PersonId } from './ids'
import type { NewRelationship } from './relationships'

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

export type Effect =
  | { readonly kind: 'history.append'; readonly event: NewHistoryEvent }
  | { readonly kind: 'message.enqueue'; readonly message: OutboundMessageDraft }
  | { readonly kind: 'relationship.create'; readonly relationship: NewRelationship }

export const appendHistory = (event: NewHistoryEvent): Effect => ({
  kind: 'history.append',
  event,
})

export const enqueueMessage = (message: OutboundMessageDraft): Effect => ({
  kind: 'message.enqueue',
  message,
})

export const createRelationship = (relationship: NewRelationship): Effect => ({
  kind: 'relationship.create',
  relationship,
})
