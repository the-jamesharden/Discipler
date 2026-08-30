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
}

export const dispatchQueue = async ({
  queue,
  transport,
  clock,
  ministryId,
}: Dispatch): Promise<DispatchOutcome> => {
  const messages = await queue.due(ministryId)
  let sent = 0
  let withheld = 0

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

    await transport.deliver(message.toPhone, body)
    await queue.markSent(ministryId, message.id, now)
    sent++
  }

  return { sent, withheld }
}
