import { describe, expect, it } from 'vitest'
import {
  currentSubscription,
  isStripeEventActedOn,
  STRIPE_EVENTS_ACTED_ON,
  stripeInboxEntryOf,
  type StripeEventEnvelope,
  type StripeSubscriptionFacts,
} from '~/domain/billing'

/**
 * What the inbox keeps from a Stripe event (Exponential launch, ticket 03): IDs, and
 * every church the event names, for each shape of event subscribed to.
 */
const anEvent = (type: string, object: Record<string, unknown>): StripeEventEnvelope => ({
  id: 'evt_1',
  type,
  livemode: false,
  created: 1_793_000_000,
  object,
})

describe('reading a Stripe event', () => {
  it('finds the customer and the church on a subscription event', () => {
    const entry = stripeInboxEntryOf(
      anEvent('customer.subscription.updated', {
        object: 'subscription',
        id: 'sub_1',
        customer: 'cus_1',
        metadata: { ministry_id: 'church-1', other: 'x' },
      }),
    )

    expect(entry).toEqual({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      livemode: false,
      occurredAt: new Date(1_793_000_000_000),
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      invoiceId: null,
      chargeId: null,
      namedChurches: ['church-1'],
    })
  })

  it('reads an invoice in the shape the current API version sends', () => {
    const entry = stripeInboxEntryOf(
      anEvent('invoice.paid', {
        object: 'invoice',
        id: 'in_1',
        customer: 'cus_1',
        parent: {
          subscription_details: { subscription: 'sub_1', metadata: { ministry_id: 'church-1' } },
        },
      }),
    )

    expect(entry).toMatchObject({
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      invoiceId: 'in_1',
      namedChurches: ['church-1'],
    })
  })

  it('reads an invoice in the shape an older endpoint version sends', () => {
    const entry = stripeInboxEntryOf(
      anEvent('invoice.payment_failed', {
        object: 'invoice',
        id: 'in_1',
        customer: 'cus_1',
        subscription: 'sub_1',
        subscription_details: { metadata: { ministry_id: 'church-1' } },
      }),
    )

    expect(entry).toMatchObject({ subscriptionId: 'sub_1', namedChurches: ['church-1'] })
  })

  it('takes a client reference and the metadata from a Checkout session as two claims', () => {
    const entry = stripeInboxEntryOf(
      anEvent('checkout.session.completed', {
        object: 'checkout.session',
        customer: 'cus_1',
        subscription: 'sub_1',
        client_reference_id: 'church-1',
        metadata: { ministry_id: 'church-2' },
      }),
    )

    expect(entry.namedChurches).toEqual(['church-2', 'church-1'])
  })

  it('finds a dispute by its charge, which is all it names', () => {
    const entry = stripeInboxEntryOf(
      anEvent('charge.dispute.created', { object: 'dispute', id: 'dp_1', charge: 'ch_1' }),
    )

    expect(entry).toMatchObject({ customerId: null, chargeId: 'ch_1', namedChurches: [] })
  })

  it('reads an expanded customer by its ID', () => {
    const entry = stripeInboxEntryOf(
      anEvent('charge.refunded', {
        object: 'charge',
        id: 'ch_1',
        customer: { id: 'cus_1', email: 'someone@example.com' },
      }),
    )

    expect(entry).toMatchObject({ customerId: 'cus_1', chargeId: 'ch_1' })
  })

  it('keeps nothing of what a charge carries about the person who paid', () => {
    const entry = stripeInboxEntryOf(
      anEvent('charge.refunded', {
        object: 'charge',
        id: 'ch_1',
        customer: 'cus_1',
        billing_details: { email: 'someone@example.com', name: 'Some One' },
        payment_method_details: { card: { last4: '4242' } },
      }),
    )

    expect(JSON.stringify(entry)).not.toMatch(/someone@|Some One|4242/)
  })

  it('reads nothing from an object it has no business with', () => {
    const entry = stripeInboxEntryOf(anEvent('customer.created', { object: 'customer', id: 'cus_1' }))

    expect(entry).toMatchObject({
      customerId: null,
      subscriptionId: null,
      invoiceId: null,
      chargeId: null,
      namedChurches: [],
    })
  })

  it('acts on the thirteen events the endpoint subscribes to and no others', () => {
    expect(STRIPE_EVENTS_ACTED_ON).toHaveLength(13)
    expect(isStripeEventActedOn('invoice.paid')).toBe(true)
    expect(isStripeEventActedOn('customer.created')).toBe(false)
  })
})

describe('a confirmed setup intent', () => {
  it('is acted on, and says which customer to look at', () => {
    expect(isStripeEventActedOn('setup_intent.succeeded')).toBe(true)

    expect(
      stripeInboxEntryOf(
        anEvent('setup_intent.succeeded', {
          object: 'setup_intent',
          id: 'seti_1',
          customer: 'cus_1',
          payment_method: 'pm_1',
          metadata: {},
        }),
      ),
    ).toMatchObject({
      customerId: 'cus_1',
      subscriptionId: null,
      invoiceId: null,
      chargeId: null,
      namedChurches: [],
    })
  })

  it('finds an expanded customer, and any church it names', () => {
    expect(
      stripeInboxEntryOf(
        anEvent('setup_intent.succeeded', {
          object: 'setup_intent',
          customer: { id: 'cus_1', object: 'customer' },
          metadata: { ministry_id: 'church-1' },
        }),
      ),
    ).toMatchObject({ customerId: 'cus_1', namedChurches: ['church-1'] })
  })
})

describe('the current subscription', () => {
  const aSubscription = (
    id: string,
    status: StripeSubscriptionFacts['status'],
    created: string,
  ): StripeSubscriptionFacts => ({
    id,
    status,
    awaitingPaymentMethod: false,
    createdAt: new Date(created),
    priceId: null,
    latestInvoiceId: null,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    cancelsAt: null,
    namedChurch: null,
  })

  it('is none for a customer who holds none', () => {
    expect(currentSubscription([])).toBeNull()
  })

  it('is the newest of the ended', () => {
    const current = currentSubscription([
      aSubscription('sub_old', 'canceled', '2026-01-01'),
      aSubscription('sub_new', 'canceled', '2026-06-01'),
    ])

    expect(current?.id).toBe('sub_new')
  })

  it('is a live one over a newer one that has not started', () => {
    const current = currentSubscription([
      aSubscription('sub_paying', 'active', '2026-01-01'),
      aSubscription('sub_retry', 'incomplete', '2026-06-01'),
    ])

    expect(current?.id).toBe('sub_paying')
  })

  it('is a confirmed one over a newer trial still waiting for its payment method', () => {
    const confirmed = aSubscription('sub_confirmed', 'trialing', '2026-01-01')
    const waiting = {
      ...aSubscription('sub_waiting', 'trialing', '2026-06-01'),
      awaitingPaymentMethod: true,
    }

    expect(currentSubscription([waiting, confirmed])?.id).toBe('sub_confirmed')
  })

  it('is the new trial over an older one that ran out waiting', () => {
    const ranOut = {
      ...aSubscription('sub_ran_out', 'canceled', '2026-01-01'),
      awaitingPaymentMethod: true,
    }
    const fresh = {
      ...aSubscription('sub_fresh', 'trialing', '2026-06-01'),
      awaitingPaymentMethod: true,
    }

    expect(currentSubscription([ranOut, fresh])?.id).toBe('sub_fresh')
  })

  it('is the restart, whichever order Stripe lists them in', () => {
    const old = aSubscription('sub_old', 'canceled', '2026-01-01')
    const restart = aSubscription('sub_restart', 'active', '2026-06-01')

    expect(currentSubscription([old, restart])?.id).toBe('sub_restart')
    expect(currentSubscription([restart, old])?.id).toBe('sub_restart')
  })
})
