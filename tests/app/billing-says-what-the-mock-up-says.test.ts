import { describe, expect, it } from 'vitest'
import type { BillingPicture, PastBill } from '~/domain/billing-picture'
import {
  billAmount,
  billDate,
  billWhat,
  BILLING,
  methodBadge,
  methodNote,
  planRowsOf,
  RESTART,
  settingsLine,
  twelveMonthlyWords,
  yearlyPriceWords,
  monthlyPriceWords,
} from '../../app/settings/billing/copy'
import { methodInWords } from '~/domain/billing-picture'

const ZONE = 'America/New_York'
const noon = (day: string) => new Date(`${day}T17:00:00Z`)

const OFFER = { kind: 'exponential', endsAt: noon('2027-12-30') } as const
const VISA = { kind: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 } as const

const aPicture = (changes: Partial<BillingPicture> = {}): BillingPicture => ({
  subscriptionId: 'sub_1',
  onASchedule: true,
  status: 'trialing',
  cycle: 'month',
  priceCents: 9_700,
  aboveTheLimit: false,
  trial: { days: 60, endsAt: noon('2026-12-30') },
  nextPayment: { cents: 7_760, fullCents: 7_760, at: noon('2026-12-30') },
  cancelsAt: null,
  endedAt: null,
  offers: [OFFER],
  creditCents: 0,
  creditLeftCents: 0,
  method: VISA,
  failed: null,
  ...changes,
})

const PLAN = {
  label: 'Plan',
  strong: 'Discipler for Churches',
  then: ', monthly',
  note: 'Up to 200 people in active relationships',
}
const OFFER_ROW = {
  label: 'Offer',
  pill: 'Exponential special offer',
  note: '20% off your first year, through December 30, 2027',
}

describe('the four states', () => {
  it('draws a trial', () => {
    expect(planRowsOf(aPicture(), ZONE)).toEqual([
      PLAN,
      { label: 'Free trial', strong: 'Ends December 30, 2026', note: '60 days free with the Exponential special offer' },
      { label: 'First payment', strong: '$77.60 on December 30, 2026', note: '$97 a month, 20% off your first year' },
      OFFER_ROW,
    ])
  })

  it('draws a church paying, with referral credit', () => {
    const paying = aPicture({
      status: 'active',
      trial: null,
      nextPayment: { cents: 0, fullCents: 7_760, at: noon('2027-03-30') },
      creditCents: 9_700,
      creditLeftCents: 1_940,
    })
    expect(planRowsOf(paying, ZONE)).toEqual([
      PLAN,
      { label: 'Next payment', strong: '$0.00 on March 30, 2027', note: '$77.60, less your referral credit' },
      OFFER_ROW,
      {
        label: 'Credit',
        strong: '$97.00',
        then: ' from a church you invited',
        note: 'Taken off your next bills automatically; $19.40 is left for April',
      },
    ])
  })

  it('draws a church that canceled and is ending', () => {
    const canceling = aPicture({ status: 'active', trial: null, nextPayment: null, cancelsAt: noon('2027-03-30') })
    expect(planRowsOf(canceling, ZONE)).toEqual([
      PLAN,
      { label: 'Ends', strong: 'March 30, 2027', note: 'No more payments' },
      OFFER_ROW,
    ])
    expect(BILLING.endsOn('March 30, 2027')).toBe('Your subscription ends on March 30, 2027.')
    expect(BILLING.endsNote).toBe('Check-ins keep going until then. After that they stop, and everything stays here to read.')
    expect(BILLING.keep).toBe('Keep my subscription')
  })

  it('draws a payment that failed', () => {
    const failed = aPicture({
      status: 'past_due',
      trial: null,
      nextPayment: null,
      failed: { cents: 7_760, on: noon('2027-02-28'), retriesOn: noon('2027-03-03') },
    })
    expect(planRowsOf(failed, ZONE)).toEqual([
      PLAN,
      { label: 'Next payment', strong: '$77.60, retrying March 3, 2027' },
      OFFER_ROW,
    ])
    expect(methodNote(failed, ZONE)).toBe('Declined February 28')
    expect(BILLING.failed('$77.60', 'February 28')).toBe("Your payment of $77.60 on February 28 didn't go through.")
    expect(BILLING.retries('March 3')).toBe('Stripe tries again on March 3. Everything keeps running in the meantime.')
  })
})

describe('the payment method', () => {
  it('says a card’s brand, last four and expiry', () => {
    expect(methodInWords(VISA)).toBe('Visa ending 4242')
    expect(methodNote(aPicture(), ZONE)).toBe('Expires 08/2029')
    expect(methodBadge(VISA)).toEqual({ text: 'VISA', bank: false })
  })

  it('says a bank’s name and last four, and how it was connected', () => {
    const bank = { kind: 'bank', bankName: 'Chase', accountType: 'checking', last4: '6789' } as const
    expect(methodInWords(bank)).toBe('Chase checking ending 6789')
    expect(methodNote(aPicture({ method: bank }), ZONE)).toBe('Connected by bank sign-in')
    expect(methodBadge(bank)).toEqual({ text: 'BANK', bank: true })
    expect(BILLING.bankLine).toBe('To use a different bank account, email support@trydiscipler.com.')
  })

  it('is right about Link, which gives no details at all', () => {
    const link = { kind: 'link' } as const
    expect(methodInWords(link)).toBe('Link')
    expect(methodNote(aPicture({ method: link }), ZONE)).toBeNull()
    expect(methodBadge(link)).toEqual({ text: 'LINK', bank: false })
    expect(settingsLine(aPicture({ method: link }), ZONE)).toBe(
      'Free trial until December 30, 2026, then $77.60 a month · Link',
    )
  })

  it('is right about a method Stripe holds that Discipler has no words for', () => {
    expect(methodInWords({ kind: 'other' })).toBe('Payment method on file')
    expect(methodNote(aPicture({ method: { kind: 'other' } }), ZONE)).toBeNull()
  })

  it('is right about having none', () => {
    expect(methodInWords(null)).toBe('No payment method on file')
    expect(methodNote(aPicture({ method: null }), ZONE)).toBeNull()
  })
})

describe('the Settings card', () => {
  it('says the line as drawn', () => {
    expect(settingsLine(aPicture(), ZONE)).toBe('Free trial until December 30, 2026, then $77.60 a month · Visa ending 4242')
  })
})

describe('past bills', () => {
  const bill = (changes: Partial<PastBill>): PastBill => ({
    at: noon('2027-02-28'),
    what: 'month',
    cents: 7_760,
    status: 'paid',
    viewAt: 'https://invoice.example/1',
    ...changes,
  })

  it('reads as the table draws them', () => {
    expect(billDate(bill({}), ZONE)).toBe('Feb 28, 2027')
    expect(billWhat(bill({}), ZONE)).toBe('February')
    expect(billAmount(bill({}))).toBe('$77.60')
    expect(billWhat(bill({ what: 'free_trial', cents: 0 }), ZONE)).toBe('Free trial')
    expect(billAmount(bill({ what: 'free_trial', cents: 0 }))).toBe('$0.00')
  })
})

describe('the words as James wrote them', () => {
  it('heads the page', () => {
    expect(BILLING.lede('Riverside Chapel')).toBe("Riverside Chapel's plan with Discipler. Any Admin can change it.")
    expect(BILLING.opens).toBe("These open Stripe's secure billing page, then bring you back here.")
    expect(BILLING.viewFine).toBe('View opens the bill on Stripe, where it can be downloaded as a PDF.')
  })

  it('says the banners', () => {
    expect(`${BILLING.banner.due} ${BILLING.banner.dueRest}`).toBe(
      "Your last payment didn't go through. Discipler keeps running while Stripe tries again.",
    )
    expect(`${BILLING.banner.ended} ${BILLING.banner.endedRest}`).toBe(
      'Your subscription has ended. Check-ins have stopped and these pages are read-only. Everything is still here.',
    )
  })

  it('says the restart page, with twelve monthly struck through beside the yearly price', () => {
    expect(RESTART.lede('Monday', '9am')).toBe(
      'Your people, relationships and history are all still here. Check-ins start again on your next check-in day, Monday at 9am.',
    )
    expect(RESTART.underTheButton).toBe("You'll be charged today. You can change or cancel any time in Settings, Billing.")
    expect(monthlyPriceWords).toBe('$97')
    expect(twelveMonthlyWords).toBe('$1,164')
    expect(yearlyPriceWords).toBe('$931.20')
  })
})
