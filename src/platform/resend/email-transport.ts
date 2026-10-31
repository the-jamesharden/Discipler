import { EMAIL_FROM_MAILBOX, EMAIL_FROM_NAME, EmailEnvelope, UnescapedEmailField } from '~/domain/email'
import type { EmailTransport } from '~/service/ports'
import { resendCredentials, type ResendCredentials } from './credentials'

/**
 * The one place Resend exists (Exponential launch, ticket 10). It takes an
 * envelope the domain opened and hands back nothing, so everything above it is
 * written against *an email was handed over*, and swapping the vendor is this file.
 *
 * No SDK, as with Twilio: the whole of the API used here is one JSON POST.
 *
 * **Plain text only.** There is no HTML part, so nothing an email carries can be
 * read as markup, and an email client shows exactly the characters the domain
 * escaped. Where the email goes, its reply-to and its key were all decided when
 * the envelope was opened; this file adds the From address, and on staging sends
 * it to the one staging address instead (see `credentials.ts`).
 *
 * Nothing here logs an email's subject or text: a sign-up code is in one.
 */

/** Where the vendor's own refusals arrive, so a caller can tell them apart. */
export class EmailNotDelivered extends Error {
  constructor(
    readonly status: number,
    /** Resend's own error name, `validation_error` and the like. Null on a transport failure. */
    readonly reason: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'EmailNotDelivered'
  }

  /**
   * Whether sending the same email again could ever succeed. A 4xx is Resend
   * saying the request is wrong -- an unverified domain, a bad address, the same
   * key with a different email -- except a rate limit and a key whose first
   * request is still in flight, which are worth another try. A 5xx and a socket
   * that died are always worth another try.
   */
  get isPermanent(): boolean {
    if (this.status === 429 || this.reason === 'concurrent_idempotent_requests') return false
    return this.status >= 400 && this.status < 500
  }
}

/**
 * Credentials are resolved per send, not when the transport is built, so a
 * deployment with no Resend key -- Preview, a developer's machine -- runs every
 * page and only refuses the send itself.
 */
export const createResendTransport = (
  credentials: () => ResendCredentials = resendCredentials,
): EmailTransport => ({
  async deliver(envelope) {
    if (!EmailEnvelope.isEnvelope(envelope)) {
      throw new UnescapedEmailField('Only an envelope openEnvelope made can be sent.')
    }

    const { apiKey, sendingDomain, stagingRecipient } = credentials()

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': envelope.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_MAILBOX}@${sendingDomain}>`,
        to: stagingRecipient ? [stagingRecipient] : envelope.to,
        reply_to: envelope.replyTo,
        subject: envelope.subject,
        text: envelope.text,
      }),
    })

    if (response.ok) return

    // The vendor's own words where it sent any, read defensively: an error page
    // from something in front of Resend is not JSON, and failing to parse it must
    // not replace the status that is the real information.
    const detail = await response
      .json()
      .then((payload: unknown) => (payload ?? {}) as { name?: unknown; message?: unknown })
      .catch(() => ({}) as { name?: unknown; message?: unknown })

    throw new EmailNotDelivered(
      response.status,
      typeof detail.name === 'string' ? detail.name : null,
      typeof detail.message === 'string'
        ? detail.message
        : `Resend refused the email with ${response.status}`,
    )
  },
})
