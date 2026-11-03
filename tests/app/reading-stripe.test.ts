import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { createStripeBilling } from '~/platform/stripe/billing'

/**
 * The Stripe adapter through the real SDK, against a `fetch` that answers as Stripe's
 * API does, so what is tested is what is asked for and how the answer is read. No
 * request leaves this process.
 */
const answering = (answer: unknown) => {
  const asked: string[] = []
  const fake = async (url: string | URL | Request) => {
    asked.push(String(url))
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const client = new Stripe('rk_test_not_a_real_key', {
    httpClient: Stripe.createFetchHttpClient(fake as typeof fetch),
    maxNetworkRetries: 0,
  })
  return { asked, billing: createStripeBilling(() => client) }
}

const aSubscription = (changes: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  status: 'trialing',
  created: 1_790_000_000,
  latest_invoice: 'in_1',
  trial_end: 1_792_000_000,
  cancel_at: null,
  cancel_at_period_end: false,
  metadata: { ministry_id: 'church-1' },
  items: {
    object: 'list',
    data: [{ id: 'si_1', current_period_end: 1_793_000_000, price: { id: 'price_97' } }],
  },
  ...changes,
})

const listOf = (...subscriptions: unknown[]) => ({
  object: 'list',
  data: subscriptions,
  has_more: false,
  url: '/v1/subscriptions',
})

describe('reading Stripe', () => {
  it('lists a customer’s subscriptions including the canceled', async () => {
    const { asked, billing } = answering(listOf(aSubscription()))

    await billing.subscriptionsOf('cus_1')

    const url = new URL(asked[0]!)
    expect(url.pathname).toBe('/v1/subscriptions')
    expect(url.searchParams.get('customer')).toBe('cus_1')
    expect(url.searchParams.get('status')).toBe('all')
  })

  it('reads a subscription into the facts Discipler keeps', async () => {
    const { billing } = answering(listOf(aSubscription()))

    expect(await billing.subscriptionsOf('cus_1')).toEqual([
      {
        id: 'sub_1',
        status: 'trialing',
        createdAt: new Date(1_790_000_000_000),
        priceId: 'price_97',
        latestInvoiceId: 'in_1',
        trialEndsAt: new Date(1_792_000_000_000),
        currentPeriodEndsAt: new Date(1_793_000_000_000),
        cancelsAt: null,
        namedChurch: 'church-1',
      },
    ])
  })

  it('reads a cancellation at the period’s end as ending then', async () => {
    const { billing } = answering(listOf(aSubscription({ cancel_at_period_end: true })))

    const [subscription] = await billing.subscriptionsOf('cus_1')

    expect(subscription?.cancelsAt).toEqual(new Date(1_793_000_000_000))
  })

  it('reads a dated cancellation as its date', async () => {
    const { billing } = answering(listOf(aSubscription({ cancel_at: 1_791_000_000 })))

    const [subscription] = await billing.subscriptionsOf('cus_1')

    expect(subscription?.cancelsAt).toEqual(new Date(1_791_000_000_000))
  })

  it('finds the customer of a charge', async () => {
    const { asked, billing } = answering({ id: 'ch_1', object: 'charge', customer: 'cus_1' })

    expect(await billing.customerOfCharge('ch_1')).toBe('cus_1')
    expect(new URL(asked[0]!).pathname).toBe('/v1/charges/ch_1')
  })

  it('finds no customer on a charge made without one', async () => {
    const { billing } = answering({ id: 'ch_1', object: 'charge', customer: null })

    expect(await billing.customerOfCharge('ch_1')).toBeNull()
  })

  it('needs its key to ask anything', async () => {
    const before = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    try {
      await expect(createStripeBilling().subscriptionsOf('cus_1')).rejects.toThrow(/STRIPE_SECRET_KEY/)
    } finally {
      if (before !== undefined) process.env.STRIPE_SECRET_KEY = before
    }
  })
})
