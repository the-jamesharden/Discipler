import type { OutboundMessageDraft } from '~/domain/effects'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { MinistryId, PersonId } from '~/domain/ids'

/**
 * Everything the application service needs from the outside world. The domain
 * knows none of these; they exist so the command boundary can stay pure.
 */

export interface EffectSink {
  appendHistory(events: readonly NewHistoryEvent[]): Promise<readonly HistoryEvent[]>
  enqueueMessages(messages: readonly OutboundMessageDraft[]): Promise<void>
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
  transact<T>(ministryId: MinistryId, work: (sink: EffectSink) => Promise<T>): Promise<T>
}

export interface RosterEntry {
  readonly personId: PersonId
  readonly fullName: string
}

export interface RosterReader {
  /** Scoped to one Ministry, and enforced as such in the database, not here. */
  listRoster(ministryId: MinistryId): Promise<readonly RosterEntry[]>
}
