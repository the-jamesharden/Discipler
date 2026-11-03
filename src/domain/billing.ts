/**
 * What Discipler knows about a church's billing, and how a Stripe event is read
 * (Exponential launch, ticket 03).
 *
 * The Stripe webhook is the only writer of billing state, and nothing here trusts an
 * event for the state itself: events arrive late, twice and out of order, so an event
 * only says *which* customer to go and look at. What gets recorded is the Subscription
 * as Stripe says it is at that moment.
 *
 * Stripe is named here because its IDs and statuses are the facts being kept, the way
 * a phone number is kept, and not because this module knows the SDK. The SDK is behind
 * `StripeBilling` in `src/service/ports.ts`.
 */

/** The events the endpoint is subscribed to, and the only ones Discipler acts on. */
export const STRIPE_EVENTS_ACTED_ON = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  // What opens a church's access: its trial's card or bank account was saved (ticket 04).
  'setup_intent.succeeded',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'charge.refunded',
  'charge.dispute.created',
] as const

const ACTED_ON: ReadonlySet<string> = new Set(STRIPE_EVENTS_ACTED_ON)

export const isStripeEventActedOn = (type: string): boolean => ACTED_ON.has(type)

/**
 * The key a church's ID sits under in Stripe metadata, set on the server when a
 * Customer or a Subscription is made for that church (ticket 04). A cross-check only:
 * the church is found by the stored customer, never by this.
 */
export const STRIPE_CHURCH_METADATA_KEY = 'ministry_id'

/** Stripe's Subscription statuses. A status Stripe adds later is refused at the database. */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'

/** Whether a Subscription in this status is still going: on a free trial, paid or in Stripe's retries. */
export const subscriptionIsLive = (status: SubscriptionStatus): boolean => LIVE.has(status)

/**
 * Where a church stands, as its pages and the texting gate read it. Derived by
 * `app.billing_state_of` from the church's history, and never stored.
 *
 * - `outside_stripe`: the operator flag; it keeps working with no subscription.
 * - `no_subscription`: nothing established yet, a church that has not finished paying,
 *   or one whose trial ran out or was replaced before its setup intent was confirmed.
 * - `incomplete`: a subscription that has not finished starting: its first payment has
 *   not gone through, or its trial's setup intent has not been confirmed (ticket 04).
 * - `trialing`, `active`: as Stripe says.
 * - `past_due`: Stripe is still retrying, and everything keeps running.
 * - `ended`: canceled, unpaid, incomplete_expired or paused.
 */
export type BillingStanding =
  | 'outside_stripe'
  | 'no_subscription'
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'ended'

export const BILLING_STANDINGS: readonly BillingStanding[] = [
  'outside_stripe',
  'no_subscription',
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'ended',
]

/** A church's billing as a page sees it. No Stripe ID is part of it. */
export interface BillingState {
  readonly standing: BillingStanding
  /** Whether its check-ins may run and its pages may change anything. */
  readonly hasAccess: boolean
  readonly trialEndsAt: Date | null
  readonly currentPeriodEndsAt: Date | null
  /** When a cancellation already asked for takes effect. */
  readonly cancelsAt: Date | null
}

const dateOf = (value: unknown): Date | null =>
  value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null

/**
 * A state as `app.billing_state_of` answers it, whether straight from a query or inside
 * a page's document. A standing this does not know is raised rather than read as
 * something: a page or a gate must not guess at who has access.
 */
export const billingStateOf = (row: Readonly<Record<string, unknown>>): BillingState => {
  const standing = BILLING_STANDINGS.find((known) => known === row.standing)
  if (!standing) {
    throw new Error(`A church's billing state has a standing this reader does not know: ${String(row.standing)}`)
  }
  return {
    standing,
    hasAccess: row.has_access === true,
    trialEndsAt: dateOf(row.trial_ends_at),
    currentPeriodEndsAt: dateOf(row.current_period_ends_at),
    cancelsAt: dateOf(row.cancels_at),
  }
}

/** A Subscription as re-read from Stripe. */
export interface StripeSubscriptionFacts {
  readonly id: string
  readonly status: SubscriptionStatus
  /**
   * Its setup intent has not been confirmed, so no card or bank account was saved for
   * it. Stripe says `trialing` from creation regardless, and leaves the setup intent
   * in place if the Subscription ends. Never true once a Subscription has been paying,
   * whatever a later setup intent is doing (ticket 04).
   */
  readonly awaitingPaymentMethod: boolean
  readonly createdAt: Date
  readonly priceId: string | null
  readonly latestInvoiceId: string | null
  readonly trialEndsAt: Date | null
  readonly currentPeriodEndsAt: Date | null
  readonly cancelsAt: Date | null
  /** What its metadata says its church is, for the cross-check. */
  readonly namedChurch: string | null
}

const LIVE: ReadonlySet<SubscriptionStatus> = new Set(['trialing', 'active', 'past_due'])

/** Whether this Subscription is paying, or on a trial with a payment method behind it. */
export const isConfirmedAndLive = (subscription: StripeSubscriptionFacts): boolean =>
  LIVE.has(subscription.status) && !subscription.awaitingPaymentMethod

/**
 * The one Subscription a customer's billing state is read from, or null where it has
 * none. A church that ended and restarted holds two, and a late event about the old
 * one must not end the new one, so a live Subscription wins over any that is not, and
 * the newest wins among equals. One still waiting for its payment method is not live.
 */
export const currentSubscription = (
  subscriptions: readonly StripeSubscriptionFacts[],
): StripeSubscriptionFacts | null =>
  [...subscriptions].sort(
    (a, b) =>
      Number(isConfirmedAndLive(b)) - Number(isConfirmedAndLive(a)) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  )[0] ?? null

/** A verified Stripe event, as much of it as anything here reads. */
export interface StripeEventEnvelope {
  readonly id: string
  readonly type: string
  readonly livemode: boolean
  /** Seconds since the epoch, as Stripe sends it. */
  readonly created: number
  readonly object: Readonly<Record<string, unknown>>
}

/**
 * An event as it is kept in the inbox: Stripe's IDs and nothing else.
 *
 * The event itself is not kept. A charge or a customer carries a name, an email
 * address, a billing address and card details, and Discipler stores only Stripe's IDs
 * (the spec's first required protection), so what the processing step needs is read
 * out on the way in and the rest is never written down.
 */
export interface StripeInboxEntry {
  readonly id: string
  readonly type: string
  readonly livemode: boolean
  readonly occurredAt: Date
  readonly customerId: string | null
  readonly subscriptionId: string | null
  readonly invoiceId: string | null
  readonly chargeId: string | null
  /** Every church the event's own metadata names, for the cross-check. */
  readonly namedChurches: readonly string[]
}

type Fields = Readonly<Record<string, unknown>>

const fieldsOf = (value: unknown): Fields | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : null

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

/** An expandable field: Stripe sends an ID, or the object itself where it was expanded. */
const idOf = (value: unknown): string | null => textOf(value) ?? textOf(fieldsOf(value)?.id)

const churchNamedBy = (holder: unknown): string | null =>
  textOf(fieldsOf(fieldsOf(holder)?.metadata)?.[STRIPE_CHURCH_METADATA_KEY])

const present = (values: readonly (string | null)[]): readonly string[] =>
  [...new Set(values.filter((value): value is string => value !== null))]

export const stripeInboxEntryOf = (event: StripeEventEnvelope): StripeInboxEntry => {
  const { object } = event

  const about = ((): Pick<
    StripeInboxEntry,
    'customerId' | 'subscriptionId' | 'invoiceId' | 'chargeId' | 'namedChurches'
  > => {
    const own = churchNamedBy(object)
    const nothing = { customerId: null, subscriptionId: null, invoiceId: null, chargeId: null }

    switch (object.object) {
      case 'subscription':
        return {
          ...nothing,
          customerId: idOf(object.customer),
          subscriptionId: textOf(object.id),
          namedChurches: present([own]),
        }
      case 'invoice': {
        // Since API version 2025-03-31 an invoice names its subscription under
        // `parent`; the top-level field is what older endpoint versions send.
        const details = fieldsOf(fieldsOf(object.parent)?.subscription_details)
        return {
          ...nothing,
          customerId: idOf(object.customer),
          subscriptionId: idOf(details?.subscription) ?? idOf(object.subscription),
          invoiceId: textOf(object.id),
          namedChurches: present([
            own,
            churchNamedBy(details),
            churchNamedBy(object.subscription_details),
          ]),
        }
      }
      case 'charge':
        return {
          ...nothing,
          customerId: idOf(object.customer),
          chargeId: textOf(object.id),
          namedChurches: present([own]),
        }
      case 'dispute':
        // A dispute names its charge and no customer: the charge is read to find one.
        return { ...nothing, chargeId: idOf(object.charge), namedChurches: present([own]) }
      case 'setup_intent':
        // Names its customer, and its Subscription only through the re-read.
        return { ...nothing, customerId: idOf(object.customer), namedChurches: present([own]) }
      case 'checkout.session':
        return {
          ...nothing,
          customerId: idOf(object.customer),
          subscriptionId: idOf(object.subscription),
          invoiceId: idOf(object.invoice),
          namedChurches: present([own, textOf(object.client_reference_id)]),
        }
      default:
        return { ...nothing, namedChurches: [] }
    }
  })()

  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    occurredAt: new Date(event.created * 1000),
    ...about,
  }
}

/** Why an event was refused, kept beside it in the inbox and said to support@. */
export type StripeEventRefusal = 'customer_unknown' | 'church_mismatch'

/** What the current Subscription, as re-read, establishes for one event. */
export interface BillingFact {
  readonly eventId: string
  readonly eventType: string
  readonly eventOccurredAt: Date
  readonly livemode: boolean
  readonly customerId: string
  /** What the event was about, where it was about an invoice or a charge. */
  readonly invoiceId: string | null
  readonly chargeId: string | null
  /** Null where the customer holds no Subscription at all. */
  readonly subscription: StripeSubscriptionFacts | null
}
