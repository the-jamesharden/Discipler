import type { SubscriptionStatus } from './billing'
import type { BillingCycle } from './offers'

/**
 * A church's plan as Stripe says it is right now, for Billing and the trial-ending email
 * (Exponential launch, ticket 33). Read on the server and never stored: what Discipler
 * keeps is Stripe's IDs, and the money and the card are Stripe's to say each time.
 */

/**
 * What it pays with. A `link` method says nothing about the card or bank behind it, so
 * there is no brand, last four or expiry to show, and whatever reads this has to be right
 * without them. `other` is anything else Stripe may hold.
 */
export type PaymentMethodOnFile =
  | {
      readonly kind: 'card'
      readonly brand: string
      readonly last4: string
      readonly expMonth: number
      readonly expYear: number
    }
  | {
      readonly kind: 'bank'
      readonly bankName: string | null
      readonly accountType: string | null
      readonly last4: string | null
    }
  | { readonly kind: 'link' }
  | { readonly kind: 'other' }

export type OfferKind = 'exponential' | 'plant_year' | 'first_free_month'

export interface OfferInForce {
  readonly kind: OfferKind
  readonly endsAt: Date
}

export interface BillingPicture {
  readonly subscriptionId: string
  /** Whether its bills run through a Subscription Schedule, which Stripe's billing page will not cancel. */
  readonly onASchedule: boolean
  readonly status: SubscriptionStatus
  readonly cycle: BillingCycle
  readonly priceCents: number
  readonly aboveTheLimit: boolean
  /** Its free days, while it is on them. */
  readonly trial: { readonly days: number; readonly endsAt: Date } | null
  /** Null where nothing more will be billed: it is ending, it has ended, or it is past due. */
  readonly nextPayment: {
    /** What will be taken, after any credit. */
    readonly cents: number
    /** The bill before any credit. */
    readonly fullCents: number
    readonly at: Date
  } | null
  readonly cancelsAt: Date | null
  readonly endedAt: Date | null
  /** In the order they run. */
  readonly offers: readonly OfferInForce[]
  /** Credit on the customer's balance now, and what will be left after the next bill. */
  readonly creditCents: number
  readonly creditLeftCents: number
  readonly method: PaymentMethodOnFile | null
  /** The payment Stripe is retrying. */
  readonly failed: {
    readonly cents: number
    readonly on: Date
    readonly retriesOn: Date | null
  } | null
}

/** One past bill, as the table lists it. */
export interface PastBill {
  readonly at: Date
  readonly what: 'free_trial' | 'month' | 'year'
  readonly cents: number
  /** `processing` is a bank debit on its way, which takes days. */
  readonly status: 'paid' | 'processing' | 'not_paid'
  /** Stripe's page for it, which can download the PDF. */
  readonly viewAt: string | null
}

const BRANDS: Readonly<Record<string, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
}

export const brandName = (brand: string): string => BRANDS[brand] ?? 'Card'

/** "$77.60", always with the cents, as a bill says it. */
export const moneyOf = (cents: number): string => `$${(cents / 100).toFixed(2)}`

/** "$97" or "$931.20", as a price is said. */
export const priceOf = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : moneyOf(cents)

/** The method in a few words, as the Billing card and the email say it. */
export const methodInWords = (method: PaymentMethodOnFile | null): string => {
  switch (method?.kind) {
    case 'card':
      return `${brandName(method.brand)} ending ${method.last4}`
    case 'bank': {
      const name = [method.bankName, method.accountType].filter(Boolean).join(' ')
      const bank = name === '' ? 'Bank account' : name
      return method.last4 ? `${bank} ending ${method.last4}` : bank
    }
    case 'link':
      return 'Link'
    case 'other':
      return 'Payment method on file'
    default:
      return 'No payment method on file'
  }
}

const dateIn = (timeZone: string, options: Intl.DateTimeFormatOptions) => (at: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(at)

/** "December 30, 2026", on the church's clock. */
export const longDate = (at: Date, timeZone: string): string =>
  dateIn(timeZone, { month: 'long', day: 'numeric', year: 'numeric' })(at)

/** "December 30". */
export const monthAndDay = (at: Date, timeZone: string): string =>
  dateIn(timeZone, { month: 'long', day: 'numeric' })(at)

/** "Dec 30, 2026". */
export const shortDate = (at: Date, timeZone: string): string =>
  dateIn(timeZone, { month: 'short', day: 'numeric', year: 'numeric' })(at)

/** "December". */
export const monthName = (at: Date, timeZone: string): string =>
  dateIn(timeZone, { month: 'long' })(at)

/** "December 2026". */
export const monthAndYear = (at: Date, timeZone: string): string =>
  dateIn(timeZone, { month: 'long', year: 'numeric' })(at)

/** The month after the one this falls in: "April". */
export const startOfNextMonthName = (at: Date, timeZone: string): string => {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .format(at)
    .split('-')
    .map(Number) as [number, number]
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 15)))
}
