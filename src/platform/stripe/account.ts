import type Stripe from 'stripe'
import { currentSubscription, STRIPE_CHURCH_METADATA_KEY } from '~/domain/billing'
import type { BillingPicture, OfferInForce, OfferKind, PastBill, PaymentMethodOnFile } from '~/domain/billing-picture'
import { startingPrice, STRIPE_COUPONS } from '~/domain/offers'
import type { StripeAccount } from '~/service/ports'
import { factsOf, stripeClient } from './billing'
import { ACCEPTED_PAYMENT_METHODS, discountsKept, idOfExpandable, instantBankSignIn, priceIdOf } from './trials'

/**
 * Stripe's API as the Billing page uses it (Exponential launch, ticket 33). Everything it
 * says is read here each time: Discipler keeps Stripe's IDs and nothing about the money.
 * The restricted key needs read on Invoices and Payment Methods, and write on Customer
 * Portal sessions and Customer Sessions, on top of what `./trials.ts` lists.
 *
 * **Cancelling a Subscription on a schedule happens here and not on Stripe's billing
 * page**, because that page refuses: "Customers can't update or cancel subscriptions that
 * currently have an update scheduled with a subscription schedule" (Stripe, customer
 * management, read 2026-11-04). Every church with an offer is on a schedule. So its
 * schedule is told to cancel at its next bill, and what it would have billed is kept in
 * the schedule's metadata for "Keep my subscription" to put back.
 */

/** Marks the billing page's configuration, which `./catalog.ts` makes. */
export const BILLING_PORTAL_CONFIGURATION_MARK = { discipler: 'billing_portal' } as const

const PHASES_KEPT_KEY = 'discipler_phases_kept'

/** A phase as "Keep my subscription" needs it back. Kept short: metadata holds 500 characters. */
interface PhaseKept {
  /** When it ends, in Stripe's seconds. */
  readonly e: number
  /** Its coupon, or null for the full price. */
  readonly c: string | null
}

const OFFER_OF_COUPON: Readonly<Record<string, OfferKind>> = {
  [STRIPE_COUPONS.exponentialYear.id]: 'exponential',
  [STRIPE_COUPONS.plantYear.id]: 'plant_year',
  [STRIPE_COUPONS.firstMonth.id]: 'first_free_month',
  [STRIPE_COUPONS.firstMonthOfAYear.id]: 'first_free_month',
}

const dateOf = (seconds: number | null | undefined): Date | null =>
  typeof seconds === 'number' ? new Date(seconds * 1000) : null

const expanded = <T extends { readonly id: string }>(value: string | T | null | undefined): T | null =>
  value && typeof value === 'object' ? value : null

const couponOfPhase = (phase: Stripe.SubscriptionSchedule.Phase): string | null =>
  idOfExpandable(phase.discounts?.[0]?.coupon)

const keptPhasesOf = (schedule: Stripe.SubscriptionSchedule): readonly PhaseKept[] | null => {
  const kept = schedule.metadata?.[PHASES_KEPT_KEY]
  if (!kept) return null
  try {
    return JSON.parse(kept) as PhaseKept[]
  } catch {
    return null
  }
}

/** The offers still to run, from what the schedule holds or, while it is cancelling, kept. */
const offersOf = (schedule: Stripe.SubscriptionSchedule | null, at: Date): readonly OfferInForce[] => {
  if (!schedule) return []
  const phases =
    keptPhasesOf(schedule) ?? schedule.phases.map((phase) => ({ e: phase.end_date, c: couponOfPhase(phase) }))
  return phases.flatMap(({ e, c }): OfferInForce[] => {
    const kind = c ? OFFER_OF_COUPON[c] : undefined
    const endsAt = dateOf(e)
    return kind && endsAt && endsAt > at ? [{ kind, endsAt }] : []
  })
}

const methodOf = (method: Stripe.PaymentMethod | null): PaymentMethodOnFile | null => {
  if (!method) return null
  if (method.type === 'card' && method.card) {
    return {
      kind: 'card',
      brand: method.card.brand,
      last4: method.card.last4,
      expMonth: method.card.exp_month,
      expYear: method.card.exp_year,
    }
  }
  if (method.type === 'us_bank_account' && method.us_bank_account) {
    return {
      kind: 'bank',
      bankName: method.us_bank_account.bank_name,
      accountType: method.us_bank_account.account_type,
      last4: method.us_bank_account.last4,
    }
  }
  // Link says nothing about what is behind it, and the page has to be right without it.
  return method.type === 'link' ? { kind: 'link' } : { kind: 'other' }
}

/** What Stripe will take next, or null where it has nothing coming. */
const previewOf = async (
  stripe: Stripe,
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule | null,
): Promise<Stripe.Invoice | null> => {
  try {
    // A schedule has to be previewed as one, or the preview ignores its next phase.
    return await stripe.invoices.createPreview(
      schedule ? { schedule: schedule.id } : { subscription: subscription.id },
    )
  } catch (error) {
    if ((error as { code?: unknown }).code === 'invoice_upcoming_none') return null
    throw error
  }
}

const billPeriodIsAYear = (invoice: Stripe.Invoice): boolean => {
  const period = invoice.lines?.data[0]?.period
  return period ? period.end - period.start > 60 * 24 * 60 * 60 : false
}

/**
 * Whether a bill Stripe has tried is still on its way rather than refused: a bank debit
 * takes days, and until then "Not paid" would be false.
 */
const isStillProcessing = async (stripe: Stripe, invoice: Stripe.Invoice): Promise<boolean> => {
  const { payments } = await stripe.invoices.retrieve(invoice.id, {
    expand: ['payments.data.payment.payment_intent'],
  })
  return (payments?.data ?? []).some(({ payment }) => {
    const intent = expanded(payment.payment_intent)
    return intent?.status === 'processing'
  })
}

/** The running stretch, said again as an update has to say it, up to its next bill. */
const runningUntilNextBill = (
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule,
): { readonly phase: Stripe.SubscriptionScheduleUpdateParams.Phase; readonly nextBill: number } => {
  const item = subscription.items.data[0]
  const price = item?.price?.id
  if (!price) throw new Error('This Subscription has no price')
  const items = [{ price, quantity: 1 }]
  const startedAt = schedule.current_phase?.start_date ?? schedule.phases[0]?.start_date
  const phase = schedule.phases.find(({ start_date }) => start_date === startedAt)
  if (!phase) throw new Error('This schedule has no current phase')

  if (subscription.status === 'trialing') {
    const trialEnd = subscription.trial_end
    if (!trialEnd) throw new Error('A trialing Subscription came back with no end to its trial')
    return {
      phase: { items, start_date: phase.start_date, end_date: trialEnd, trial_end: trialEnd },
      nextBill: trialEnd,
    }
  }

  const nextBill = item?.current_period_end
  if (!nextBill) throw new Error('This Subscription has no period to end')
  return {
    phase: {
      items,
      start_date: phase.start_date,
      end_date: nextBill,
      discounts: discountsKept(phase),
      proration_behavior: 'none',
    },
    nextBill,
  }
}

const withItsSchedule = async (
  stripe: Stripe,
  subscriptionId: string,
): Promise<{ readonly subscription: Stripe.Subscription; readonly schedule: Stripe.SubscriptionSchedule | null }> => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['schedule'] })
  return { subscription, schedule: expanded(subscription.schedule) }
}

export const createStripeAccount = (client: () => Stripe = stripeClient): StripeAccount => ({
  async pictureOf(customerId, at) {
    const stripe = client()
    const [{ data: subscriptions }, customer] = await Promise.all([
      stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
        expand: [
          'data.pending_setup_intent',
          'data.default_payment_method',
          'data.latest_invoice',
          'data.schedule',
        ],
      }),
      stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }),
    ])

    const current = currentSubscription(subscriptions.map(factsOf))
    const subscription = subscriptions.find(({ id }) => id === current?.id)
    if (!current || !subscription || customer.deleted) return null
    // It never began: no method was saved, or its first payment never went through.
    if (current.awaitingPaymentMethod || current.status === 'incomplete' || current.status === 'incomplete_expired') {
      return null
    }

    const item = subscription.items.data[0]
    const schedule = expanded(subscription.schedule)
    const billing = ['trialing', 'active'].includes(current.status) && !current.cancelsAt
    const preview = billing ? await previewOf(stripe, subscription, schedule) : null
    const nextAt = dateOf(subscription.status === 'trialing' ? subscription.trial_end : item?.current_period_end)
    const credit = Math.max(0, -(customer.balance ?? 0))
    const taken = preview ? preview.total - preview.amount_due : 0
    const trialStart = subscription.trial_start
    const trialEnd = subscription.trial_end

    const latest = expanded(subscription.latest_invoice)
    const failedOn = dateOf(latest?.status_transitions?.finalized_at ?? latest?.created)

    const picture: BillingPicture = {
      subscriptionId: subscription.id,
      onASchedule: schedule !== null,
      status: current.status,
      cycle: item?.price?.recurring?.interval === 'year' ? 'year' : 'month',
      priceCents: item?.price?.unit_amount ?? 0,
      aboveTheLimit: item?.price?.lookup_key?.includes('above_the_limit') ?? false,
      trial:
        subscription.status === 'trialing' && trialStart && trialEnd
          ? {
              days: Math.round((trialEnd - trialStart) / (24 * 60 * 60)),
              endsAt: new Date(trialEnd * 1000),
            }
          : null,
      nextPayment:
        preview && nextAt ? { cents: preview.amount_due, fullCents: preview.total, at: nextAt } : null,
      cancelsAt: current.cancelsAt,
      // Stripe calls these two neither ended nor live, and a church reads them as ended. Its
      // last bill is the nearest thing to a date.
      endedAt:
        dateOf(subscription.ended_at) ??
        (current.status === 'unpaid' || current.status === 'paused' ? (failedOn ?? at) : null),
      offers: offersOf(schedule, at),
      creditCents: credit,
      creditLeftCents: Math.max(0, credit - taken),
      method: methodOf(
        expanded(subscription.default_payment_method) ??
          expanded(customer.invoice_settings?.default_payment_method),
      ),
      failed:
        current.status === 'past_due' && latest && failedOn
          ? {
              cents: latest.amount_due,
              on: failedOn,
              retriesOn: dateOf(latest.next_payment_attempt),
            }
          : null,
    }
    return picture
  },

  async billsOf(customerId) {
    const stripe = client()
    const { data } = await stripe.invoices.list({ customer: customerId, limit: 24 })
    const bills = await Promise.all(
      data.map(async (invoice): Promise<PastBill | null> => {
        const paid = invoice.status === 'paid'
        const unpaid = invoice.status === 'uncollectible' || (invoice.status === 'open' && invoice.attempted)
        // A draft, a voided restart and a first payment nobody has tried yet are not bills.
        if (!paid && !unpaid) return null
        const at = dateOf(invoice.status_transitions?.finalized_at ?? invoice.created)!
        return {
          at,
          what:
            invoice.billing_reason === 'subscription_create' && invoice.total === 0
              ? 'free_trial'
              : billPeriodIsAYear(invoice)
                ? 'year'
                : 'month',
          cents: invoice.amount_due,
          status: paid
            ? 'paid'
            : invoice.status === 'open' && (await isStillProcessing(stripe, invoice))
              ? 'processing'
              : 'not_paid',
          viewAt: invoice.hosted_invoice_url ?? null,
        }
      }),
    )
    return bills.filter((bill): bill is PastBill => bill !== null)
  },

  async portalAddress({ customerId, step, subscriptionId, returnTo }) {
    const stripe = client()
    const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 })
    const configuration = data.find(
      ({ metadata }) => metadata?.discipler === BILLING_PORTAL_CONFIGURATION_MARK.discipler,
    )
    // Stripe's default configuration offers a login page and plan switching, both turned off
    // by the spec, so it is never fallen back on.
    if (!configuration) throw new Error('The billing page has no configuration. Has the catalog been created?')

    const afterCompletion = { type: 'redirect' as const, redirect: { return_url: returnTo } }
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: configuration.id,
      return_url: returnTo,
      flow_data:
        step === 'cancel'
          ? {
              type: 'subscription_cancel',
              subscription_cancel: { subscription: subscriptionId },
              after_completion: afterCompletion,
            }
          : { type: 'payment_method_update', after_completion: afterCompletion },
    })
    return session.url
  },

  async cancelOnItsSchedule(subscriptionId) {
    const stripe = client()
    const { subscription, schedule } = await withItsSchedule(stripe, subscriptionId)
    if (!schedule) throw new Error('This Subscription is not on a schedule')
    // Asked twice, the second would keep the first's one remaining phase.
    if (schedule.end_behavior === 'cancel') return

    const { phase } = runningUntilNextBill(subscription, schedule)
    const kept: PhaseKept[] = schedule.phases.map((held) => ({ e: held.end_date, c: couponOfPhase(held) }))

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'cancel',
      proration_behavior: 'none',
      phases: [phase],
      metadata: { [PHASES_KEPT_KEY]: JSON.stringify(kept) },
    })
  },

  async keep(subscriptionId) {
    const stripe = client()
    const { subscription, schedule } = await withItsSchedule(stripe, subscriptionId)

    if (schedule?.end_behavior === 'cancel') {
      const { phase, nextBill } = runningUntilNextBill(subscription, schedule)
      const items = phase.items
      const toCome = (keptPhasesOf(schedule) ?? []).filter(({ e }) => e > nextBill)
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [
          phase,
          ...toCome.map(({ e, c }) => ({
            items,
            end_date: e,
            discounts: c ? [{ coupon: c }] : ('' as const),
            proration_behavior: 'none' as const,
          })),
        ],
        metadata: { [PHASES_KEPT_KEY]: '' },
      })
      return
    }

    // Stripe's billing page says it one of two ways, depending on the billing mode.
    if (subscription.cancel_at) {
      await stripe.subscriptions.update(subscriptionId, { cancel_at: '' })
    } else if (subscription.cancel_at_period_end) {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })
    }
  },

  async customerSessionSecret(customerId) {
    const session = await client().customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: 'enabled',
            payment_method_save: 'disabled',
            payment_method_remove: 'disabled',
            payment_method_allow_redisplay_filters: ['always', 'limited', 'unspecified'],
          },
        },
      },
    })
    return session.client_secret
  },

  async openRestart({ customerId, church, cycle, waiting }) {
    const stripe = client()
    const price = await priceIdOf(stripe, cycle)

    for (const held of waiting) {
      if (held.priceId !== price) {
        await stripe.subscriptions.cancel(held.id)
        continue
      }
      const subscription = await stripe.subscriptions.retrieve(held.id, {
        expand: ['latest_invoice.confirmation_secret'],
      })
      const secret = expanded(subscription.latest_invoice)?.confirmation_secret?.client_secret
      if (secret) return { clientSecret: secret }
      await stripe.subscriptions.cancel(held.id)
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price, quantity: 1 }],
      // Billed today, by whatever the Element confirms. No trial, no schedule and no
      // discount: "a church that restarts pays the normal price" (spec).
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: [...ACCEPTED_PAYMENT_METHODS],
        payment_method_options: { us_bank_account: instantBankSignIn() },
        save_default_payment_method: 'on_subscription',
      },
      metadata: { [STRIPE_CHURCH_METADATA_KEY]: church },
      expand: ['latest_invoice.confirmation_secret'],
    })
    return {
      clientSecret: expanded(subscription.latest_invoice)?.confirmation_secret?.client_secret ?? null,
    }
  },

  async restartPrices(customerId) {
    const customer = await client().customers.retrieve(customerId)
    return {
      monthCents: startingPrice('month').cents,
      yearCents: startingPrice('year').cents,
      creditCents: customer.deleted ? 0 : Math.max(0, -(customer.balance ?? 0)),
    }
  },

  async end(subscriptionId) {
    await client().subscriptions.cancel(subscriptionId)
  },
})
