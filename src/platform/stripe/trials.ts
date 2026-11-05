import type Stripe from 'stripe'
import { STRIPE_CHURCH_METADATA_KEY } from '~/domain/billing'
import { startingPrice, type BillingCycle, type PaidPhase } from '~/domain/offers'
import type { StripeTrials } from '~/service/ports'
import { factsOf, stripeClient } from './billing'

/**
 * What is written to Stripe (Exponential launch, ticket 04). The restricted key needs
 * write on Customers, Subscriptions, Subscription Schedules and Setup Intents, and read
 * on Payment Methods and Prices.
 *
 * Stripe Tax stays off, which here is `automatic_tax` never being passed.
 */

/**
 * Exactly what the spec accepts: a card (Apple Pay is one), Link, and a US bank account.
 * A list, against Stripe's usual advice, because the spec's list is a rule and a
 * Dashboard setting is one nobody reviews.
 */
export const ACCEPTED_PAYMENT_METHODS = ['card', 'link', 'us_bank_account'] as const

/** By instant bank sign-in only, never by microdeposits (spec, Billing). */
export const instantBankSignIn = (): Stripe.SubscriptionCreateParams.PaymentSettings.PaymentMethodOptions.UsBankAccount => ({
  verification_method: 'instant',
  financial_connections: { permissions: ['payment_method'] },
})

export const priceIdOf = async (client: Stripe, cycle: BillingCycle): Promise<string> => {
  const { lookupKey } = startingPrice(cycle)
  const { data } = await client.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  const price = data[0]
  if (!price) throw new Error(`Stripe has no active price for ${lookupKey}. Has the catalog been created?`)
  return price.id
}

const expandedSetupIntent = (subscription: Stripe.Subscription): Stripe.SetupIntent | null =>
  typeof subscription.pending_setup_intent === 'object' ? subscription.pending_setup_intent : null

type PhaseDiscount = Stripe.SubscriptionScheduleUpdateParams.Phase.Discount

const fingerprintOf = (method: Stripe.PaymentMethod): string | null =>
  method.card?.fingerprint ?? method.us_bank_account?.fingerprint ?? null

export const idOfExpandable = (value: string | { readonly id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null)

/** A running phase's discounts, said again as an update has to say them. */
export const discountsKept = (phase: Stripe.SubscriptionSchedule.Phase): Stripe.Emptyable<PhaseDiscount[]> => {
  const kept = (phase.discounts ?? []).flatMap((held): PhaseDiscount[] => {
    const coupon = idOfExpandable(held.coupon)
    if (coupon) return [{ coupon }]
    const discount = idOfExpandable(held.discount)
    return discount ? [{ discount }] : []
  })
  return kept.length > 0 ? kept : ''
}

export const createStripeTrials = (client: () => Stripe = stripeClient): StripeTrials => ({
  async createCustomer({ church, churchName, email }) {
    const customer = await client().customers.create({
      name: churchName,
      ...(email ? { email } : {}),
      metadata: { [STRIPE_CHURCH_METADATA_KEY]: church },
    })
    return { id: customer.id, livemode: customer.livemode }
  },

  async openTrial({ customerId, church, cycle, trialDays }) {
    const stripe = client()
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: await priceIdOf(stripe, cycle), quantity: 1 }],
      trial_period_days: trialDays,
      // Saved for later and charged at the end of the free days. A trial that gets there
      // with nothing saved ends, rather than sitting there invoicing nobody.
      payment_behavior: 'default_incomplete',
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      payment_settings: {
        payment_method_types: [...ACCEPTED_PAYMENT_METHODS],
        payment_method_options: { us_bank_account: instantBankSignIn() },
        save_default_payment_method: 'on_subscription',
      },
      metadata: { [STRIPE_CHURCH_METADATA_KEY]: church },
      expand: ['pending_setup_intent'],
    })

    const clientSecret = expandedSetupIntent(subscription)?.client_secret
    if (!clientSecret) {
      // With no setup intent it would read as confirmed, and a church would have access
      // with nothing saved. It must not outlive this call.
      await stripe.subscriptions.cancel(subscription.id)
      throw new Error('Stripe opened a trial with no setup intent to confirm')
    }

    return { subscription: factsOf(subscription), clientSecret }
  },

  async setupSecretOf(subscriptionId) {
    const subscription = await client().subscriptions.retrieve(subscriptionId, {
      expand: ['pending_setup_intent'],
    })
    return expandedSetupIntent(subscription)?.client_secret ?? null
  },

  async cancelUnconfirmed(subscriptionId) {
    const stripe = client()
    const subscription = await stripe.subscriptions.cancel(subscriptionId, {
      expand: ['pending_setup_intent'],
    })
    // Stripe leaves it in place when a Subscription ends, and a tab still showing the
    // Element could otherwise save a card against nothing.
    const pending = expandedSetupIntent(subscription)
    if (pending && pending.status !== 'succeeded' && pending.status !== 'canceled') {
      await stripe.setupIntents.cancel(pending.id)
    }
  },

  async confirmDefaultPaymentMethod(subscriptionId, customerId) {
    const stripe = client()
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['default_payment_method'],
    })
    const saved = subscription.default_payment_method
    if (saved && typeof saved === 'object') return { fingerprint: fingerprintOf(saved) }

    // The newest the customer holds, which is what the setup intent just saved. Stripe
    // says the default is set "when payment succeeds", and this was not a payment. A
    // trial's end looks for a default, and would cancel for want of one.
    const { data } = await stripe.customers.listPaymentMethods(customerId, { limit: 1 })
    const method = data[0]
    if (!method) return null

    await stripe.subscriptions.update(subscriptionId, { default_payment_method: method.id })
    return { fingerprint: fingerprintOf(method) }
  },

  async followCustomersDefault(customerId, subscriptionId) {
    const stripe = client()
    const [customer, subscription] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.subscriptions.retrieve(subscriptionId),
    ])
    if (customer.deleted) return false
    const chosen = idOfExpandable(customer.invoice_settings?.default_payment_method)
    const held = idOfExpandable(subscription.default_payment_method)
    // Only a Subscription holding one of its own needs telling; the rest follow the customer.
    if (!chosen || !held || chosen === held) return false

    await stripe.subscriptions.update(subscriptionId, { default_payment_method: chosen })
    // A schedule made from the Subscription copied its default into its own settings, and
    // would put the old one back at its next phase.
    const scheduleId = idOfExpandable(subscription.schedule)
    if (scheduleId) {
      await stripe.subscriptionSchedules.update(scheduleId, {
        default_settings: { default_payment_method: chosen },
      })
    }
    return true
  },

  async schedulePhases(subscriptionId, phases: readonly PaidPhase[]) {
    const stripe = client()
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const item = subscription.items.data[0]
    const price = item?.price?.id
    const trialing = subscription.status === 'trialing'
    if (!price || (trialing && !subscription.trial_end)) {
      throw new Error('Only a Subscription with a price and a trial can be given these phases')
    }

    const scheduleId =
      typeof subscription.schedule === 'string'
        ? subscription.schedule
        : (subscription.schedule?.id ??
          (await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })).id)
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)

    const items = [{ price, quantity: 1 }]

    // What is running now, as it is: every setting of the current phase has to be said
    // again, or an update unsets it. Past phases are left out, as Stripe allows.
    const running = (): Stripe.SubscriptionScheduleUpdateParams.Phase => {
      if (trialing) {
        const start = schedule.phases[0]?.start_date
        if (!start) throw new Error('A schedule made from a Subscription has no first phase')
        const trialEnd = subscription.trial_end!
        return { items, start_date: start, end_date: trialEnd, trial_end: trialEnd }
      }

      // Past its free days, a bill may already be paid, and it stays paid (James,
      // 2026-11-04): this stretch keeps its price and discount until the next bill, and
      // what is asked for begins there. The period's end, and not the phase's, because a
      // discounted phase can have months still to run.
      const startedAt = schedule.current_phase?.start_date
      const phase = schedule.phases.find(({ start_date }) => start_date === startedAt)
      const nextBill = item?.current_period_end
      if (!phase || !nextBill) throw new Error('This Subscription has no current phase to keep until its next bill')
      return {
        items,
        start_date: phase.start_date,
        end_date: nextBill,
        discounts: discountsKept(phase),
        proration_behavior: 'none',
      }
    }

    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [
        running(),
        ...phases.map(({ couponId, interval, intervals }) => ({
          items,
          duration: { interval, interval_count: intervals },
          discounts: couponId ? [{ coupon: couponId }] : ('' as const),
          proration_behavior: 'none' as const,
        })),
      ],
    })
  },
})
