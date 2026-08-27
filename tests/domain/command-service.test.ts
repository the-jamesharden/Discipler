import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { appendHistory, enqueueMessage } from '~/domain/effects'
import { ministryId, personId, createSequentialIds } from '~/domain/ids'
import { applyEffects, createCommandService } from '~/service/command-service'
import { createInMemoryStore } from '../support/in-memory-store'

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const at = new Date('2026-03-02T09:00:00Z')

const someEvent = (type: string) =>
  appendHistory({
    ministryId: ministry,
    occurredAt: at,
    type,
    subjectType: 'ministry',
    subjectId: ministry,
    payload: {},
  })

const someMessage = (body: string) =>
  enqueueMessage({
    ministryId: ministry,
    personId: personId('22222222-2222-2222-2222-222222222222'),
    toPhone: '+15550100',
    body,
    enqueuedAt: at,
  })

describe('applying a command\'s effects', () => {
  it('records what happened before anything is sent', async () => {
    const store = createInMemoryStore()
    const order: string[] = []

    await store.transact(ministry, (sink) =>
      applyEffects([someMessage('hello'), someEvent('person.imported')], {
        appendHistory: async (events) => {
          order.push('history')
          return sink.appendHistory(events)
        },
        enqueueMessages: async (messages) => {
          order.push('outbound')
          return sink.enqueueMessages(messages)
        },
        createRelationship: sink.createRelationship,
        createPeople: sink.createPeople,
        peopleOnRoster: sink.peopleOnRoster,
      }),
    )

    expect(order).toEqual(['history', 'outbound'])
  })

  it('touches neither store when there is nothing to apply', async () => {
    const store = createInMemoryStore()

    await store.transact(ministry, (sink) =>
      applyEffects([], {
        appendHistory: async () => {
          throw new Error('history should not have been touched')
        },
        enqueueMessages: async () => {
          throw new Error('the outbound queue should not have been touched')
        },
        createRelationship: async () => {
          throw new Error('relationships should not have been touched')
        },
        createPeople: async () => {
          throw new Error('the Roster should not have been touched')
        },
        peopleOnRoster: async () => {
          throw new Error('the Roster should not have been read')
        },
      }).then(() => sink),
    )

    expect(store.history).toEqual([])
    expect(store.outbox).toEqual([])
  })

  it('lands a command\'s effects together or not at all', async () => {
    const store = createInMemoryStore()
    store.failOn = 'enqueueMessages'

    await expect(
      store.transact(ministry, (sink) =>
        applyEffects([someEvent('leader.accepted'), someMessage('starter')], sink),
      ),
    ).rejects.toThrow(/outbound queue unavailable/)

    // History must not claim something that never reached anyone.
    expect(store.history).toEqual([])
    expect(store.outbox).toEqual([])
  })
})

describe('the command service', () => {
  it('is the only way in, and applies whatever the boundary returned', async () => {
    const store = createInMemoryStore()
    const service = createCommandService({ clock: createTestClock(at), ids: createSequentialIds(), store })

    const outcome = await service.execute({ type: 'scheduled.tick', ministryId: ministry })

    expect(outcome.effects).toEqual([])
    expect(store.history).toEqual([])
    expect(store.outbox).toEqual([])
  })
})
