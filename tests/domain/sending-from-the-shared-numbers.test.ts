import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { ministryId, outboundMessageId, personId } from '~/domain/ids'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport, OutboundQueue, QueuedMessage } from '~/service/ports'
import { noDailyCap } from '../support/daily-cap'

/**
 * The sending layer sends each text from the shared number its (phone, church) pair
 * was given (Exponential launch, ticket 06). Driven through `dispatchQueue` with a
 * queue held in memory, so what is asserted is the order of the decisions: who may
 * receive it, then which number, then the claim and the vendor.
 */
const church = ministryId('00000000-0000-4000-8000-000000000001')

const aMessage = (n: number, toPhone: string): QueuedMessage => ({
  id: outboundMessageId(`00000000-0000-4000-8000-00000000010${n}`),
  personId: personId(`00000000-0000-4000-8000-00000000020${n}`),
  toPhone,
  body: `Riverside Chapel via Discipler: message ${n}`,
  kind: 'no_reply',
  disclosesPersonId: null,
  enqueuedAt: new Date('2026-11-09T14:00:00Z'),
})

const world = (
  messages: readonly QueuedMessage[],
  numbers: Readonly<Record<string, string | null>>,
  refused: ReadonlySet<string> = new Set(),
) => {
  const asked: { phone: string; at: Date }[] = []
  const claimed: string[] = []
  const sentIds: string[] = []
  const delivered: { from: string; to: string; body: string }[] = []

  const queue: OutboundQueue = {
    whileDraining: (_, drain) => drain(),
    due: async () => messages.filter((message) => !sentIds.includes(message.id)),
    timeZoneOf: async () => 'America/New_York',
    sendingNumberFor: async (_, phone, at) => {
      asked.push({ phone, at })
      return numbers[phone] ?? null
    },
    mayReceive: async (_, person) =>
      refused.has(person) ? 'recipient_opted_out' : null,
    contactToShare: async () => null,
    claim: async (_, id) => {
      claimed.push(id)
      return 'claimed'
    },
    release: async () => undefined,
    markSent: async (_, id) => {
      sentIds.push(id)
    },
    withhold: async () => undefined,
  }
  const transport: MessageTransport = {
    async deliver(from, to, body) {
      delivered.push({ from, to, body })
    },
  }
  const clock = createTestClock(new Date('2026-11-09T15:00:00Z'))

  return {
    asked,
    claimed,
    delivered,
    drain: () => dispatchQueue({ queue, transport, clock, ministryId: church, dailyCap: noDailyCap }),
  }
}

describe('Sending from the shared numbers', () => {
  it('sends each text from the number its recipient was given', async () => {
    const it_ = world(
      [aMessage(1, '+15553330001'), aMessage(2, '+15553330002')],
      { '+15553330001': '+13185316138', '+15553330002': '+15674303906' },
    )

    const outcome = await it_.drain()

    expect(it_.delivered.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: '+13185316138', to: '+15553330001' },
      { from: '+15674303906', to: '+15553330002' },
    ])
    expect(outcome).toEqual({ sent: 2, withheld: 0, held: 0, failed: 0, awaitingANumber: 0, waitingOnTheCap: 0 })
  })

  it('asks for the number on the drain’s clock, the moment the pair is first texted', async () => {
    const it_ = world([aMessage(1, '+15553330001')], { '+15553330001': '+13185316138' })

    await it_.drain()

    expect(it_.asked).toEqual([
      { phone: '+15553330001', at: new Date('2026-11-09T15:00:00Z') },
    ])
  })

  it('gives nobody a number for a text they will not be sent', async () => {
    const opted = aMessage(1, '+15553330001')
    const it_ = world([opted], { '+15553330001': '+13185316138' }, new Set([opted.personId!]))

    const outcome = await it_.drain()

    expect(it_.asked).toEqual([])
    expect(outcome.withheld).toBe(1)
  })

  it('leaves a text on the queue, unclaimed, when no shared number is free for its phone', async () => {
    const it_ = world(
      [aMessage(1, '+15553330001'), aMessage(2, '+15553330002')],
      { '+15553330001': null, '+15553330002': '+15674303906' },
    )

    const outcome = await it_.drain()

    // The other text still goes: one phone out of numbers does not hold the church.
    expect(it_.delivered.map(({ to }) => to)).toEqual(['+15553330002'])
    // Not claimed, so it holds no conversation while it waits.
    expect(it_.claimed).toEqual([aMessage(2, '+15553330002').id])
    expect(outcome).toEqual({ sent: 1, withheld: 0, held: 0, failed: 0, awaitingANumber: 1, waitingOnTheCap: 0 })
  })
})
