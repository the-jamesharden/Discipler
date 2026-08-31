import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import { withSharedContact } from '~/domain/outbound-copy'
import type { MessageTransport, OutboundQueue } from './ports'

/**
 * The sending layer. **Every message passes a recipient-level check before it
 * sends, and the check lives here rather than at the button** -- so no future write
 * path can enqueue its way around a rule by forgetting to ask.
 *
 * The database refuses to enqueue anything for a Person with no SMS consent or an
 * open opt-out. That is a floor, not this: consent is a fact about *now*, and a
 * Person who opted out between being queued and being sent to must not receive the
 * message that was already waiting for them.
 *
 * The ports it works through are in `ports.ts` with every other port.
 */

export interface Dispatch {
  readonly queue: OutboundQueue
  readonly transport: MessageTransport
  readonly clock: Clock
  readonly ministryId: MinistryId
}

export interface DispatchOutcome {
  readonly sent: number
  readonly withheld: number
  /**
   * Messages the vendor refused. Distinct from `withheld`, and the distinction is
   * the point: a withheld message is Discipler keeping a promise to a Person, and a
   * failed one is Twilio having a bad day. Reporting them as one number would let a
   * broken account read as a congregation that had all opted out.
   *
   * A failed row stays neither sent nor withheld, so the next drain tries it again.
   */
  readonly failed: number
}

/** Raised when a Ministry has no number to send as. Not a per-message outcome. */
export class NoSendingNumber extends Error {
  constructor(readonly ministryId: MinistryId) {
    super(`Ministry ${ministryId} has no sending number, so nothing can be sent as it`)
    this.name = 'NoSendingNumber'
  }
}

export const dispatchQueue = async ({
  queue,
  transport,
  clock,
  ministryId,
}: Dispatch): Promise<DispatchOutcome> => {
  const messages = await queue.due(ministryId)

  // Before the first send and once for the drain. A Ministry with no number cannot
  // send as itself, and sending as somebody else is the one outcome worse than not
  // sending: it puts one congregation's number on another's messages. Raised rather
  // than withheld -- a withholding is a fact about a recipient, and every recipient
  // here is fine.
  const from = messages.length > 0 ? await queue.sendingNumber(ministryId) : null
  if (messages.length > 0 && !from) throw new NoSendingNumber(ministryId)

  let sent = 0
  let withheld = 0
  let failed = 0

  for (const message of messages) {
    const now = clock.now()

    if (!message.toPhone) {
      await queue.withhold(ministryId, message.id, 'recipient_has_no_phone', now)
      withheld++
      continue
    }

    // A message to somebody who is not on the Roster -- an Admin -- is not governed
    // by a congregant's consent record, so there is no recipient to check.
    if (message.personId) {
      const refusal = await queue.mayReceive(ministryId, message.personId)
      if (refusal) {
        await queue.withhold(ministryId, message.id, refusal, now)
        withheld++
        continue
      }
    }

    // Absent consent removes the number and sends the rest. The message still
    // reaches the Person; what it does not do is hand out somebody's phone number
    // that they did not agree to share.
    let body = message.body
    if (message.disclosesPersonId) {
      const contact = await queue.contactToShare(ministryId, message.disclosesPersonId)
      if (contact) body = withSharedContact(body, contact)
    }

    // One refusal does not end the drain. The alternative -- letting it throw --
    // means a single unroutable number holds up every message behind it in the
    // queue, including the ones to people who are reachable, and the Leader whose
    // number was mistyped costs their whole Ministry its week.
    //
    // The row is left neither sent nor withheld, so the next pass tries it again.
    // A permanently-refused message therefore retries forever, which is a known
    // cost and not the intended end state: parking one needs a column to record
    // that it was parked and why, and `withheld_reason` is recipient-level by
    // design. `MessageNotDelivered.isPermanent` is what that decision gets made
    // against.
    try {
      await transport.deliver(from as string, message.toPhone, body)
    } catch (error) {
      failed++
      console.error(
        `Could not deliver message ${message.id} in ministry ${ministryId}`,
        error,
      )
      continue
    }

    await queue.markSent(ministryId, message.id, now)
    sent++
  }

  return { sent, withheld, failed }
}
