import type { OutboundMessageDraft } from '~/domain/effects'
import { eventId, type MinistryId } from '~/domain/ids'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { NewRelationship } from '~/domain/relationships'
import type { EffectSink, EffectStore } from '~/service/ports'

export interface InMemoryStore extends EffectStore {
  readonly history: readonly HistoryEvent[]
  readonly outbox: readonly OutboundMessageDraft[]
  readonly relationships: readonly NewRelationship[]
  failOn?: 'appendHistory' | 'enqueueMessages' | 'createRelationship'
}

/**
 * A store that keeps the same append-only promise the database makes, so a test
 * that would corrupt history here fails here rather than in production.
 */
export const createInMemoryStore = (recordedAt = new Date('2026-01-01T00:00:00Z')): InMemoryStore => {
  const history: HistoryEvent[] = []
  const outbox: OutboundMessageDraft[] = []
  const relationships: NewRelationship[] = []
  let counter = 0

  const store: InMemoryStore = {
    get history() {
      return [...history]
    },
    get outbox() {
      return [...outbox]
    },
    get relationships() {
      return [...relationships]
    },
    async transact(_ministryId: MinistryId, work) {
      const stagedHistory: HistoryEvent[] = []
      const stagedOutbox: OutboundMessageDraft[] = []
      const stagedRelationships: NewRelationship[] = []

      const sink: EffectSink = {
        async appendHistory(events: readonly NewHistoryEvent[]) {
          if (store.failOn === 'appendHistory') throw new Error('history store unavailable')
          const written = events.map((event) => ({
            ...event,
            id: eventId(`event-${++counter}`),
            recordedAt,
          }))
          stagedHistory.push(...written)
          return written
        },
        async createRelationship(relationship) {
          if (store.failOn === 'createRelationship') throw new Error('relationships unavailable')
          stagedRelationships.push(relationship)
        },
        async enqueueMessages(messages) {
          if (store.failOn === 'enqueueMessages') throw new Error('outbound queue unavailable')
          stagedOutbox.push(...messages)
        },
      }

      const result = await work(sink)

      relationships.push(...stagedRelationships)
      history.push(...stagedHistory)
      outbox.push(...stagedOutbox)
      return result
    },
  }

  return store
}
