import type { EventId, MinistryId } from './ids'

/**
 * History is append-only: new facts never overwrite old ones. Current Relationship
 * State, the Care Needed view and the ministry's future reporting are all derived
 * from this one record, so a fact that is not appended here does not exist.
 *
 * `occurredAt` is read from the injected clock when the command is handled.
 * `recordedAt` is assigned by the store when the row lands. They diverge whenever a
 * tick runs against an advanced clock, and keeping them apart is what lets a late
 * reply attach to the question it answers without rewriting an earlier week.
 */
export interface NewHistoryEvent {
  readonly ministryId: MinistryId
  readonly occurredAt: Date
  readonly type: string
  readonly subjectType: string
  readonly subjectId: string | null
  readonly payload: Readonly<Record<string, unknown>>
}

export interface HistoryEvent extends NewHistoryEvent {
  readonly id: EventId
  readonly recordedAt: Date
}
