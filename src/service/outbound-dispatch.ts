import type { Clock } from '~/domain/clock'
import type { MinistryId, PersonId } from '~/domain/ids'
import { withSharedContact } from '~/domain/outbound-copy'
import type { PhoneNumber } from '~/domain/roster'

/**
 * The sending layer. **Every message passes a recipient-level check before it
 * sends, and the check lives here rather than at the button** -- an Admin clicking
 * Nudge twenty times causes at most one message, and no future write path can
 * enqueue its way around a rule by forgetting to ask.
 *
 * The database refuses to enqueue anything for a Person with no SMS consent or an
 * open opt-out. That is a floor, not this: consent is a fact about *now*, and a
 * Person who opted out between being queued and being sent to must not receive the
 * message that was already waiting for them.
 */

/** Why the sending layer refused a message. Codes, never prose. */
export type WithholdingReason =
  | 'recipient_opted_out'
  | 'recipient_has_no_sms_consent'
  | 'recipient_has_no_phone'

export interface QueuedMessage {
  readonly id: string
  readonly personId: PersonId | null
  readonly toPhone: string | null
  readonly body: string
  /**
   * Whose contact details this message would include. Resolved here, at send time,
   * because contact-sharing consent is checked when a message is sent and never
   * assumed from enrolment -- and a body that already carried the number would
   * leave nothing to withhold.
   */
  readonly disclosesPersonId: PersonId | null
}

export interface ContactDetails {
  readonly fullName: string
  readonly phone: PhoneNumber
}

export interface OutboundQueue {
  /** Everything enqueued for this Ministry and neither sent nor withheld. */
  due(ministryId: MinistryId): Promise<readonly QueuedMessage[]>
  /** Whether this Person may be sent to *right now*, not when they were queued. */
  mayReceive(personId: PersonId): Promise<WithholdingReason | null>
  /** The details to disclose, or null where the Person has not agreed to share. */
  contactToShare(personId: PersonId): Promise<ContactDetails | null>
  markSent(id: string, at: Date): Promise<void>
  withhold(id: string, reason: WithholdingReason, at: Date): Promise<void>
}

/** Twilio lives behind this and nowhere else. It is not a domain concept. */
export interface MessageTransport {
  deliver(to: string, body: string): Promise<void>
}

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
      await queue.withhold(message.id, 'recipient_has_no_phone', now)
      withheld++
      continue
    }

    // A message to somebody who is not on the Roster -- an Admin -- is not governed
    // by a congregant's consent record, so there is no recipient to check.
    if (message.personId) {
      const refusal = await queue.mayReceive(message.personId)
      if (refusal) {
        await queue.withhold(message.id, refusal, now)
        withheld++
        continue
      }
    }

    // Absent consent removes the number and sends the rest. The message still
    // reaches the Person; what it does not do is hand out somebody's phone number
    // that they did not agree to share.
    let body = message.body
    if (message.disclosesPersonId) {
      const contact = await queue.contactToShare(message.disclosesPersonId)
      if (contact) body = withSharedContact(body, contact)
    }

    await transport.deliver(message.toPhone, body)
    await queue.markSent(message.id, now)
    sent++
  }

  return { sent, withheld }
}
