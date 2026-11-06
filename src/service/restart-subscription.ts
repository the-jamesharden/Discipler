import { isConfirmedAndLive, type StripeSubscriptionFacts } from '~/domain/billing'
import type { MinistryId } from '~/domain/ids'
import type { BillingCycle } from '~/domain/offers'
import { everBegan } from './open-trial'
import type { BillingRecords, StripeAccount, StripeBilling } from './ports'

/**
 * Restarting a church whose subscription ended (Exponential launch, ticket 33): a new
 * Subscription billed today, at the normal price of the cycle it chooses. "Every offer ends
 * with its subscription" (spec), so no trial, no offer, no schedule, and no `trial_opening`
 * row, which is also why a church plant cannot be approved onto it (ticket 19).
 *
 * Opening unlocks nothing, as with a trial. Access comes back when the webhook reads a
 * Subscription that is live, and until then the church is what it was.
 */
export interface RestartWork {
  readonly records: BillingRecords
  readonly stripe: StripeBilling
  readonly account: Pick<StripeAccount, 'openRestart' | 'end'>
}

export type RestartRefusal =
  /** Billed by hand: it has nothing to restart. */
  | 'restart.outside_stripe'
  /** It never had a Subscription that began, so the payment step is its way in, with its trial. */
  | 'restart.never_began'
  /** It has one that is live, and the webhook may not have said so yet. */
  | 'restart.already_paying'

export type RestartOpened =
  /** A null secret is nothing to pay: credit covered it, and the webhook is on its way. */
  | { readonly clientSecret: string | null }
  | { readonly refusal: RestartRefusal }

const stillWaitingForItsFirstPayment = (subscription: StripeSubscriptionFacts): boolean =>
  subscription.status === 'incomplete'

/** Stripe goes on billing these, and a church must not hold one beside a new Subscription. */
const stillMakingBills = (subscription: StripeSubscriptionFacts): boolean =>
  subscription.status === 'unpaid' || subscription.status === 'paused'

export const restartSubscription = async (
  { records, stripe, account }: RestartWork,
  church: MinistryId,
  cycle: BillingCycle,
): Promise<RestartOpened> => {
  const billing = await records.of(church)
  if (billing.state.standing === 'outside_stripe') return { refusal: 'restart.outside_stripe' }
  const { customerId } = billing
  if (!customerId) return { refusal: 'restart.never_began' }

  // In the church's billing lock, so a double click makes one Subscription.
  return records.establish(church, async (unit): Promise<RestartOpened> => {
    const held = await stripe.subscriptionsOf(customerId)
    if (held.some(isConfirmedAndLive)) return { refusal: 'restart.already_paying' }

    const past = held.filter((subscription) => !stillWaitingForItsFirstPayment(subscription))
    let began = false
    for (const subscription of past) {
      if (subscription.status !== 'incomplete_expired' && (await everBegan(unit, subscription))) began = true
    }
    if (!began) return { refusal: 'restart.never_began' }

    for (const subscription of held.filter(stillMakingBills)) await account.end(subscription.id)

    return account.openRestart({
      customerId,
      church,
      cycle,
      waiting: held.filter(stillWaitingForItsFirstPayment),
    })
  })
}
