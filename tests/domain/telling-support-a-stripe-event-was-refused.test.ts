import { describe, expect, it } from 'vitest'
import { EmailEnvelope } from '~/domain/email'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'

/** What support@ reads when the webhook refuses an event (Exponential launch, ticket 03). */
describe('telling support@ a Stripe event was refused', () => {
  const recording = () => {
    const delivered: EmailEnvelope[] = []
    const transport: EmailTransport = {
      async deliver(envelope) {
        delivered.push(envelope)
      },
    }
    return { delivered, alerts: createEmailSupportAlerts(createEmailSender(transport)) }
  }

  it('names the event and why, once per event', async () => {
    const { delivered, alerts } = recording()

    await alerts.billingEventRefused({
      eventId: 'evt_1',
      eventType: 'invoice.paid',
      refusal: 'church_mismatch',
    })

    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      to: ['support@trydiscipler.com'],
      subject: 'A Stripe event was refused',
      idempotencyKey: 'billingEventRefused/billing-event-refused:evt_1',
    })
    expect(delivered[0]!.text).toContain('evt_1')
    expect(delivered[0]!.text).toContain('a different church')
  })

  it('says when a customer belongs to no church', async () => {
    const { delivered, alerts } = recording()

    await alerts.billingEventRefused({
      eventId: 'evt_2',
      eventType: 'charge.refunded',
      refusal: 'customer_unknown',
    })

    expect(delivered[0]!.text).toContain('belongs to no church')
  })
})

/** What support@ reads when the texting gate could not get an answer (Exponential launch, ticket 05). */
describe('telling support@ the texting gate could not read', () => {
  it('says texts went on, once a day', async () => {
    const delivered: EmailEnvelope[] = []
    const alerts = createEmailSupportAlerts(
      createEmailSender({
        async deliver(envelope) {
          delivered.push(envelope)
        },
      }),
    )

    await alerts.textingGateUnread({ day: '2031-03-03' })

    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      to: ['support@trydiscipler.com'],
      idempotencyKey: 'textingGateUnread/texting-gate-unread:2031-03-03',
    })
    expect(delivered[0]!.text).toContain('Discipler keeps texting')
  })
})
