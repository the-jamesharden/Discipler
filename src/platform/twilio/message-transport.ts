import type { MessageTransport } from '~/service/ports'
import { twilioCredentials, type TwilioCredentials } from './credentials'

/**
 * The one place Twilio exists. It takes a number, a number and a string, and it
 * hands back nothing -- so everything above it is written against *a message was
 * delivered*, and swapping the vendor is this file.
 *
 * No SDK. The whole of the API used here is one form-encoded POST, and a
 * dependency that wraps it would be a second thing to keep current for no
 * behaviour this file does not already have.
 *
 * **Nothing about consent, opt-outs or contact sharing happens here.** Those are
 * checked in `dispatchQueue` and again by the database, deliberately above the
 * vendor, so no future transport can be written that forgets to ask.
 */

/** Where the vendor's own refusals arrive, so a caller can tell them apart. */
export class MessageNotDelivered extends Error {
  constructor(
    readonly status: number,
    /** Twilio's own numeric code where it sent one. Null on a transport failure. */
    readonly code: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'MessageNotDelivered'
  }

  /**
   * Whether sending the same message again could ever succeed. A 4xx is Twilio
   * saying the request is wrong -- an unroutable number, an unregistered sender --
   * and re-sending it produces the same answer tomorrow. Everything else, a 5xx and
   * a socket that died included, is worth another pass.
   *
   * Nothing acts on this yet: `dispatchQueue` leaves a refused row for the next
   * drain either way, because parking one permanently needs somewhere to record
   * that it was parked and why, and `withheld_reason` is recipient-level by design.
   * It is here so the decision has something to be made against rather than a
   * status code to be re-derived.
   */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

/**
 * Credentials are resolved per send, not when the transport is built. A Ministry
 * with an empty queue needs no delivery account, and a composition root that read
 * them eagerly would stop a deployment that has not started sending yet from
 * running its scheduler at all -- turning *nothing to do* into *misconfigured*.
 */
export const createTwilioTransport = (
  credentials: () => TwilioCredentials = twilioCredentials,
): MessageTransport => ({
  async deliver(from, to, body) {
    const { accountSid, authToken } = credentials()

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: body }),
      },
    )

    if (response.ok) return

    // The vendor's own words where it sent any, because "sending failed" with the
    // reason thrown away is the message that costs somebody an afternoon. The body
    // is read defensively: an error page from something in front of Twilio is not
    // JSON, and failing to parse it must not replace the status that is the real
    // information.
    const detail = await response
      .json()
      .then((payload: unknown) => (payload ?? {}) as { message?: unknown; code?: unknown })
      .catch(() => ({}) as { message?: unknown; code?: unknown })

    throw new MessageNotDelivered(
      response.status,
      typeof detail.code === 'number' ? detail.code : null,
      typeof detail.message === 'string'
        ? detail.message
        : `Twilio refused the message with ${response.status}`,
    )
  },
})
