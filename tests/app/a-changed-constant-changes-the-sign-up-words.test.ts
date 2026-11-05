import { describe, expect, it, vi } from 'vitest'
import { accountPrices, ACCOUNT_PAGE, OFFER_SCREEN } from '../../app/signup/copy'

/**
 * Sign-up states its numbers by naming the launch terms, so changed terms change the words
 * (Exponential launch, ticket 16). Its own file, because `vi.mock` replaces a module for the
 * whole file, and is hoisted above the import.
 */
vi.mock('~/domain/launch-terms', async (original) => {
  const terms = await original<typeof import('~/domain/launch-terms')>()
  return {
    ...terms,
    TRIAL_DAYS: 45,
    MONTHLY_PRICE_CENTS: { upToTheLimit: 10_000, aboveTheLimit: 15_000 },
    YEARLY_DISCOUNT_PERCENT: 25,
    EXPONENTIAL_OFFER: { ...terms.EXPONENTIAL_OFFER, trialDays: 75, discountPercent: 30 },
  }
})

describe('the words on sign-up', () => {
  it('follow the price and the trial', () => {
    const prices = accountPrices('none')
    expect(prices.month).toBe('$100 a month')
    expect(prices.year).toBe('$900 a year')
    expect(prices.underTheButton).toContain('45 days free.')
    expect(ACCOUNT_PAGE.save).toBe('Save 25%')
  })

  it('follow the special offer', () => {
    const prices = accountPrices('exponential')
    expect(prices.month).toBe('$100 a month, 30% off your first year')
    expect(prices.underTheButton).toContain('75 days free with the Exponential special offer.')
    expect(OFFER_SCREEN.big).toBe('75 DAYS FREE')
    expect(OFFER_SCREEN.then).toBe('THEN 30% OFF YOUR FIRST YEAR')
  })
})
