import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import { withSharedContact } from '~/domain/outbound-copy'
import { serialisationOf } from '~/domain/outstanding-reply'
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
   * Messages left on the queue because the recipient's number is holding a
   * conversation. **A phone holds one thread at a time**, so a second question is
   * not sent alongside the first; it waits for the answer, the supersession or the
   * timeout that closes the one already out, and the next drain sends it.
   *
   * Its own count, and not folded into `withheld`. A withholding is Discipler
   * keeping a promise to a Person and is permanent; a hold is a queue waiting its
   * turn, and reporting the two together would make an ordinary Monday evening read
   * as a congregation that had all opted out.
   *
   * A message waits at most forty-eight hours behind any *one* conversation --
   * the same span the question it is waiting on can stand for, because a hold that
   * outlived what it waits for would never end. Several queued on one number wait
   * behind each other, so a third can exceed that; the new week that times out
   * every open question is what ends the queue in practice.
   */
  readonly held: number
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
  let held = 0

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

    // Last of the checks and immediately before the vendor, because the claim is
    // what takes the recipient's number -- and a message that is about to be
    // withheld must not take it. **Asking and taking happen in one transaction in
    // the database**, because *is this number free* is the one question two
    // concurrent workers must not both answer yes to, and a check made anywhere
    // else is a check both of them pass.
    //
    // A held message is left neither sent nor withheld, exactly as a refused one
    // is, so the next drain reconsiders it with no bookkeeping of its own.
    const claim = await queue.claim(
      ministryId,
      message.id,
      serialisationOf(message.kind),
      // The moment the conversation opens, and what its timeout is measured from.
      // The same reading of the clock the send is stamped with, so the two cannot
      // drift by however long the vendor takes to answer.
      now,
    )

    if (claim === 'held') {
      held++
      continue
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
      // The number back, before anything else. A message the vendor never accepted
      // has no reply coming, and one that kept the number would hold its recipient's
      // conversation for two days over a message that does not exist.
      await queue.release(ministryId, message.id)
      console.error(
        `Could not deliver message ${message.id} in ministry ${ministryId}`,
        error,
      )
      continue
    }

    await queue.markSent(ministryId, message.id, now)
    sent++
  }

  return { sent, withheld, failed, held }
}
