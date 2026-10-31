import { openEnvelope, type Email } from '~/domain/email'
import type { EmailSender, EmailTransport } from './ports'

/**
 * The sender every email leaves Discipler through (Exponential launch, ticket 10).
 * Opening the envelope is the domain's, so the checks live above the vendor: no
 * future transport can be written that forgets to ask where an email may go or
 * whether its fields were escaped.
 */
export const createEmailSender = (transport: EmailTransport): EmailSender => ({
  async send(email: Email) {
    await transport.deliver(openEnvelope(email))
  },
})
