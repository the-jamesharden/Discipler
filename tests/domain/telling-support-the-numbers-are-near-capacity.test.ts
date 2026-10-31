import { describe, expect, it } from 'vitest'
import type { EmailEnvelope } from '~/domain/email'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport, SharedNumbersNearCapacity } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'

/**
 * The capacity watch's alert, as the email support@ receives (Exponential launch,
 * tickets 06 and 10): counts and a day, never one of the numbers.
 */

const recording = () => {
  const delivered: EmailEnvelope[] = []
  const transport: EmailTransport = {
    async deliver(envelope) {
      delivered.push(envelope)
    },
  }
  return { delivered, alerts: createEmailSupportAlerts(createEmailSender(transport)) }
}

const nearCapacity: SharedNumbersNearCapacity = {
  concern: 'recipients',
  load: { numbers: 8, recipients: 1290, mostChurchesOnOnePhone: 2 },
  day: '2026-11-09',
}

describe('telling support@ the shared numbers are near capacity', () => {
  it('emails support@ with the counts and what to do', async () => {
    const { delivered, alerts } = recording()

    await alerts.sharedNumbersNearCapacity(nearCapacity)

    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      to: ['support@trydiscipler.com'],
      subject: 'The shared numbers are near capacity',
    })
    expect(delivered[0]?.text).toContain('8 numbers carry 1290 (phone, church) pairs')
    expect(delivered[0]?.text).toContain('one phone is in 2 churches')
    expect(delivered[0]?.text).toContain('npm run shared-number')
  })

  it('names which concern it is', async () => {
    const { delivered, alerts } = recording()

    await alerts.sharedNumbersNearCapacity({ ...nearCapacity, concern: 'one_phone' })

    expect(delivered[0]?.text).toContain(
      'The person in the most churches has one shared number left.',
    )
  })

  it('keys the email on the concern, the size of the set and the day, so a retry that day is dropped', async () => {
    const { delivered, alerts } = recording()

    await alerts.sharedNumbersNearCapacity(nearCapacity)

    expect(delivered[0]?.idempotencyKey).toBe(
      'numbersNearCapacity/numbers-near-capacity:recipients:8:2026-11-09',
    )
  })
})
