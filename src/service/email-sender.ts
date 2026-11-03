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

/**
 * Why an email did not go, in words that cannot hold what the email held: the error's
 * name and the vendor's status, never its message, which is the vendor's own words
 * about a request that held the email.
 */
export const whyNotSent = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return 'unknown'
  const { name, status, reason } = error as { name?: unknown; status?: unknown; reason?: unknown }
  return [name, status, reason].filter((part) => typeof part === 'string' || typeof part === 'number').join(' ')
}
