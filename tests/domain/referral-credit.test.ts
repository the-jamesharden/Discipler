import { describe, expect, it } from 'vitest'
import { MONTHLY_PRICE_CENTS, REFERRAL_CREDIT_HELD_DAYS } from '~/domain/launch-terms'
import { STRIPE_PRICES } from '~/domain/offers'
import {
  earnsAReferralCredit,
  emailDomainOf,
  referralCreditCents,
  referralCreditHeldUntil,
  whyTheInviterCannotBeCredited,
  whyTheyLookLikeOne,
  type PaidInvoiceFacts,
} from '~/domain/referral-credit'
import { readReferralCode, referralLinkShown } from '~/domain/referrals'

const anInvoice = (changes: Partial<PaidInvoiceFacts> = {}): PaidInvoiceFacts => ({
  customerId: 'cus_1',
  paid: true,
  amountPaidCents: 9_700,
  paidAt: new Date('2026-12-30T12:00:00Z'),
  chargeId: 'ch_1',
  ...changes,
})

describe('what earns a credit', () => {
  it('is an invoice the customer really paid', () => {
    expect(earnsAReferralCredit(anInvoice(), 'cus_1')).toBe(true)
  })

  it('is not a trial\'s $0 invoice, nor a free month\'s', () => {
    expect(earnsAReferralCredit(anInvoice({ amountPaidCents: 0 }), 'cus_1')).toBe(false)
  })

  it('is not an invoice still open, nor another customer\'s', () => {
    expect(earnsAReferralCredit(anInvoice({ paid: false }), 'cus_1')).toBe(false)
    expect(earnsAReferralCredit(anInvoice(), 'cus_2')).toBe(false)
  })

  it('waits the days the help docs state', () => {
    const paidAt = new Date('2026-12-30T12:00:00Z')
    expect(referralCreditHeldUntil(paidAt).getTime() - paidAt.getTime()).toBe(
      REFERRAL_CREDIT_HELD_DAYS * 24 * 60 * 60 * 1000,
    )
  })
})

describe('what it is worth', () => {
  it('is one month of the church\'s own price, however it bills', () => {
    const worth = Object.fromEntries(STRIPE_PRICES.map((price) => [price.lookupKey, referralCreditCents(price.lookupKey)]))

    expect(worth).toEqual({
      discipler_up_to_the_limit_monthly: MONTHLY_PRICE_CENTS.upToTheLimit,
      discipler_up_to_the_limit_yearly: MONTHLY_PRICE_CENTS.upToTheLimit,
      discipler_above_the_limit_monthly: MONTHLY_PRICE_CENTS.aboveTheLimit,
      discipler_above_the_limit_yearly: MONTHLY_PRICE_CENTS.aboveTheLimit,
    })
  })

  it('is nothing Discipler can say for a price not in the catalog', () => {
    expect(referralCreditCents('a_price_made_by_hand')).toBeNull()
    expect(referralCreditCents(null)).toBeNull()
  })
})

describe('who can be credited at Stripe', () => {
  it('is a church with a running subscription', () => {
    for (const standing of ['trialing', 'active', 'past_due'] as const) {
      expect(whyTheInviterCannotBeCredited({ standing, customerId: 'cus_1' })).toBeNull()
    }
  })

  it('is not a church billed outside Stripe', () => {
    expect(whyTheInviterCannotBeCredited({ standing: 'outside_stripe', customerId: null })).toBe('billed_outside_stripe')
  })

  it('is not a church with nothing running', () => {
    for (const standing of ['no_subscription', 'incomplete', 'ended'] as const) {
      expect(whyTheInviterCannotBeCredited({ standing, customerId: 'cus_1' })).toBe('no_live_subscription')
    }
    expect(whyTheInviterCannotBeCredited({ standing: 'active', customerId: null })).toBe('no_live_subscription')
  })
})

describe('whether two churches look like one', () => {
  const one = { customerId: 'cus_1', fingerprints: ['fp_a'], emails: ['pastor@first.example'] }
  const other = { customerId: 'cus_2', fingerprints: ['fp_b'], emails: ['pastor@second.example'] }

  it('is no for two different churches', () => {
    expect(whyTheyLookLikeOne(one, other)).toBeNull()
  })

  it('is yes for the same Stripe customer', () => {
    expect(whyTheyLookLikeOne(one, { ...other, customerId: 'cus_1' })).toBe('same_customer')
  })

  it('is yes for a shared card or bank account', () => {
    expect(whyTheyLookLikeOne(one, { ...other, fingerprints: ['fp_b', 'fp_a'] })).toBe('shared_payment')
  })

  it('is yes for a shared email domain, in any case, on any address', () => {
    expect(whyTheyLookLikeOne(one, { ...other, emails: ['x@second.example', 'Y@FIRST.example'] })).toBe('shared_email_domain')
  })

  it.each(['gmail.com', 'GMAIL.com', 'yahoo.com', 'comcast.net'])('is no for a shared public domain, %s', (domain) => {
    const inviting = { ...one, emails: [`first@${domain}`] }
    const invited = { ...other, emails: [`second@${domain}`] }

    expect(whyTheyLookLikeOne(inviting, invited)).toBeNull()
  })

  it('still says yes for a shared card on two public addresses', () => {
    const inviting = { ...one, emails: ['first@gmail.com'] }
    const invited = { ...other, emails: ['second@gmail.com'], fingerprints: ['fp_a'] }

    expect(whyTheyLookLikeOne(inviting, invited)).toBe('shared_payment')
  })

  it('takes two churches with no customer as nothing shared', () => {
    expect(whyTheyLookLikeOne({ ...one, customerId: null }, { ...other, customerId: null })).toBeNull()
  })

  it('reads a domain off an address, and nothing off what is not one', () => {
    expect(emailDomainOf('a@b.example')).toBe('b.example')
    expect(emailDomainOf('nothing')).toBeNull()
    expect(emailDomainOf('nothing@')).toBeNull()
  })
})

describe('the link as it is shown', () => {
  it('has no scheme, and is what the redirect takes', () => {
    const link = referralLinkShown('https://app.trydiscipler.com/', 'k7m2qp9xab')
    expect(link).toBe('app.trydiscipler.com/r/k7m2qp9xab')
    expect(readReferralCode(link.split('/r/')[1])).toBe('k7m2qp9xab')
  })
})
