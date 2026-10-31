import { describe, expect, it } from 'vitest'
import {
  emailBody,
  EmailEnvelope,
  EmailField,
  emailSubject,
  UnescapedEmailField,
  type Email,
} from '~/domain/email'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport } from '~/service/ports'

/**
 * The one sender every email leaves Discipler through (Exponential launch, ticket
 * 10), driven against a transport that records what it was handed. What is proved
 * is that the vendor is only ever handed an envelope the domain opened, and that a
 * message with a field that was not escaped never reaches it.
 */

const recording = () => {
  const delivered: EmailEnvelope[] = []
  const transport: EmailTransport = {
    async deliver(envelope) {
      delivered.push(envelope)
    },
  }
  return { delivered, sender: createEmailSender(transport) }
}

const check = {
  kind: 'deliverabilityCheck',
  subject: emailSubject`Discipler can send email`,
  body: emailBody`This came from ${EmailField.line('notify.trydiscipler.com')}.`,
  once: 'check-1',
} satisfies Email

describe('sending an email', () => {
  it('hands the vendor the envelope its kind decides', async () => {
    const { delivered, sender } = recording()

    await sender.send(check)

    expect(delivered).toHaveLength(1)
    expect(EmailEnvelope.isEnvelope(delivered[0])).toBe(true)
    expect(delivered[0]).toMatchObject({
      to: ['support@trydiscipler.com'],
      replyTo: 'support@trydiscipler.com',
      subject: 'Discipler can send email',
      text: 'This came from notify.trydiscipler.com.',
      idempotencyKey: 'deliverabilityCheck/check-1',
    })
  })

  it('refuses a message carrying a field it was not given as an escaped value', async () => {
    const { delivered, sender } = recording()
    const smuggled = 'Riverside Chapel' as unknown as EmailField

    // A raw value is refused where the body is composed, before there is a message.
    await expect(async () =>
      sender.send({ ...check, body: emailBody`From ${smuggled}.` }),
    ).rejects.toThrow(UnescapedEmailField)
    // And a body that was never composed is refused by the sender itself.
    await expect(
      sender.send({ ...check, body: 'From Riverside Chapel.' as unknown as Email['body'] }),
    ).rejects.toThrow(UnescapedEmailField)

    expect(delivered).toHaveLength(0)
  })
})
