import Stripe from 'stripe'
import type { StripeSubscriptionFacts, SubscriptionStatus } from '~/domain/billing'
import { STRIPE_CHURCH_METADATA_KEY } from '~/domain/billing'
import type { StripeBilling } from '~/service/ports'

/**
 * Stripe's API, read and never written (Exponential launch, ticket 03). The API
 * version is the one this SDK pins, so it moves only when the package does, and the
 * webhook endpoint should be created on the same one.
 *
 * Read per call, as the Resend key is: only a deployment with Stripe has the key, and
 * Preview and a developer's machine run every page without one.
 */
export const stripeClient = (): Stripe => {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key, { maxNetworkRetries: 2 })
}

const dateOf = (seconds: number | null | undefined): Date | null =>
  typeof seconds === 'number' ? new Date(seconds * 1000) : null

const idOf = (value: string | { readonly id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null)

const factsOf = (subscription: Stripe.Subscription): StripeSubscriptionFacts => {
  // Discipler sells one thing, so a Subscription has one item.
  const item = subscription.items.data[0]
  const currentPeriodEndsAt = dateOf(item?.current_period_end)

  return {
    id: subscription.id,
    status: subscription.status as SubscriptionStatus,
    createdAt: new Date(subscription.created * 1000),
    priceId: item?.price?.id ?? null,
    latestInvoiceId: idOf(subscription.latest_invoice),
    trialEndsAt: dateOf(subscription.trial_end),
    currentPeriodEndsAt,
    cancelsAt:
      dateOf(subscription.cancel_at) ??
      (subscription.cancel_at_period_end ? currentPeriodEndsAt : null),
    namedChurch: subscription.metadata?.[STRIPE_CHURCH_METADATA_KEY] ?? null,
  }
}

export const createStripeBilling = (client: () => Stripe = stripeClient): StripeBilling => ({
  async subscriptionsOf(customerId) {
    // `all`, because the default leaves out a canceled one, and a canceled one is the
    // answer that matters most. The most a church can hold is one per restart.
    const { data } = await client().subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })
    return data.map(factsOf)
  },

  async customerOfCharge(chargeId) {
    const charge = await client().charges.retrieve(chargeId)
    return idOf(charge.customer)
  },
})
