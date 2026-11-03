import { describe, expect, it } from 'vitest'
import {
  isBillingCycle,
  offerFor,
  paidPhasesOf,
  startingPrice,
  STRIPE_COUPONS,
  STRIPE_PRICES,
  trialDaysOf,
  type BillingCycle,
  type CatalogCoupon,
  type PaidPhase,
} from '~/domain/offers'

/**
 * The prices and the rules for the offers (Exponential launch, ticket 04). Whether
 * Stripe bills what these say is a test clock's to prove, on staging; that these say
 * what the spec says is here.
 */
const IN_TIME = new Date('2026-11-10T18:00:00Z')

describe('the catalog', () => {
  it('holds the four prices the spec names', () => {
    expect(STRIPE_PRICES.map(({ cents, cycle }) => [cents, cycle])).toEqual([
      [9_700, 'month'],
      [93_120, 'year'],
      [14_700, 'month'],
      [141_120, 'year'],
    ])
    // Whole cents, and each findable by its own key.
    expect(STRIPE_PRICES.every(({ cents }) => Number.isInteger(cents))).toBe(true)
    expect(new Set(STRIPE_PRICES.map(({ lookupKey }) => lookupKey)).size).toBe(4)
  })

  it('starts every church on the first price, whichever cycle it chose', () => {
    expect(startingPrice('month').cents).toBe(9_700)
    expect(startingPrice('year').cents).toBe(93_120)
  })

  it('knows the two cycles and nothing else', () => {
    expect(isBillingCycle('month')).toBe(true)
    expect(isBillingCycle('year')).toBe(true)
    for (const other of ['', 'week', 'MONTH', undefined, null, 12]) {
      expect(isBillingCycle(other)).toBe(false)
    }
  })
})

describe('which offer a church gets', () => {
  it('is none, with 30 days, where nothing was said', () => {
    const decision = offerFor({ code: '', invited: false, at: IN_TIME })
    expect(decision).toEqual({ offer: 'none', codeRefusal: null })
    expect(trialDaysOf(decision.offer)).toBe(30)
  })

  it('is the Exponential special offer, with 60 days, for EXPO26 in any case', () => {
    for (const code of ['EXPO26', 'expo26', ' Expo26 ']) {
      expect(offerFor({ code, invited: false, at: IN_TIME })).toEqual({
        offer: 'exponential',
        codeRefusal: null,
      })
    }
    expect(trialDaysOf('exponential')).toBe(60)
  })

  it('works through the end of December 11, Pacific, and not a second after', () => {
    const lastSecond = new Date('2026-12-11T23:59:59-08:00')
    const nextDay = new Date('2026-12-12T00:00:00-08:00')

    expect(offerFor({ code: 'EXPO26', invited: false, at: lastSecond }).offer).toBe('exponential')
    expect(offerFor({ code: 'EXPO26', invited: false, at: nextDay })).toEqual({
      offer: 'none',
      codeRefusal: 'offer.code_expired',
    })
  })

  it('is only the Exponential special offer when a church was invited too', () => {
    expect(offerFor({ code: 'EXPO26', invited: true, at: IN_TIME }).offer).toBe('exponential')
  })

  it('keeps the invitation when the code did not apply', () => {
    const after = new Date('2027-01-01T00:00:00Z')
    expect(offerFor({ code: 'EXPO26', invited: true, at: after })).toEqual({
      offer: 'referral',
      codeRefusal: 'offer.code_expired',
    })
    expect(offerFor({ code: 'NOPE', invited: true, at: IN_TIME })).toEqual({
      offer: 'referral',
      codeRefusal: 'offer.code_unknown',
    })
  })

  it('gives an invited church the ordinary 30 days', () => {
    expect(trialDaysOf('referral')).toBe(30)
  })
})

/** What each bill comes to, phase by phase, for the first `bills` bills. */
const billsOf = (phases: readonly PaidPhase[], cents: number, bills: number): number[] => {
  const coupons: readonly CatalogCoupon[] = Object.values(STRIPE_COUPONS)
  const amount = (couponId: string | null): number => {
    const coupon = coupons.find(({ id }) => id === couponId)
    if (!coupon) return cents
    return 'percentOff' in coupon
      ? (cents * (100 - coupon.percentOff)) / 100
      : cents - coupon.centsOff
  }
  const listed = phases.slice(0, -1).flatMap(({ couponId, intervals }) =>
    Array.from({ length: intervals }, () => amount(couponId)),
  )
  return [...listed, ...Array.from({ length: bills - listed.length }, () => cents)]
}

const phases = (cycle: BillingCycle, offer: 'none' | 'exponential' | 'referral', plantYear = false) =>
  paidPhasesOf({ cycle, offer, plantYear })

describe('the bills after the free days', () => {
  it('need no schedule where there is no offer', () => {
    expect(phases('month', 'none')).toEqual([])
    expect(phases('year', 'none')).toEqual([])
  })

  it('are 12 at $77.60 and then $97, for EXPO26 monthly', () => {
    expect(billsOf(phases('month', 'exponential'), 9_700, 14)).toEqual([
      ...Array.from({ length: 12 }, () => 7_760),
      9_700,
      9_700,
    ])
  })

  it('are one at 20% off and then the full year, for EXPO26 yearly', () => {
    expect(billsOf(phases('year', 'exponential'), 93_120, 2)).toEqual([74_496, 93_120])
  })

  it('are one at nothing and then $97, for an invited church paying monthly', () => {
    expect(billsOf(phases('month', 'referral'), 9_700, 3)).toEqual([0, 9_700, 9_700])
  })

  it('take one month’s worth off the first bill of an invited church paying yearly', () => {
    expect(billsOf(phases('year', 'referral'), 93_120, 2)).toEqual([85_360, 93_120])
  })

  it('are 12 at nothing and then $97, for an approved plant', () => {
    expect(billsOf(phases('month', 'none', true), 9_700, 13)).toEqual([
      ...Array.from({ length: 12 }, () => 0),
      9_700,
    ])
  })

  it('are 12 at nothing, 12 at $77.60 and then $97, for an approved plant that used EXPO26', () => {
    expect(billsOf(phases('month', 'exponential', true), 9_700, 25)).toEqual([
      ...Array.from({ length: 12 }, () => 0),
      ...Array.from({ length: 12 }, () => 7_760),
      9_700,
    ])
  })

  it('do not combine a plant year with a referral month, and the plant wins', () => {
    expect(billsOf(phases('month', 'referral', true), 9_700, 13)).toEqual([
      ...Array.from({ length: 12 }, () => 0),
      9_700,
    ])
  })

  it('always end on the full price, or a released Subscription would keep its discount', () => {
    for (const offer of ['exponential', 'referral'] as const) {
      for (const cycle of ['month', 'year'] as const) {
        expect(phases(cycle, offer).at(-1)?.couponId).toBeNull()
      }
    }
  })
})
