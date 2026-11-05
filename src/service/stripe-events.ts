import {
  currentSubscription,
  isConfirmedAndLive,
  isStripeEventActedOn,
  type StripeEventRefusal,
  type StripeSubscriptionFacts,
} from '~/domain/billing'
import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import { paidPhasesOf } from '~/domain/offers'
import type {
  BillingRecords,
  StripeBilling,
  StripeEventInbox,
  StripeTrials,
  SupportAlerts,
} from './ports'

/**
 * Processing a Stripe event that has been verified and kept (Exponential launch,
 * ticket 03). This is the only writer of billing state.
 *
 * It runs after the webhook's response, and the scheduled tick sweeps whatever that
 * missed. Two rules make either safe to run twice, or in any order:
 *
 * - An event is taken from the inbox before it is worked on, and recorded once by its
 *   ID, so a replay changes nothing.
 * - The event never says what the state is. It says which customer to look at, and
 *   what gets recorded is what Stripe says about that customer now, read inside the
 *   church's billing lock. A late `customer.subscription.updated` reads the same
 *   canceled Subscription everything else reads.
 *
 * The church comes from the stored customer. The IDs the event's metadata names are
 * only a cross-check, and one that disagrees stops the event and tells support@.
 *
 * Once a Subscription this church opened is seen confirmed, what follows from that is
 * done once (`settleConfirmedTrial`), after and apart from recording it (ticket 04).
 */
export interface StripeEventWork {
  readonly inbox: StripeEventInbox
  readonly records: BillingRecords
  readonly stripe: StripeBilling
  readonly trials: StripeTrials
  readonly alerts: SupportAlerts
  readonly clock: Clock
}

/** How long one attempt holds an event, comfortably past a function's time limit. */
export const STRIPE_EVENT_LEASE_MS = 5 * 60 * 1000

/** The most one sweep takes on, so a backlog cannot eat a tick. */
export const STRIPE_EVENTS_PER_SWEEP = 50

export type StripeEventProcessed = 'recorded' | 'refused' | 'ignored' | 'not-claimed'

/**
 * What a confirmed setup intent sets going, once per Subscription (ticket 04): the card
 * or bank account becomes the Subscription's default, and the bills its offer promised
 * are scheduled. Only now, because a first free month depends on whose card it is, and
 * a Subscription nobody confirms needs none of this.
 *
 * It holds the church's billing lock across Stripe's writes, so a second event about
 * the same confirmation waits and then finds it settled. A failure rolls back the claim
 * on the fingerprint with the rest, and the sweep comes back to it: the writes before
 * it can be done again.
 */
const settleConfirmedTrial = async (
  { records, trials, clock }: StripeEventWork,
  church: MinistryId,
  customerId: string,
  subscription: StripeSubscriptionFacts,
): Promise<void> => {
  if (!isConfirmedAndLive(subscription)) return

  await records.establish(church, async (unit) => {
    const opening = await unit.openingOf(subscription.id)
    if (!opening || opening.settled) return

    const method = await trials.confirmDefaultPaymentMethod(subscription.id, customerId)
    // Confirmed, by Stripe's own word, and yet nothing saved: not something to settle
    // as though it were fine, so it goes back round.
    if (!method) throw new Error('A confirmed Subscription has no payment method to bill')

    // A method with no fingerprint has not used anything up, and cannot be held to it.
    const allowed =
      opening.offer !== 'referral' ||
      !method.fingerprint ||
      (await unit.claimFingerprint(method.fingerprint, 'first_free_month', clock.now()))

    const phases = paidPhasesOf({
      cycle: opening.cycle,
      offer: allowed ? opening.offer : 'none',
      plantYear: false,
    })
    if (phases.length > 0) await trials.schedulePhases(subscription.id, phases)

    await unit.settleOpening(subscription.id, allowed ? 'as_opened' : 'free_month_refused', clock.now())
  })
}

export const processStripeEvent = async (
  work: StripeEventWork,
  eventId: string,
): Promise<StripeEventProcessed> => {
  const { inbox, records, stripe, alerts, clock } = work
  const entry = await inbox.claim(eventId, clock.now(), STRIPE_EVENT_LEASE_MS)
  if (!entry) return 'not-claimed'

  if (!isStripeEventActedOn(entry.type)) {
    await inbox.finish(eventId, { outcome: 'ignored' }, clock.now())
    return 'ignored'
  }

  // Told first and finished after, as the capacity watch does: an email that did not
  // go leaves the event unprocessed and the next sweep says it again, under the same
  // `once` key, so a retry does not double it.
  const refuse = async (
    refusal: StripeEventRefusal,
    church: MinistryId | null,
  ): Promise<'refused'> => {
    console.warn(`Stripe event ${entry.id} (${entry.type}) refused: ${refusal}`)
    await alerts.billingEventRefused({ eventId: entry.id, eventType: entry.type, refusal })
    await inbox.finish(eventId, { outcome: 'refused', refusal, church }, clock.now())
    return 'refused'
  }

  const customerId =
    entry.customerId ?? (entry.chargeId ? await stripe.customerOfCharge(entry.chargeId) : null)
  const church = customerId ? await records.churchOfCustomer(customerId) : null
  if (!customerId || !church) return refuse('customer_unknown', null)

  if (entry.namedChurches.some((named) => named !== church)) {
    return refuse('church_mismatch', church)
  }

  const recorded = await records.establish(church, async (unit) => {
    const subscription = currentSubscription(await stripe.subscriptionsOf(customerId))

    if (subscription?.namedChurch && subscription.namedChurch !== church) return { refused: true } as const

    await unit.record(
      {
        eventId: entry.id,
        eventType: entry.type,
        eventOccurredAt: entry.occurredAt,
        livemode: entry.livemode,
        customerId,
        invoiceId: entry.invoiceId,
        chargeId: entry.chargeId,
        subscription,
      },
      clock.now(),
    )
    return { refused: false, subscription } as const
  })
  if (recorded.refused) return refuse('church_mismatch', church)

  // Committed before this starts, so a church's access is not held back by a Stripe
  // write that fails: the sweep comes back for this, and finds the record already there.
  if (recorded.subscription) {
    await settleConfirmedTrial(work, church, customerId, recorded.subscription)
    // Stripe's billing page sets the customer's default only (ticket 33). Repeating this
    // changes nothing, so a retry is safe.
    if (entry.type === 'customer.updated' && isConfirmedAndLive(recorded.subscription)) {
      await work.trials.followCustomersDefault(customerId, recorded.subscription.id)
    }
  }

  await inbox.finish(eventId, { outcome: 'recorded', church }, clock.now())
  return 'recorded'
}

/**
 * Logs by event ID and the error's name alone: the logs carry event IDs and types
 * only, and a Stripe error's message names customers and objects.
 */
const failed = (eventId: string, error: unknown): void => {
  const name = error instanceof Error ? error.name : 'unknown'
  console.error(`Processing Stripe event ${eventId} failed: ${name}`)
}

/**
 * One event, for after the webhook's response, where nothing is left to tell. A
 * failure leaves it unprocessed, and the tick sweeps it.
 */
export const processStripeEventQuietly = async (
  work: () => StripeEventWork,
  eventId: string,
): Promise<void> => {
  try {
    await processStripeEvent(work(), eventId)
  } catch (error) {
    failed(eventId, error)
  }
}

export interface StripeEventSweep {
  readonly recorded: number
  readonly refused: number
  readonly ignored: number
  readonly failed: number
}

/**
 * Whatever the response missed: a function that died, a Stripe read that failed, an
 * email that did not go. One at a time and each caught, because one event that will
 * not process is no reason to hold back the others.
 */
export const sweepStripeEvents = async (work: StripeEventWork): Promise<StripeEventSweep> => {
  const swept = { recorded: 0, refused: 0, ignored: 0, failed: 0 }
  const waiting = await work.inbox.unprocessed(work.clock.now(), STRIPE_EVENTS_PER_SWEEP)

  for (const eventId of waiting) {
    try {
      const processed = await processStripeEvent(work, eventId)
      if (processed !== 'not-claimed') swept[processed] += 1
    } catch (error) {
      failed(eventId, error)
      swept.failed += 1
    }
  }

  return swept
}
