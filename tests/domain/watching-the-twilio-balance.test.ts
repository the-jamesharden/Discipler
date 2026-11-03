import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { EmailEnvelope } from '~/domain/email'
import { dollars, dollarsToCents, twilioBalanceIsLow } from '~/domain/twilio-balance'
import { createEmailSender } from '~/service/email-sender'
import type {
  EmailTransport,
  TwilioBalanceFall,
  TwilioBalanceFalls,
  TwilioBalanceReader,
} from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'
import { watchTwilioBalance } from '~/service/twilio-balance-watch'

/**
 * support@ hears about a failing Twilio balance before it stops every church's
 * texts and codes (Exponential launch, ticket 08). Driven through the real sender
 * with a recording transport at the vendor's port, so what is checked is the email
 * that would have left.
 */
const world = (startCents: number) => {
  let cents: number | Error = startCents
  let sending: Error | null = null
  let recording: Error | null = null

  const delivered: EmailEnvelope[] = []
  const transport: EmailTransport = {
    async deliver(envelope) {
      if (sending) throw sending
      delivered.push(envelope)
    },
  }

  const history: (TwilioBalanceFall & { recoveredAt: Date | null; recoveredCents: number | null })[] =
    []
  const openOne = () => history.find((fall) => fall.recoveredAt === null) ?? null
  const falls: TwilioBalanceFalls = {
    open: async () => openOne(),
    async recordFall(at, balanceCents) {
      const open = openOne()
      if (open) return open
      const fall = {
        id: `00000000-0000-4000-8000-${String(history.length + 1).padStart(12, '0')}`,
        fellAt: at,
        balanceCents,
        toldAt: null,
        recoveredAt: null,
        recoveredCents: null,
      }
      history.push(fall)
      return fall
    },
    async recordTold(id, at) {
      if (recording) throw recording
      const told = history.findIndex((fall) => fall.id === id)
      history[told] = { ...history[told]!, toldAt: at }
    },
    async recordRecovery(at, balanceCents) {
      const open = openOne()
      if (!open) return false
      history[history.indexOf(open)] = { ...open, recoveredAt: at, recoveredCents: balanceCents }
      return true
    },
  }

  const balance: TwilioBalanceReader = {
    async readCents() {
      if (cents instanceof Error) throw cents
      return cents
    },
  }

  const clock = createTestClock(new Date('2026-11-09T15:00:00Z'))

  return {
    delivered,
    history,
    clock,
    balanceIs: (next: number | Error) => {
      cents = next
    },
    senderFails: (error: Error | null) => {
      sending = error
    },
    recordFails: (error: Error | null) => {
      recording = error
    },
    tick: () =>
      watchTwilioBalance({
        balance,
        falls,
        alerts: createEmailSupportAlerts(createEmailSender(transport)),
        clock,
      }),
  }
}

describe('watching the Twilio balance', () => {
  it('sends one email at $70 and no more on the next ticks', async () => {
    const it_ = world(7000)

    expect(await it_.tick()).toBe('told')
    expect(await it_.tick()).toBe('still_low')
    expect(await it_.tick()).toBe('still_low')

    expect(it_.delivered).toHaveLength(1)
    expect(it_.delivered[0]).toMatchObject({
      kind: 'twilioBalanceLow',
      to: ['support@trydiscipler.com'],
      subject: 'The Twilio balance is below $75.00',
    })
    expect(it_.delivered[0]?.text).toContain('$70.00')
    expect(it_.delivered[0]?.text).toContain('2026-11-09 15:00 UTC')
  })

  it('tells support@ nothing while the balance is at or above $75', async () => {
    const it_ = world(7500)

    expect(await it_.tick()).toBe('fine')
    it_.balanceIs(50000)
    expect(await it_.tick()).toBe('fine')

    expect(it_.delivered).toEqual([])
    expect(it_.history).toEqual([])
  })

  it('tells support@ again only after the balance has recovered and fallen again', async () => {
    const it_ = world(7000)
    await it_.tick()

    it_.balanceIs(7400)
    expect(await it_.tick()).toBe('still_low')
    expect(it_.delivered).toHaveLength(1)

    it_.balanceIs(50000)
    expect(await it_.tick()).toBe('recovered')
    expect(await it_.tick()).toBe('fine')
    expect(it_.delivered).toHaveLength(1)

    it_.balanceIs(6000)
    expect(await it_.tick()).toBe('told')
    expect(await it_.tick()).toBe('still_low')

    expect(it_.delivered).toHaveLength(2)
    expect(it_.delivered[1]?.text).toContain('$60.00')
  })

  it('gives two falls on one day different keys, so Resend does not drop the second', async () => {
    const it_ = world(7000)
    await it_.tick()
    it_.balanceIs(50000)
    await it_.tick()
    it_.balanceIs(7000)
    await it_.tick()

    const [first, second] = it_.delivered
    expect(first?.idempotencyKey).not.toBe(second?.idempotencyKey)
    expect(first?.text).toBe(second?.text)
  })

  it('changes nothing and sends nothing when a read fails, and the next tick reads again', async () => {
    const it_ = world(50000)
    it_.balanceIs(new Error('Twilio is down'))

    await expect(it_.tick()).rejects.toThrow('Twilio is down')
    expect(it_.delivered).toEqual([])
    expect(it_.history).toEqual([])

    it_.balanceIs(7000)
    expect(await it_.tick()).toBe('told')
  })

  it('neither re-arms nor closes a fall on a failed read', async () => {
    const it_ = world(7000)
    await it_.tick()

    it_.balanceIs(new Error('Twilio is down'))
    await expect(it_.tick()).rejects.toThrow('Twilio is down')

    it_.balanceIs(7000)
    expect(await it_.tick()).toBe('still_low')
    expect(it_.delivered).toHaveLength(1)
    expect(it_.history).toHaveLength(1)
  })

  it('sends an email that did not go on the next tick, word for word under the same key', async () => {
    const it_ = world(7000)
    it_.senderFails(new Error('Resend is down'))
    await expect(it_.tick()).rejects.toThrow('Resend is down')
    expect(it_.delivered).toEqual([])

    it_.senderFails(null)
    it_.balanceIs(6500)
    it_.clock.advanceBy(60 * 60 * 1000)
    expect(await it_.tick()).toBe('told')

    expect(it_.delivered).toHaveLength(1)
    // What the fall was recorded with, so a retry is the same message.
    expect(it_.delivered[0]?.text).toContain('$70.00')
    expect(it_.delivered[0]?.text).toContain('2026-11-09 15:00 UTC')
  })

  it('repeats the same key and words when only the record of telling failed', async () => {
    const it_ = world(7000)
    it_.recordFails(new Error('The database is down'))
    await expect(it_.tick()).rejects.toThrow('The database is down')

    it_.recordFails(null)
    it_.balanceIs(6500)
    expect(await it_.tick()).toBe('told')

    // Resend drops the second on this key, and refuses it if a word differed.
    const [first, second] = it_.delivered
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey)
    expect(second?.text).toBe(first?.text)
  })

  it('tells nobody about a fall that recovered before it could be told', async () => {
    const it_ = world(7000)
    it_.senderFails(new Error('Resend is down'))
    await expect(it_.tick()).rejects.toThrow('Resend is down')

    it_.senderFails(null)
    it_.balanceIs(50000)
    expect(await it_.tick()).toBe('recovered')
    expect(it_.delivered).toEqual([])
  })

  it('keeps every fall as history, with what it fell to and what it recovered to', async () => {
    const it_ = world(7000)
    await it_.tick()
    it_.balanceIs(50000)
    await it_.tick()

    expect(it_.history).toHaveLength(1)
    expect(it_.history[0]).toMatchObject({ balanceCents: 7000, recoveredCents: 50000 })
    expect(it_.history[0]?.toldAt).not.toBeNull()
    expect(it_.history[0]?.recoveredAt).not.toBeNull()
  })
})

describe('the balance as money', () => {
  it('is low below $75 and not at it', () => {
    expect(twilioBalanceIsLow(7499)).toBe(true)
    expect(twilioBalanceIsLow(7500)).toBe(false)
    expect(twilioBalanceIsLow(-150)).toBe(true)
  })

  it('reads the decimals Twilio writes, cutting anything past the cent', () => {
    expect(dollarsToCents('70.00')).toBe(7000)
    expect(dollarsToCents('74.99')).toBe(7499)
    expect(dollarsToCents('74.999')).toBe(7499)
    expect(dollarsToCents('75')).toBe(7500)
    expect(dollarsToCents('0.5')).toBe(50)
    expect(dollarsToCents('-1.50')).toBe(-150)
  })

  it('reads nothing that is not a plain decimal as money', () => {
    for (const unreadable of ['', ' ', 'NaN', 'Infinity', '1e3', '$70', '70,00', '.5', '7.0.0']) {
      expect(dollarsToCents(unreadable)).toBeNull()
    }
  })

  it('writes dollars and cents', () => {
    expect(dollars(7000)).toBe('$70.00')
    expect(dollars(5)).toBe('$0.05')
    expect(dollars(-150)).toBe('-$1.50')
    expect(dollars(25310)).toBe('$253.10')
  })
})
