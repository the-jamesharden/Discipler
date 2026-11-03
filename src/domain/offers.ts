import { EXPONENTIAL_OFFER, MONTHLY_PRICE_CENTS, TRIAL_DAYS, YEARLY_DISCOUNT_PERCENT } from './launch-terms'

/**
 * What Discipler sells, and which offer a church gets (Exponential launch, ticket 04).
 *
 * The numbers are `launch-terms.ts`'s, so the help docs and this cannot disagree. This
 * adds what Stripe needs to name them, and the rules: which offer wins, until when a
 * code works, and how the bills after the free days run.
 */

export type BillingCycle = 'month' | 'year'

const BILLING_CYCLES: readonly string[] = ['month', 'year'] satisfies BillingCycle[]

export const isBillingCycle = (value: unknown): value is BillingCycle =>
  typeof value === 'string' && BILLING_CYCLES.includes(value)

const yearlyCents = (monthlyCents: number): number =>
  (monthlyCents * 12 * (100 - YEARLY_DISCOUNT_PERCENT)) / 100

/** Fixed IDs, so creating the catalog twice finds it the second time. */
export const STRIPE_PRODUCT = {
  id: 'discipler_for_churches',
  name: 'Discipler for Churches',
} as const

export interface CatalogPrice {
  /** How the code finds the price, in whichever Stripe account it is running against. */
  readonly lookupKey: string
  readonly cents: number
  readonly cycle: BillingCycle
}

const priced = (name: string, monthlyCents: number): readonly CatalogPrice[] => [
  { lookupKey: `discipler_${name}_monthly`, cents: monthlyCents, cycle: 'month' },
  { lookupKey: `discipler_${name}_yearly`, cents: yearlyCents(monthlyCents), cycle: 'year' },
]

/** Every price there is. A church above the limit is moved by hand (ticket 14). */
export const STRIPE_PRICES: readonly CatalogPrice[] = [
  ...priced('up_to_the_limit', MONTHLY_PRICE_CENTS.upToTheLimit),
  ...priced('above_the_limit', MONTHLY_PRICE_CENTS.aboveTheLimit),
]

/** The price every church starts on, for the cycle it chose. */
export const startingPrice = (cycle: BillingCycle): CatalogPrice => {
  const price = STRIPE_PRICES.find(
    (candidate) => candidate.cycle === cycle && candidate.lookupKey.includes('up_to_the_limit'),
  )
  if (!price) throw new Error(`The catalog has no starting price for a ${cycle}`)
  return price
}

export type CatalogCoupon = {
  readonly id: string
  /** Stripe prints this on the church's invoices. */
  readonly name: string
} & ({ readonly percentOff: number } | { readonly centsOff: number })

/**
 * Every discount, which only ever applies inside a schedule's phase: the phase is what
 * says how long it lasts. So each is `forever` at Stripe, and none is a promotion code
 * a church could type at Stripe, since nothing of Stripe's asks for one.
 */
export const STRIPE_COUPONS = {
  exponentialYear: {
    id: 'discipler_exponential_special_offer',
    name: 'Exponential special offer',
    percentOff: EXPONENTIAL_OFFER.discountPercent,
  },
  firstMonth: { id: 'discipler_first_month_free', name: 'First paid month free', percentOff: 100 },
  // A yearly church's first bill is its whole year, so its free month is a twelfth of
  // that and not the whole bill.
  firstMonthOfAYear: {
    id: 'discipler_first_month_free_yearly',
    name: 'First paid month free',
    centsOff: yearlyCents(MONTHLY_PRICE_CENTS.upToTheLimit) / 12,
  },
  plantYear: { id: 'discipler_church_plant_year', name: 'Church plant year', percentOff: 100 },
} as const satisfies Record<string, CatalogCoupon>

/** The offer a Subscription was opened with. The plant year is added by approval, later. */
export type TrialOffer = 'none' | 'exponential' | 'referral'

/** Why a typed code did not apply. The church carries on either way. */
export type CodeRefusal = 'offer.code_expired' | 'offer.code_unknown'

/** The last day a code works, through its end, is a day in Pacific time. */
const pacificDay = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)

export interface OfferDecision {
  readonly offer: TrialOffer
  readonly codeRefusal: CodeRefusal | null
}

/**
 * Which offer a church gets. They do not stack, and a church gets whichever saves it
 * the most, which is always the Exponential special offer over a referral (spec,
 * Offers). A code that does not apply leaves a referral standing.
 */
export const offerFor = ({
  code,
  invited,
  at,
}: {
  readonly code: string
  readonly invited: boolean
  readonly at: Date
}): OfferDecision => {
  const typed = code.trim().toUpperCase()
  const otherwise: TrialOffer = invited ? 'referral' : 'none'

  if (typed === '') return { offer: otherwise, codeRefusal: null }
  if (typed !== EXPONENTIAL_OFFER.code) return { offer: otherwise, codeRefusal: 'offer.code_unknown' }
  if (pacificDay(at) > EXPONENTIAL_OFFER.lastDay) {
    return { offer: otherwise, codeRefusal: 'offer.code_expired' }
  }
  return { offer: 'exponential', codeRefusal: null }
}

export const trialDaysOf = (offer: TrialOffer): number =>
  offer === 'exponential' ? EXPONENTIAL_OFFER.trialDays : TRIAL_DAYS

/** One stretch of bills after the free days, as a Subscription Schedule's phase. */
export interface PaidPhase {
  /** A coupon from `STRIPE_COUPONS`, or null for the full price. */
  readonly couponId: string | null
  readonly interval: BillingCycle
  readonly intervals: number
}

/**
 * The bills after the free days, in order. Empty where there is nothing to schedule:
 * a Subscription with no offer simply bills.
 *
 * They are phases, because a coupon's months count from when it is applied, and the
 * free days would use them up (Stripe: "the 4-month period starting when the coupon is
 * first applied"). The months of a phase start at the first paid bill.
 *
 * The last phase is one bill at the full price. A Subscription released from a schedule
 * keeps what its last phase set, so it has to end on no discount, or the discount would
 * go on forever.
 */
export const paidPhasesOf = ({
  cycle,
  offer,
  plantYear,
}: {
  readonly cycle: BillingCycle
  readonly offer: TrialOffer
  readonly plantYear: boolean
}): readonly PaidPhase[] => {
  const oneYear = cycle === 'month' ? { interval: cycle, intervals: 12 } : { interval: cycle, intervals: 1 }
  const oneBill = { interval: cycle, intervals: 1 }

  const discounted: PaidPhase[] = []
  if (plantYear) discounted.push({ couponId: STRIPE_COUPONS.plantYear.id, ...oneYear })
  if (offer === 'exponential') discounted.push({ couponId: STRIPE_COUPONS.exponentialYear.id, ...oneYear })
  // A plant offer and a referral month do not combine, and the plant offer wins.
  if (offer === 'referral' && !plantYear) {
    const coupon = cycle === 'month' ? STRIPE_COUPONS.firstMonth : STRIPE_COUPONS.firstMonthOfAYear
    discounted.push({ couponId: coupon.id, ...oneBill })
  }

  return discounted.length === 0 ? [] : [...discounted, { couponId: null, ...oneBill }]
}

/** What the fingerprint rule allows one of, per card or bank account (spec, Security). */
export type FingerprintGrant = 'first_free_month' | 'plant_year'
