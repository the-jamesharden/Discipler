import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import {
  nudgeHistoryWindow,
  nudgeRefusedBy,
  PILOT_NUDGE_LIMITS,
  type NudgeLimits,
} from '~/domain/nudge-limits'
import { withSharedContact } from '~/domain/outbound-copy'
import type { MessageTransport, OutboundQueue } from './ports'

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
 *
 * Two kinds of check run here and they refuse for different reasons. Whether this
 * *recipient* may be sent to at all -- consent, opt-out, a number to send to -- is
 * a fact about them. Whether *this message* may go now is a fact about how much
 * this Ministry has already said to them, and it governs nudges alone: the
 * Check-In Rhythm is self-limiting by construction and needs no separate ceiling.
 *
 * The ports it works through are in `ports.ts` with every other port.
 */

export interface Dispatch {
  readonly queue: OutboundQueue
  readonly transport: MessageTransport
  readonly clock: Clock
  readonly ministryId: MinistryId
  /**
   * The nudge ceilings. Defaulted to the pilot values so that no caller has to
   * know them, and injectable so that a Ministry-scoped source can replace the
   * constant later without this rule changing shape.
   */
  readonly nudgeLimits?: NudgeLimits
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
  nudgeLimits = PILOT_NUDGE_LIMITS,
}: Dispatch): Promise<DispatchOutcome> => {
  const messages = await queue.due(ministryId)
  let sent = 0
  let withheld = 0

  // Read at most once per drain, and not at all on a drain with no nudge in it.
  // A Ministry's zone is the same string on every row of a run, so asking the
  // database for it per message would be a round trip to learn what we knew.
  let zone: string | undefined
  const timeZone = async (): Promise<string> =>
    (zone ??= await queue.timeZoneOf(ministryId))

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

    // The nudge ceilings. They run after the recipient checks because a Person who
    // may not be sent to at all is not a budget question, and before delivery
    // because that is the whole of *enforced at the sending layer, not at the
    // button*: an Admin clicking twenty times enqueues twenty rows, and nineteen
    // of them stay on the queue saying which ceiling refused them.
    //
    // Counted per Person, so a nudge to a phone with no Person behind it could be
    // counted against nothing -- which is why the database refuses to enqueue one.
    // The narrowing here is that constraint, restated for the type checker.
    if (message.kind === 'nudge' && message.personId) {
      const alreadySent = await queue.nudgesSentTo(
        ministryId,
        message.personId,
        new Date(now.getTime() - nudgeHistoryWindow(nudgeLimits)),
      )
      const ceiling = nudgeRefusedBy(alreadySent, now, await timeZone(), nudgeLimits)
      if (ceiling) {
        await queue.withhold(ministryId, message.id, ceiling, now)
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
