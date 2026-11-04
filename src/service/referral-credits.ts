import type { StripeInboxEntry } from '~/domain/billing'
import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import {
  earnsAReferralCredit,
  referralCreditCents,
  referralCreditHeldUntil,
  whyTheInviterCannotBeCredited,
  whyTheyLookLikeOne,
  type ReferralCreditReview,
} from '~/domain/referral-credit'
import type {
  BillingRecords,
  ChurchBilling,
  DueReferralCredit,
  ReferralCreditRecords,
  StripeCredits,
  SupportAlerts,
} from './ports'

/**
 * The referral credit, from the invited church's first real payment to a line on the
 * inviting church's next bill (Exponential launch, ticket 32).
 *
 * **Earned by the webhook's processing, decided by the tick.** The invited church's first
 * invoice with a real amount writes one row and starts the hold. A refund or a dispute in
 * that time cancels it. When the hold is over the tick decides once, reading everything
 * again from Stripe, so an event that never arrived cannot leave a refunded payment earning
 * a month.
 *
 * **Discipler's own table is what makes it once.** The row says `applying`, with its amount,
 * before Stripe is called. A retry then looks at the customer's balance for a transaction
 * naming this credit, and only makes one if there is none. Stripe's idempotency key is kept
 * too, for two calls close together, but it lasts a day and a retry may come later than
 * that.
 */
export interface ReferralCreditWork {
  readonly credits: ReferralCreditRecords
  readonly billing: Pick<BillingRecords, 'of'>
  readonly stripe: StripeCredits
  readonly alerts: Pick<SupportAlerts, 'referralCreditForReview'>
  readonly clock: Clock
}

/** How long one attempt holds a credit, comfortably past a function's time limit. */
export const REFERRAL_CREDIT_LEASE_MS = 5 * 60 * 1000

/** The most one pass takes on, so a backlog cannot eat a tick. */
export const REFERRAL_CREDITS_PER_SWEEP = 50

/**
 * What one Stripe event means for a credit. It asks Stripe only about a church that was
 * invited and has yet to earn, or a charge a held credit rests on, so every other church's
 * event costs one read of Discipler's own table. Safe to run twice: `earn` writes once.
 */
export const creditOnStripeEvent = async (
  { credits, stripe, clock }: ReferralCreditWork,
  entry: StripeInboxEntry,
  church: MinistryId,
  customerId: string,
): Promise<void> => {
  if (entry.type === 'invoice.paid' && entry.invoiceId) {
    const referralId = await credits.referralYetToEarn(church)
    if (!referralId) return

    const invoice = await stripe.invoice(entry.invoiceId)
    if (!invoice || !earnsAReferralCredit(invoice, customerId)) return

    const paidAt = invoice.paidAt ?? entry.occurredAt
    await credits.earn({
      referralId,
      invoiceId: entry.invoiceId,
      chargeId: invoice.chargeId,
      paidAt,
      heldUntil: referralCreditHeldUntil(paidAt),
      at: clock.now(),
    })
    return
  }

  if ((entry.type === 'charge.refunded' || entry.type === 'charge.dispute.created') && entry.chargeId) {
    const held = await credits.heldForCharge(entry.chargeId)
    if (!held) return

    // The event says where to look, as every event does, and the charge says what is true.
    const charge = await stripe.charge(entry.chargeId)
    if (charge.takenBack) await credits.cancel(held, 'payment_taken_back', clock.now())
  }
}

type Decision =
  | { readonly apply: number }
  | { readonly cancel: 'payment_taken_back' | 'inviting_church_gone' }
  | { readonly review: ReferralCreditReview }

/** What is true now, once the hold is over. Reads only, so a failure here changes nothing. */
const decide = async (
  { stripe, credits }: ReferralCreditWork,
  credit: DueReferralCredit,
  inviter: ChurchBilling | null,
  invited: ChurchBilling,
): Promise<Decision> => {
  if (!credit.invitingChurch || !inviter) return { cancel: 'inviting_church_gone' }

  const paidWith = credit.chargeId ? await stripe.charge(credit.chargeId) : null
  if (paidWith?.takenBack) return { cancel: 'payment_taken_back' }

  const cannot = whyTheInviterCannotBeCredited({
    standing: inviter.state.standing,
    customerId: inviter.customerId,
  })
  if (cannot) return { review: cannot }

  // Nothing to check a refund against, so nothing to be sure of.
  if (!paidWith) return { review: 'no_charge' }

  const likenessOf = async (church: MinistryId, billing: ChurchBilling, extra: readonly string[]) => {
    const customer = billing.customerId
      ? await stripe.customer(billing.customerId)
      : { email: null, fingerprints: [] }
    return {
      customerId: billing.customerId,
      fingerprints: [...customer.fingerprints, ...extra],
      emails: [...(customer.email ? [customer.email] : []), ...(await credits.adminEmails(church))],
    }
  }
  const lookLikeOne = whyTheyLookLikeOne(
    await likenessOf(credit.invitingChurch, inviter, []),
    await likenessOf(credit.invitedChurch, invited, paidWith.fingerprint ? [paidWith.fingerprint] : []),
  )
  if (lookLikeOne) return { review: lookLikeOne }

  const cents = referralCreditCents(inviter.priceId ? await stripe.lookupKeyOfPrice(inviter.priceId) : null)
  return cents === null ? { review: 'unknown_price' } : { apply: cents }
}

const applyAtStripe = async (
  { credits, stripe, clock }: ReferralCreditWork,
  creditId: string,
  customerId: string,
  cents: number,
): Promise<void> => {
  const transaction =
    (await stripe.appliedCredit(customerId, creditId)) ??
    (await stripe.applyCredit({ customerId, creditId, cents }))
  await credits.markApplied(creditId, transaction, clock.now())
}

/** Answers what became of it, or null where another pass has it. */
const settle = async (
  work: ReferralCreditWork,
  credit: DueReferralCredit,
): Promise<'applied' | 'cancelled' | 'in_review' | null> => {
  const { credits, billing, alerts, clock } = work
  if (!(await credits.lease(credit.id, clock.now(), REFERRAL_CREDIT_LEASE_MS))) return null

  const inviter = credit.invitingChurch ? await billing.of(credit.invitingChurch) : null

  // Decided on an earlier pass, whose call to Stripe may or may not have landed. The
  // amount is the one decided then, whatever has changed since.
  if (credit.state === 'applying') {
    if (!inviter?.customerId || credit.amountCents === null) {
      throw new Error('A referral credit being applied has no customer or no amount')
    }
    await applyAtStripe(work, credit.id, inviter.customerId, credit.amountCents)
    return 'applied'
  }

  const invited = await billing.of(credit.invitedChurch)
  const decision = await decide(work, credit, inviter, invited)

  if ('cancel' in decision) {
    await credits.cancel(credit.id, decision.cancel, clock.now())
    return 'cancelled'
  }

  if ('review' in decision) {
    // Told first and marked after: an email that did not go leaves the credit due, and the
    // next pass says it again under the same key.
    await alerts.referralCreditForReview({
      creditId: credit.id,
      referralId: credit.referralId,
      because: decision.review,
      invitingChurchName: credit.invitingChurchName ?? 'The inviting church',
      invitedChurchName: credit.invitedChurchName,
      invitingCustomerId: inviter?.customerId ?? null,
      invitedCustomerId: invited.customerId,
      paidAt: credit.paidAt,
    })
    await credits.sendToReview(credit.id, decision.review, clock.now())
    return 'in_review'
  }

  await credits.decideToApply(credit.id, decision.apply)
  await applyAtStripe(work, credit.id, inviter!.customerId!, decision.apply)
  return 'applied'
}

export interface ReferralCreditSweep {
  readonly applied: number
  readonly cancelled: number
  readonly inReview: number
  readonly failed: number
}

/**
 * The tick's pass over every credit whose hold is over. One at a time and each caught,
 * logged by the credit's ID and the error's name alone, because the logs carry no Stripe
 * detail and one credit that will not settle is no reason to hold back the others.
 */
export const sweepReferralCredits = async (work: ReferralCreditWork): Promise<ReferralCreditSweep> => {
  const swept = { applied: 0, cancelled: 0, inReview: 0, failed: 0 }

  for (const credit of await work.credits.due(work.clock.now(), REFERRAL_CREDITS_PER_SWEEP)) {
    try {
      const settled = await settle(work, credit)
      if (settled === 'applied') swept.applied += 1
      if (settled === 'cancelled') swept.cancelled += 1
      if (settled === 'in_review') swept.inReview += 1
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown'
      console.error(`Settling referral credit ${credit.id} failed: ${name}`)
      swept.failed += 1
    }
  }

  return swept
}
