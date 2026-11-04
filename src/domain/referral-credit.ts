import type { BillingStanding } from './billing'
import { MONTHLY_PRICE_CENTS, REFERRAL_CREDIT_HELD_DAYS } from './launch-terms'

/**
 * The month free a church earns when a church it invited pays its first real bill
 * (Exponential launch, ticket 32). What decides it, with Stripe and the database behind
 * ports: `src/service/referral-credits.ts` is what acts on it.
 */

/** What the customer's balance transaction says, which is what shows on Stripe's invoice. */
export const REFERRAL_CREDIT_DESCRIPTION = 'Referral credit'

/**
 * What the inviting church's own history records, each with the opaque referral ID and
 * nothing else. No page lists them, and an applied credit shows on Billing.
 */
export const REFERRAL_EVENTS = {
  signedUp: 'referral.signed_up',
  paying: 'referral.paying',
  creditApplied: 'referral.credit_applied',
} as const

const DAY_MS = 24 * 60 * 60 * 1000

/** When a credit earned by this payment comes due. */
export const referralCreditHeldUntil = (paidAt: Date): Date =>
  new Date(paidAt.getTime() + REFERRAL_CREDIT_HELD_DAYS * DAY_MS)

/** An invoice, as re-read from Stripe. */
export interface PaidInvoiceFacts {
  readonly customerId: string | null
  readonly paid: boolean
  readonly amountPaidCents: number
  readonly paidAt: Date | null
  /** The charge that paid it, or null where nothing was charged at Stripe. */
  readonly chargeId: string | null
}

/**
 * Only an invoice somebody really paid. A trial's $0 invoice and a free month's do not
 * count, and neither does an invoice that is not the customer's.
 */
export const earnsAReferralCredit = (invoice: PaidInvoiceFacts, customerId: string): boolean =>
  invoice.customerId === customerId && invoice.paid && invoice.amountPaidCents > 0

/** A charge, as re-read from Stripe. */
export interface ChargeFacts {
  /** Refunded in whole or in part, or disputed, whichever way the dispute ended. */
  readonly takenBack: boolean
  /** The card's or the bank account's, or null for a method with none. */
  readonly fingerprint: string | null
}

export type ReferralCreditCancelled = 'payment_taken_back' | 'inviting_church_gone'

export type ReferralCreditReview =
  | 'billed_outside_stripe'
  | 'no_live_subscription'
  | 'unknown_price'
  | 'no_charge'
  | 'same_customer'
  | 'shared_payment'
  | 'shared_email_domain'

const CAN_BE_CREDITED: ReadonlySet<BillingStanding> = new Set(['trialing', 'active', 'past_due'])

/**
 * Why Stripe cannot be given this credit at all, from what the inviting church is. A church
 * billed outside Stripe settles by hand (James, triage 2026-10-31). A church with nothing
 * running has no next bill for it to come off.
 */
export const whyTheInviterCannotBeCredited = (inviter: {
  readonly standing: BillingStanding
  readonly customerId: string | null
}): ReferralCreditReview | null => {
  if (inviter.standing === 'outside_stripe') return 'billed_outside_stripe'
  if (!inviter.customerId || !CAN_BE_CREDITED.has(inviter.standing)) return 'no_live_subscription'
  return null
}

/** What may say two churches are one, as each is at the moment the credit comes due. */
export interface ChurchLikeness {
  readonly customerId: string | null
  /** Every card and bank account it holds or paid with. */
  readonly fingerprints: readonly string[]
  /** Its Stripe customer's and its Admins' email addresses. */
  readonly emails: readonly string[]
}

export const emailDomainOf = (address: string): string | null => {
  const at = address.lastIndexOf('@')
  const domain = at === -1 ? '' : address.slice(at + 1).trim().toLowerCase()
  return domain === '' ? null : domain
}

const domainsOf = (emails: readonly string[]): ReadonlySet<string> =>
  new Set(emails.flatMap((email) => emailDomainOf(email) ?? []))

/**
 * Whether the two churches look like one, in which case James decides. Any shared domain
 * counts, a shared `gmail.com` too: the spec says "an email domain", and a credit in
 * review is only delayed, where a credit wrongly given has left the building.
 */
export const whyTheyLookLikeOne = (
  inviting: ChurchLikeness,
  invited: ChurchLikeness,
): ReferralCreditReview | null => {
  if (inviting.customerId !== null && inviting.customerId === invited.customerId) return 'same_customer'
  if (inviting.fingerprints.some((print) => invited.fingerprints.includes(print))) return 'shared_payment'
  const theirs = domainsOf(invited.emails)
  if ([...domainsOf(inviting.emails)].some((domain) => theirs.has(domain))) return 'shared_email_domain'
  return null
}

/**
 * One month of the inviting church's own price, from the price's lookup key: $97 or $147,
 * and the same for a church that bills yearly (Q79), as mock-up 5 draws $97 for a church
 * paying $77.60. Null for a price the catalog does not hold, which James decides.
 */
export const referralCreditCents = (lookupKey: string | null): number | null => {
  if (lookupKey?.startsWith('discipler_up_to_the_limit_')) return MONTHLY_PRICE_CENTS.upToTheLimit
  if (lookupKey?.startsWith('discipler_above_the_limit_')) return MONTHLY_PRICE_CENTS.aboveTheLimit
  return null
}
