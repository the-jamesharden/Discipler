import { isConfirmedAndLive, type StripeSubscriptionFacts } from '~/domain/billing'
import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import {
  offerFor,
  trialDaysOf,
  type BillingCycle,
  type CodeRefusal,
  type TrialOffer,
} from '~/domain/offers'
import type { BillingRecords, BillingUnit, StripeBilling, StripeTrials, TrialOpening } from './ports'

/**
 * Opening a church's trial (Exponential launch, ticket 04): the Subscription the
 * Payment Element then confirms the setup intent of.
 *
 * Everything about the church is the server's. Who it is comes from the session, the
 * customer from the church's own record, whether it was invited from Discipler's own
 * record, the price and the free days from the catalog. The browser says monthly or
 * yearly, and what code was typed.
 *
 * Opening unlocks nothing. The Subscription it makes counts for no access until Stripe
 * says its setup intent was confirmed, through the webhook, like everything else.
 */

/** Whether another church invited this one (tickets 17, 20 and 32). */
export interface Invitations {
  wasInvited(church: MinistryId): Promise<boolean>
}

export interface TrialWork {
  readonly records: BillingRecords
  readonly stripe: StripeBilling
  readonly trials: StripeTrials
  readonly invitations: Invitations
  readonly clock: Clock
}

export interface TrialRequest {
  readonly church: MinistryId
  readonly churchName: string
  readonly adminEmail: string | null
  readonly cycle: BillingCycle
  /** What was typed or carried by a link, as it came. An empty string is none. */
  readonly code: string
}

export type TrialRefusal =
  /** It has a card or bank account behind it, and is on its way. */
  | 'payment.already_paying'
  /** Billed by hand: it never needed this. */
  | 'payment.outside_stripe'
  /** It had a Subscription that ended. Restarting has no trial and no offer (ticket 33). */
  | 'payment.restart'

export type TrialOpened =
  | {
      readonly clientSecret: string
      readonly trialEndsAt: Date
      readonly offer: TrialOffer
      readonly codeRefusal: CodeRefusal | null
    }
  | { readonly refusal: TrialRefusal }

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A Subscription still waiting for a card is handed back only while it still gives
 * what opening a new one would. A church that left and came back days later would
 * otherwise get fewer free days than it was promised, and one that came back with a
 * different choice would get the old one.
 */
const stillGivesTheSame = (
  waiting: StripeSubscriptionFacts,
  opening: TrialOpening | null,
  wanted: { readonly cycle: BillingCycle; readonly offer: TrialOffer; readonly endsAt: Date },
): boolean =>
  opening !== null &&
  opening.cycle === wanted.cycle &&
  opening.offer === wanted.offer &&
  waiting.trialEndsAt !== null &&
  wanted.endsAt.getTime() - waiting.trialEndsAt.getTime() < DAY_MS

const awaitingNow = (subscription: StripeSubscriptionFacts): boolean =>
  subscription.status === 'trialing' && subscription.awaitingPaymentMethod

/**
 * Whether a Subscription that is not live was ever a real one, which is what stands
 * between a church and a second trial. One that only ever waited for a card, and ran
 * out or was replaced here, was not: Stripe's word for that is the setup intent still
 * sitting there, and Discipler's own is an opening that was never settled, which holds
 * even if Stripe should clear that field once the setup intent is canceled.
 */
const everBegan = async (
  unit: BillingUnit,
  subscription: StripeSubscriptionFacts,
): Promise<boolean> => {
  if (subscription.awaitingPaymentMethod) return false
  const opening = await unit.openingOf(subscription.id)
  return opening === null || opening.settled
}

const reuseOrOpen = async (
  { stripe, trials, clock }: TrialWork,
  unit: BillingUnit,
  customerId: string,
  request: TrialRequest,
  offer: TrialOffer,
  codeRefusal: CodeRefusal | null,
): Promise<TrialOpened> => {
  const held = await stripe.subscriptionsOf(customerId)

  if (held.some(isConfirmedAndLive)) return { refusal: 'payment.already_paying' }
  for (const subscription of held) {
    if (await everBegan(unit, subscription)) return { refusal: 'payment.restart' }
  }

  const days = trialDaysOf(offer)
  const wanted = {
    cycle: request.cycle,
    offer,
    endsAt: new Date(clock.now().getTime() + days * DAY_MS),
  }

  let reusable: { readonly subscription: StripeSubscriptionFacts; readonly clientSecret: string } | null = null
  for (const waiting of held.filter(awaitingNow)) {
    const secret = stillGivesTheSame(waiting, await unit.openingOf(waiting.id), wanted)
      ? await trials.setupSecretOf(waiting.id)
      : null
    if (secret && !reusable) reusable = { subscription: waiting, clientSecret: secret }
    else await trials.cancelUnconfirmed(waiting.id)
  }

  const trial =
    reusable ??
    (await trials.openTrial({
      customerId,
      church: request.church,
      cycle: request.cycle,
      trialDays: days,
    }))
  if (!reusable) {
    await unit.recordOpening(
      { subscriptionId: trial.subscription.id, cycle: request.cycle, offer },
      clock.now(),
    )
  }

  const trialEndsAt = trial.subscription.trialEndsAt
  if (!trialEndsAt) throw new Error('A trial Subscription came back with no end to its trial')

  return { clientSecret: trial.clientSecret, trialEndsAt, offer, codeRefusal }
}

export const openTrial = async (work: TrialWork, request: TrialRequest): Promise<TrialOpened> => {
  const { records, trials, invitations, clock } = work
  const billing = await records.of(request.church)
  if (billing.state.standing === 'outside_stripe') return { refusal: 'payment.outside_stripe' }

  const { offer, codeRefusal } = offerFor({
    code: request.code,
    invited: await invitations.wasInvited(request.church),
    at: clock.now(),
  })

  // Before the lock, as `rememberCustomer` is its own unit of work. A double click may
  // make a second Customer here; the first stands and the second is never used.
  const customerId =
    billing.customerId ??
    (await (async () => {
      const made = await trials.createCustomer({
        church: request.church,
        churchName: request.churchName,
        email: request.adminEmail,
      })
      return records.rememberCustomer(request.church, made.id, made.livemode)
    })())

  // In the church's billing lock, so a double click opens one Subscription: the second
  // waits, reads the first, and is handed it.
  return records.establish(request.church, (unit) =>
    reuseOrOpen(work, unit, customerId, request, offer, codeRefusal),
  )
}
