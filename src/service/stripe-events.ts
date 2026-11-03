import { currentSubscription, isStripeEventActedOn, type StripeEventRefusal } from '~/domain/billing'
import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import type { BillingRecords, StripeBilling, StripeEventInbox, SupportAlerts } from './ports'

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
 */
export interface StripeEventWork {
  readonly inbox: StripeEventInbox
  readonly records: BillingRecords
  readonly stripe: StripeBilling
  readonly alerts: SupportAlerts
  readonly clock: Clock
}

/** How long one attempt holds an event, comfortably past a function's time limit. */
export const STRIPE_EVENT_LEASE_MS = 5 * 60 * 1000

/** The most one sweep takes on, so a backlog cannot eat a tick. */
export const STRIPE_EVENTS_PER_SWEEP = 50

export type StripeEventProcessed = 'recorded' | 'refused' | 'ignored' | 'not-claimed'

export const processStripeEvent = async (
  { inbox, records, stripe, alerts, clock }: StripeEventWork,
  eventId: string,
): Promise<StripeEventProcessed> => {
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

    if (subscription?.namedChurch && subscription.namedChurch !== church) return false

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
    return true
  })
  if (!recorded) return refuse('church_mismatch', church)

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
