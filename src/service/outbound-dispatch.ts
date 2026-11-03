import type { Clock } from '~/domain/clock'
import { DailyCapReached, holdIsStanding, waitsForTheMorning } from '~/domain/daily-cap'
import type { MinistryId } from '~/domain/ids'
import { withSharedContact } from '~/domain/outbound-copy'
import { serialisationOf } from '~/domain/outstanding-reply'
import type { DailyCap } from './daily-cap'
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
  readonly dailyCap: DailyCap
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
  /**
   * Messages left on the queue because no shared number was free for the recipient:
   * each church texts a phone from a different number, and this phone already hears
   * from every one of them for some other church. Not a withholding -- nothing about
   * the recipient refuses it -- and not a failure: it goes on the first drain after
   * a number is added, which the capacity watch has asked support@ for.
   */
  readonly awaitingANumber: number
  /**
   * Messages left on the queue for Twilio's daily limit (Exponential launch, ticket
   * 07): held until midnight Pacific, and then until it is morning at this church.
   * Not a failure -- nothing is wrong with any of them -- and not a withholding.
   * Their recipients are checked when they do go, because consent is a fact about
   * then.
   */
  readonly waitingOnTheCap: number
}

/**
 * One drain, alone. Two callers reach this -- the scheduler after its tick, and
 * the webhook after a reply -- and they meet on an ordinary Monday evening: a
 * Leader replying in the same second the hour turns, or two Leaders replying in
 * the same second as each other. The queue lets one of them through at a time,
 * because the per-row lock in `claim` is held for the claim and not for the
 * vendor's round trip, and a second drain listing the queue in that gap sends the
 * same text twice. See ADR 0020.
 */
export const dispatchQueue = (dispatch: Dispatch): Promise<DispatchOutcome> =>
  dispatch.queue.whileDraining(dispatch.ministryId, () => drainOnce(dispatch))

const drainOnce = async ({
  queue,
  transport,
  clock,
  ministryId,
  dailyCap,
}: Dispatch): Promise<DispatchOutcome> => {
  const startedAt = clock.now()
  const hold = await dailyCap.latestHold(startedAt)
  const messages = await queue.due(ministryId, startedAt)

  let sent = 0
  let withheld = 0
  let failed = 0
  let held = 0
  let awaitingANumber = 0
  let waitingOnTheCap = 0

  // Twilio would refuse every one of them, so it is not asked. Whichever text comes
  // next is the one that finds out the limit has reset, on the pass after midnight
  // Pacific, and nothing has to be done to any row for that to happen.
  if (hold && holdIsStanding(hold, startedAt)) {
    return { sent, withheld, failed, held, awaitingANumber, waitingOnTheCap: messages.length }
  }

  const timeZone = hold && messages.length > 0 ? await queue.timeZoneOf(ministryId) : null

  for (const [position, message] of messages.entries()) {
    const now = clock.now()

    // First, so a text the hold kept overnight is left exactly as it was: its
    // recipient is checked in the morning, when it goes.
    if (hold && timeZone && waitsForTheMorning(hold, message.enqueuedAt, now, timeZone)) {
      waitingOnTheCap++
      continue
    }

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

    // The shared number this church texts this phone from, given the first time and
    // kept (Exponential launch, ticket 06). After the recipient checks, so nobody is
    // given a number for a text they were never going to be sent, and before the
    // claim, so a message with no number to go from does not take the conversation.
    const from = await queue.sendingNumberFor(ministryId, message.toPhone, now)
    if (!from) {
      awaitingANumber++
      continue
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
      await transport.deliver(from, message.toPhone, body)
    } catch (error) {
      // The number back, before anything else. A message the vendor never accepted
      // has no reply coming, and one that kept the number would hold its recipient's
      // conversation for two days over a message that does not exist.
      await queue.release(ministryId, message.id)

      // The one refusal that does end the drain: every text behind this one would get
      // the same answer. This row and the rest stay neither sent nor withheld, which
      // is all that keeps a held text from going twice: it was never marked sent
      // because it was never sent, and everything that was is marked below.
      if (error instanceof DailyCapReached) {
        waitingOnTheCap += messages.length - position
        await dailyCap.reached(now)
        break
      }

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

  return { sent, withheld, failed, held, awaitingANumber, waitingOnTheCap }
}
