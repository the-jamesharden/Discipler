import {
  brandName,
  longDate,
  methodInWords,
  moneyOf,
  monthAndDay,
  monthAndYear,
  monthName,
  priceOf,
  shortDate,
  startOfNextMonthName,
  type BillingPicture,
  type OfferInForce,
  type PastBill,
  type PaymentMethodOnFile,
} from '~/domain/billing-picture'
import { EXPONENTIAL_OFFER, MONTHLY_PRICE_CENTS, PEOPLE_ON_THE_FIRST_PRICE, YEARLY_DISCOUNT_PERCENT } from '~/domain/launch-terms'
import { startingPrice } from '~/domain/offers'

/**
 * Billing's words (Exponential launch, ticket 33). What the mock-up draws
 * (`.lavish/refer-billing/`) is James's, word for word. What it does not is marked draft
 * here, and listed in `docs/open-questions.md` for him.
 */
export const BILLING = {
  title: 'Billing',
  lede: (church: string) => `${church}'s plan with Discipler. Any Admin can change it.`,
  back: 'Settings',
  yourPlan: 'Your plan',
  paymentMethod: 'Payment method',
  pastBills: 'Past bills',
  columns: { date: 'Date', what: 'What', amount: 'Amount', status: 'Status' },
  view: 'View',
  viewFine: 'View opens the bill on Stripe, where it can be downloaded as a PDF.',
  update: 'Update payment method',
  cancel: 'Cancel subscription',
  keep: 'Keep my subscription',
  restart: 'Restart Discipler',
  open: 'Open billing',
  opens: "These open Stripe's secure billing page, then bring you back here.",
  bankLine: 'To use a different bank account, email support@trydiscipler.com.',
  bankSignIn: 'Connected by bank sign-in',
  endsOn: (date: string) => `Your subscription ends on ${date}.`,
  endsNote: 'Check-ins keep going until then. After that they stop, and everything stays here to read.',
  failed: (amount: string, on: string) => `Your payment of ${amount} on ${on} didn't go through.`,
  retries: (on: string) => `Stripe tries again on ${on}. Everything keeps running in the meantime.`,
  banner: {
    due: "Your last payment didn't go through.",
    dueRest: 'Discipler keeps running while Stripe tries again.',
    ended: 'Your subscription has ended.',
    endedRest: 'Check-ins have stopped and these pages are read-only. Everything is still here.',
  },

  // Drafts inside the approved screen, for James at review.
  opensForASchedule: "Update payment method opens Stripe's secure billing page, then brings you back here.",
  askCancel: {
    question: (date: string) => `Cancel your subscription? It would end on ${date}.`,
    rest: 'Check-ins keep going until then. After that they stop, and everything stays here to read.',
    yes: 'Yes, cancel my subscription',
    no: 'Never mind',
  },
  retriesUnknown: 'Everything keeps running in the meantime.',
  noMethod: 'No payment method on file',
  couldNotRead: "We couldn't load your plan from Stripe just now. Please try again in a moment.",
  couldNotOpen: "We couldn't open Stripe's billing page just now. Please try again in a moment.",
  noSubscription: 'No subscription yet',
  finishSignUp: 'Finish setting up',
  noBills: 'No bills yet.',
  endedNote: 'Check-ins have stopped. Everything is still here.',
} as const

export const RESTART = {
  title: 'Restart Discipler',
  lede: (day: string, time: string) =>
    `Your people, relationships and history are all still here. Check-ins start again on your next check-in day, ${day} at ${time}.`,
  legend: 'How would you like to pay?',
  monthly: 'Monthly',
  yearly: 'Yearly',
  save: `Save ${YEARLY_DISCOUNT_PERCENT}%`,
  methodHint: 'Use the card or bank account on file, or add another.',
  submit: 'Restart my subscription',
  underTheButton: "You'll be charged today. You can change or cancel any time in Settings, Billing.",
  // Drafts inside the approved screen, for James at review.
  finishing: 'Restarting Discipler...',
  takingLonger: 'This is taking longer than usual.',
  goToBilling: 'Go to Billing',
  didNotGoThrough: "That didn't go through, and you weren't charged. Please try again.",
  couldNotCharge: "We couldn't charge that just now. Please try again, or use another card or bank account.",
  noStripe: "We can't take a payment here just now. Please try again in a moment.",
  creditCovers: 'Your referral credit covers today, so nothing is charged.',
  creditTaken: (amount: string) => `Your referral credit takes ${amount} off today.`,
  underTheButtonCovered: 'You can change or cancel any time in Settings, Billing.',
} as const

const PEOPLE = PEOPLE_ON_THE_FIRST_PRICE

export const monthlyPriceWords = priceOf(startingPrice('month').cents)
export const yearlyPriceWords = priceOf(startingPrice('year').cents)
/** Twelve monthly payments, struck through beside the yearly price: "$1,164". */
export const twelveMonthlyWords = `$${((MONTHLY_PRICE_CENTS.upToTheLimit * 12) / 100).toLocaleString('en-US')}`

const cycleWord = (picture: BillingPicture): string => (picture.cycle === 'month' ? 'monthly' : 'yearly')

const everyCycle = (picture: BillingPicture): string =>
  `${priceOf(picture.priceCents)} a ${picture.cycle}`

const OFFER_NAME = {
  exponential: 'Exponential special offer',
  plant_year: 'Church plant year',
  first_free_month: 'First month free',
} as const

const offerNote = (offer: OfferInForce, timeZone: string): string => {
  const until = longDate(offer.endsAt, timeZone)
  switch (offer.kind) {
    case 'exponential':
      return `${EXPONENTIAL_OFFER.discountPercent}% off your first year, through ${until}`
    case 'plant_year':
      return `Free for your first year, through ${until}`
    default:
      return `Your first paid month is free, through ${until}`
  }
}

/**
 * The offer the next bill falls under. Not simply the first: a church plant approved after a
 * paid bill still has the phase it is paying in, which ends on the day of that next bill.
 */
const offerOnTheNextBill = (picture: BillingPicture): OfferInForce | undefined => {
  const next = picture.nextPayment
  return next ? picture.offers.find((offer) => offer.endsAt > next.at) : picture.offers[0]
}

/** How the next bill is made up, under its amount. */
const billNote = (picture: BillingPicture): string => {
  const next = picture.nextPayment
  if (next && next.cents !== next.fullCents) return `${moneyOf(next.fullCents)}, less your referral credit`
  const offer = offerOnTheNextBill(picture)?.kind
  if (offer === 'exponential') return `${everyCycle(picture)}, ${EXPONENTIAL_OFFER.discountPercent}% off your first year`
  if (offer === 'plant_year') return `Free for your church plant year, then ${everyCycle(picture)}`
  if (offer === 'first_free_month') return `${everyCycle(picture)}, less your first month free`
  return everyCycle(picture)
}

const trialNote = (picture: BillingPicture): string =>
  picture.offers.some(({ kind }) => kind === 'exponential')
    ? `${picture.trial?.days} days free with the Exponential special offer`
    : `${picture.trial?.days} days free`

export interface PlanRow {
  readonly label: string
  /** Bold: the fact itself. */
  readonly strong?: string
  /** Plain, after the bold. */
  readonly then?: string
  /** A pill, for an offer. */
  readonly pill?: string
  /** Muted, on the line under it. */
  readonly note?: string
}

const creditRow = (picture: BillingPicture, timeZone: string): PlanRow | null => {
  if (picture.creditCents <= 0) return null
  const left = picture.creditLeftCents
  const next = picture.nextPayment
  const leftFor =
    picture.cycle === 'month' && next ? startOfNextMonthName(next.at, timeZone) : 'your next bill'
  return {
    label: 'Credit',
    strong: moneyOf(picture.creditCents),
    then: ' from a church you invited',
    note:
      left > 0 && next
        ? `Taken off your next bills automatically; ${moneyOf(left)} is left for ${leftFor}`
        : 'Taken off your next bills automatically',
  }
}

const offerRows = (picture: BillingPicture, timeZone: string): readonly PlanRow[] =>
  picture.offers.map((offer) => ({
    label: 'Offer',
    pill: OFFER_NAME[offer.kind],
    note: offerNote(offer, timeZone),
  }))

/** The plan card's rows, for whichever of the four states this church is in. */
export const planRowsOf = (picture: BillingPicture, timeZone: string): readonly PlanRow[] => {
  const plan: PlanRow = {
    label: 'Plan',
    strong: 'Discipler for Churches',
    then: `, ${cycleWord(picture)}`,
    note: picture.aboveTheLimit
      ? `More than ${PEOPLE} people in active relationships`
      : `Up to ${PEOPLE} people in active relationships`,
  }

  const present = (row: PlanRow | null): readonly PlanRow[] => (row ? [row] : [])

  if (picture.endedAt) {
    return [
      plan,
      { label: 'Ended', strong: longDate(picture.endedAt, timeZone), note: BILLING.endedNote },
    ]
  }

  if (picture.cancelsAt) {
    return [
      plan,
      { label: 'Ends', strong: longDate(picture.cancelsAt, timeZone), note: 'No more payments' },
      ...offerRows(picture, timeZone),
    ]
  }

  if (picture.failed) {
    const { cents, retriesOn } = picture.failed
    return [
      plan,
      {
        label: 'Next payment',
        strong: retriesOn
          ? `${moneyOf(cents)}, retrying ${longDate(retriesOn, timeZone)}`
          : `${moneyOf(cents)}, not yet paid`,
      },
      ...offerRows(picture, timeZone),
      ...present(creditRow(picture, timeZone)),
    ]
  }

  const next = picture.nextPayment
  const payment: readonly PlanRow[] = next
    ? [
        {
          label: picture.trial ? 'First payment' : 'Next payment',
          strong: `${moneyOf(next.cents)} on ${longDate(next.at, timeZone)}`,
          note: billNote(picture),
        },
      ]
    : []

  return [
    plan,
    ...(picture.trial
      ? [
          {
            label: 'Free trial',
            strong: `Ends ${longDate(picture.trial.endsAt, timeZone)}`,
            note: trialNote(picture),
          },
        ]
      : []),
    ...payment,
    ...offerRows(picture, timeZone),
    ...present(creditRow(picture, timeZone)),
  ]
}

/** The badge beside the method. */
export const methodBadge = (method: PaymentMethodOnFile | null): { readonly text: string; readonly bank: boolean } => {
  switch (method?.kind) {
    case 'card':
      return {
        text: method.brand === 'mastercard' ? 'MC' : method.brand === 'amex' ? 'AMEX' : brandName(method.brand).toUpperCase().slice(0, 5),
        bank: false,
      }
    case 'bank':
      return { text: 'BANK', bank: true }
    case 'link':
      return { text: 'LINK', bank: false }
    default:
      return { text: 'CARD', bank: false }
  }
}

/** The muted line under the method, where there is anything to say. Link has nothing to say. */
export const methodNote = (picture: BillingPicture, timeZone: string): string | null => {
  if (picture.failed) return `Declined ${monthAndDay(picture.failed.on, timeZone)}`
  const { method } = picture
  if (method?.kind === 'card') {
    return `Expires ${String(method.expMonth).padStart(2, '0')}/${method.expYear}`
  }
  return method?.kind === 'bank' ? BILLING.bankSignIn : null
}

/** "What" in the bills table. */
export const billWhat = (bill: PastBill, timeZone: string): string => {
  switch (bill.what) {
    case 'free_trial':
      return 'Free trial'
    case 'year':
      return `Year from ${monthAndYear(bill.at, timeZone)}`
    default:
      return monthName(bill.at, timeZone)
  }
}

export const billDate = (bill: PastBill, timeZone: string): string => shortDate(bill.at, timeZone)

export const billAmount = (bill: PastBill): string => moneyOf(bill.cents)

export const BILL_STATUS = { paid: 'Paid', processing: 'Processing', not_paid: 'Not paid' } as const

/** The Settings card's one line. */
export const settingsLine = (picture: BillingPicture, timeZone: string): string => {
  const method = methodInWords(picture.method)
  const next = picture.nextPayment
  if (picture.endedAt) return BILLING.banner.ended
  if (picture.cancelsAt) return `Ends ${longDate(picture.cancelsAt, timeZone)} · ${method}`
  if (picture.failed) return `${BILLING.banner.due} · ${method}`
  const plantYear = offerOnTheNextBill(picture)?.kind === 'plant_year'
  if (picture.trial && next) {
    const after = plantYear
      ? 'free for your church plant year'
      : next.fullCents === 0
        ? 'your first paid month free'
        : picture.cycle === 'year' && next.fullCents !== picture.priceCents
          ? `${moneyOf(next.fullCents)} for your first year, then ${everyCycle(picture)}`
          : `${moneyOf(next.fullCents)} a ${picture.cycle}`
    return `Free trial until ${longDate(picture.trial.endsAt, timeZone)}, then ${after} · ${method}`
  }
  if (plantYear) return `Free for your church plant year, then ${everyCycle(picture)} · ${method}`
  if (next) return `${everyCycle(picture)} · next payment ${longDate(next.at, timeZone)} · ${method}`
  return `${everyCycle(picture)} · ${method}`
}
