import type { StripeSubscriptionFacts } from '~/domain/billing'
import type { MinistryId } from '~/domain/ids'
import type { BillingCycle, PaidPhase } from '~/domain/offers'
import type { StripeBilling, StripeTrials } from '~/service/ports'

const unique = () => crypto.randomUUID().replaceAll('-', '')
const DAY_MS = 24 * 60 * 60 * 1000

/** A fake Stripe that keeps what it was asked to make, and is told what the Element did. */
export const aFakeStripe = (clock: { now(): Date }) => {
  const held = new Map<string, StripeSubscriptionFacts[]>()
  const secrets = new Map<string, string>()
  const fingerprints = new Map<string, string | null>()
  const calls = {
    customers: [] as { church: MinistryId; churchName: string; email: string | null }[],
    opened: [] as { customerId: string; church: MinistryId; cycle: BillingCycle; trialDays: number }[],
    canceled: [] as string[],
    scheduled: [] as { subscriptionId: string; phases: readonly PaidPhase[] }[],
    defaults: [] as string[],
    followedDefaults: [] as { customerId: string; subscriptionId: string }[],
    firstBills: [] as { customerId: string; subscriptionId: string; invoiceId: string }[],
  }
  const state = { failScheduling: false, failOpening: false }

  const customerOf = (subscriptionId: string): string | undefined =>
    [...held.entries()].find(([, subs]) => subs.some(({ id }) => id === subscriptionId))?.[0]

  const replace = (subscriptionId: string, changes: Partial<StripeSubscriptionFacts>) => {
    const customer = customerOf(subscriptionId)!
    held.set(
      customer,
      held.get(customer)!.map((sub) => (sub.id === subscriptionId ? { ...sub, ...changes } : sub)),
    )
  }

  const stripe: StripeBilling = {
    async subscriptionsOf(customerId) {
      return held.get(customerId) ?? []
    },
    async customerOfCharge() {
      return null
    },
  }

  const trials: StripeTrials = {
    async createCustomer(customer) {
      calls.customers.push(customer)
      return { id: `cus_${unique()}`, livemode: false }
    },
    async openTrial(trial) {
      if (state.failOpening) throw new Error('Stripe is down, about customer cus_secret')
      calls.opened.push(trial)
      const now = clock.now()
      const subscription: StripeSubscriptionFacts = {
        id: `sub_${unique()}`,
        status: 'trialing',
        awaitingPaymentMethod: true,
        // Each made a moment after the last, as Stripe's own clock would have it.
        createdAt: new Date(now.getTime() + calls.opened.length),
        priceId: trial.cycle === 'month' ? 'price_97' : 'price_931',
        latestInvoiceId: `in_${unique()}`,
        trialEndsAt: new Date(now.getTime() + trial.trialDays * DAY_MS),
        currentPeriodEndsAt: new Date(now.getTime() + trial.trialDays * DAY_MS),
        cancelsAt: null,
        namedChurch: trial.church,
      }
      const clientSecret = `seti_secret_${unique()}`
      secrets.set(subscription.id, clientSecret)
      held.set(trial.customerId, [...(held.get(trial.customerId) ?? []), subscription])
      return { subscription, clientSecret }
    },
    async setupSecretOf(subscriptionId) {
      return secrets.get(subscriptionId) ?? null
    },
    async cancelUnconfirmed(subscriptionId) {
      calls.canceled.push(subscriptionId)
      replace(subscriptionId, { status: 'canceled' })
    },
    async confirmDefaultPaymentMethod(subscriptionId) {
      calls.defaults.push(subscriptionId)
      return { fingerprint: fingerprints.get(subscriptionId) ?? null }
    },
    async followCustomersDefault(customerId, subscriptionId) {
      calls.followedDefaults.push({ customerId, subscriptionId })
      return false
    },
    async firstBillSetsCustomersDefault(customerId, subscriptionId, invoiceId) {
      calls.firstBills.push({ customerId, subscriptionId, invoiceId })
      return false
    },
    async schedulePhases(subscriptionId, phases) {
      if (state.failScheduling) throw new Error('Stripe is down')
      calls.scheduled.push({ subscriptionId, phases })
    },
  }

  return {
    held,
    calls,
    state,
    fingerprints,
    stripe,
    trials,
    /** What the Payment Element does when a church presses "Start my free trial". */
    confirm(subscriptionId: string, fingerprint: string | null = `fp_${unique()}`) {
      fingerprints.set(subscriptionId, fingerprint)
      secrets.delete(subscriptionId)
      replace(subscriptionId, { awaitingPaymentMethod: false })
    },
    set: replace,
  }
}
