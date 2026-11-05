import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { REFERRAL_CREDIT_HELD_DAYS, TRIAL_DAYS } from '~/domain/launch-terms'
import { openEnvelope, type Email } from '~/domain/email'
import { referralLinkCopied } from '~/domain/referrals'
import { createStripeCredits } from '~/platform/stripe/credits'
import { createEmailSupportAlerts } from '~/service/support-alerts'
import { REFER, referralNote } from '../../app/refer/copy'

/**
 * The Refer page's words against mock-up 5, and what is asked of Stripe's own API for the
 * credit, through the real SDK and a `fetch` that answers as Stripe's does. No request
 * leaves this process.
 */

describe('the link Copy copies', () => {
  it('has its scheme, so that a text app makes it a link', () => {
    expect(referralLinkCopied('app.trydiscipler.com/r/ABC')).toBe('https://app.trydiscipler.com/r/ABC')
  })
})

describe('the words', () => {
  it('are James\'s, as drawn', () => {
    expect(REFER.lede).toBe('Know a church that would love Discipler? Share your link.')
    expect(REFER.offer).toEqual(['Give a month free.', 'Get a month free.'])
    expect(REFER.offerLine).toBe('Their first paid month is free, and after their first paid bill, you get a month free too.')
    expect(REFER.steps).toEqual([
      'Send your link to another church, by text or email.',
      'They sign up, get 30 days free, then their first paid month free.',
      '30 days after their first paid bill, a month free is taken off your next bill.',
    ])
    expect(REFER.copySays).toBe('Copy puts a short note and your link on your clipboard, ready to paste into a text or email.')
    expect(REFER.newLink).toBe('Get a new link')
    expect(REFER.fine).toBe('Your month free waits 30 days after their first payment, and is taken back if that payment is refunded. It shows on Billing when it is applied.')
  })

  it('state the numbers the product enforces', () => {
    expect(REFER.steps[1]).toContain(`${TRIAL_DAYS} days free`)
    expect(REFER.steps[2]).toContain(`${REFERRAL_CREDIT_HELD_DAYS} days after`)
    expect(REFER.fine).toContain(`waits ${REFERRAL_CREDIT_HELD_DAYS} days`)
  })

  it('make the approved note, with the church and the link', () => {
    expect(referralNote('Riverside Chapel', 'app.trydiscipler.com/r/k7m2qp9xab')).toBe(
      'Hi! At Riverside Chapel we use Discipler to keep our discipleship relationships meeting week to week, and I think your church would love it. Sign up with our link and your first paid month is free: app.trydiscipler.com/r/k7m2qp9xab',
    )
  })

  it('hold no box to type in, no list and no draft', () => {
    const page = readFileSync(fileURLToPath(new URL('../../app/refer/page.tsx', import.meta.url)), 'utf8')
    const link = readFileSync(fileURLToPath(new URL('../../app/refer/your-link.tsx', import.meta.url)), 'utf8')

    expect(page + link).not.toContain('<textarea')
    expect(page + link).not.toContain('mailto:')
    expect(link).toContain('readOnly')
  })
})

describe('the email to James', () => {
  const review = {
    creditId: 'credit-1',
    referralId: 'referral-1',
    because: 'billed_outside_stripe' as const,
    invitingChurchName: 'SAU BCM',
    invitedChurchName: 'Grace Church',
    invitingCustomerId: null,
    invitedCustomerId: 'cus_2',
    paidAt: new Date('2026-12-30T12:00:00Z'),
  }

  it('says to check Stripe first only when the earlier call may have landed', async () => {
    const sent: Email[] = []
    const alerts = createEmailSupportAlerts({ send: async (email) => void sent.push(email) })

    await alerts.referralCreditForReview({ ...review, because: 'unfinished_inviter_gone' })
    await alerts.referralCreditForReview(review)

    const [unfinished, ordinary] = sent.map((email) => openEnvelope(email).text)
    expect(unfinished).toContain('may have landed')
    expect(unfinished).not.toContain('Discipler has not applied it.')
    expect(ordinary).toContain('Discipler has not applied it.')
    expect(ordinary).not.toContain('may have landed')
  })

  it('goes to the founders, names both churches and why, and is once per credit', async () => {
    const sent: Email[] = []
    const alerts = createEmailSupportAlerts({ send: async (email) => void sent.push(email) })

    await alerts.referralCreditForReview(review)

    const envelope = openEnvelope(sent[0]!)
    expect(sent[0]!.kind).toBe('referralCreditReview')
    expect(envelope.to).toEqual(expect.arrayContaining(['james@trydiscipler.com']))
    expect(envelope.text).toContain('SAU BCM earned a referral credit: Grace Church')
    expect(envelope.text).toContain('billed outside Stripe')
    expect(envelope.text).toContain('Inviting church\'s Stripe customer: None')
    expect(envelope.text).toContain('Invited church\'s Stripe customer: cus_2')
    expect(envelope.idempotencyKey).toBe('referralCreditReview/referral-credit-review:credit-1')
  })
})

interface Asked {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly body: URLSearchParams
  readonly idempotencyKey: string | null
}

const answering = (answer: (asked: Asked) => unknown) => {
  const asked: Asked[] = []
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url))
    const headers = new Headers(init?.headers)
    const request: Asked = {
      method: init?.method ?? 'GET',
      path: parsed.pathname,
      query: parsed.searchParams,
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
      idempotencyKey: headers.get('idempotency-key'),
    }
    asked.push(request)
    const answered = answer(request)
    const missing = answered === undefined
    return new Response(
      JSON.stringify(missing ? { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such thing' } } : answered),
      { status: missing ? 404 : 200, headers: { 'content-type': 'application/json' } },
    )
  }
  const client = new Stripe('rk_test_not_a_real_key', {
    httpClient: Stripe.createFetchHttpClient(fake as typeof fetch),
    maxNetworkRetries: 0,
  })
  return { asked, credits: createStripeCredits(() => client) }
}

const list = (...data: unknown[]) => ({ object: 'list', url: '/v1/x', has_more: false, data })

describe('at Stripe', () => {
  it('reads an invoice\'s charge through its payment intent', async () => {
    const { asked, credits } = answering(() => ({
      id: 'in_1',
      object: 'invoice',
      customer: 'cus_1',
      status: 'paid',
      amount_paid: 9_700,
      status_transitions: { paid_at: 1_798_000_000 },
      payments: {
        object: 'list',
        data: [
          { id: 'inpay_0', status: 'canceled', payment: { type: 'payment_intent', payment_intent: { id: 'pi_0', latest_charge: 'ch_0' } } },
          { id: 'inpay_1', status: 'paid', payment: { type: 'payment_intent', payment_intent: { id: 'pi_1', latest_charge: 'ch_1' } } },
        ],
      },
    }))

    expect(await credits.invoice('in_1')).toEqual({
      customerId: 'cus_1',
      paid: true,
      amountPaidCents: 9_700,
      paidAt: new Date(1_798_000_000 * 1000),
      chargeId: 'ch_1',
    })
    expect(asked[0]!.query.get('expand[0]')).toBe('payments.data.payment.payment_intent')
  })

  it('reads a $0 invoice as nothing charged', async () => {
    const { credits } = answering(() => ({
      id: 'in_0',
      object: 'invoice',
      customer: 'cus_1',
      status: 'paid',
      amount_paid: 0,
      status_transitions: { paid_at: 1_798_000_000 },
      payments: { object: 'list', data: [] },
    }))

    expect(await credits.invoice('in_0')).toMatchObject({ amountPaidCents: 0, chargeId: null })
  })

  it('answers null for an invoice it does not have, and raises anything else', async () => {
    const { credits } = answering(() => undefined)
    expect(await credits.invoice('in_gone')).toBeNull()
  })

  it.each([
    [{ refunded: true, amount_refunded: 9_700, disputed: false }, true],
    [{ refunded: false, amount_refunded: 100, disputed: false }, true],
    [{ refunded: false, amount_refunded: 0, disputed: true }, true],
    [{ refunded: false, amount_refunded: 0, disputed: false }, false],
  ])('reads a charge %o as taken back: %s', async (fields, takenBack) => {
    const { credits } = answering(() => ({
      id: 'ch_1',
      object: 'charge',
      ...fields,
      payment_method_details: { type: 'card', card: { fingerprint: 'fp_card' } },
    }))

    expect(await credits.charge('ch_1')).toEqual({ takenBack, fingerprint: 'fp_card' })
  })

  it('reads a bank account\'s fingerprint on a charge, and none for Link', async () => {
    const bank = answering(() => ({
      id: 'ch_2', object: 'charge', refunded: false, amount_refunded: 0, disputed: false,
      payment_method_details: { type: 'us_bank_account', us_bank_account: { fingerprint: 'fp_bank' } },
    }))
    const link = answering(() => ({
      id: 'ch_3', object: 'charge', refunded: false, amount_refunded: 0, disputed: false,
      payment_method_details: { type: 'link', link: {} },
    }))

    expect((await bank.credits.charge('ch_2')).fingerprint).toBe('fp_bank')
    expect((await link.credits.charge('ch_3')).fingerprint).toBeNull()
  })

  it('reads a customer\'s email and every fingerprint it holds', async () => {
    const { credits } = answering(({ path }) =>
      path.endsWith('/payment_methods')
        ? list(
            { id: 'pm_1', object: 'payment_method', type: 'card', card: { fingerprint: 'fp_card' } },
            { id: 'pm_2', object: 'payment_method', type: 'us_bank_account', us_bank_account: { fingerprint: 'fp_bank' } },
            { id: 'pm_3', object: 'payment_method', type: 'link', link: {} },
          )
        : { id: 'cus_1', object: 'customer', email: 'pastor@grace.example' },
    )

    expect(await credits.customer('cus_1')).toEqual({
      email: 'pastor@grace.example',
      fingerprints: ['fp_card', 'fp_bank'],
    })
  })

  it('writes a negative balance transaction described as "Referral credit", naming only the credit', async () => {
    const { asked, credits } = answering(() => ({ id: 'cbtxn_1', object: 'customer_balance_transaction' }))

    expect(await credits.applyCredit({ customerId: 'cus_1', creditId: 'credit-1', cents: 9_700 })).toBe('cbtxn_1')

    expect(asked[0]).toMatchObject({ method: 'POST', path: '/v1/customers/cus_1/balance_transactions' })
    expect(Object.fromEntries(asked[0]!.body)).toEqual({
      amount: '-9700',
      currency: 'usd',
      description: 'Referral credit',
      'metadata[referral_credit]': 'credit-1',
    })
    expect(asked[0]!.idempotencyKey).toBe('referral-credit/credit-1')
  })

  it('finds a credit already made, by the ID it named, and only that one', async () => {
    const { credits } = answering(() =>
      list(
        { id: 'cbtxn_other', object: 'customer_balance_transaction', metadata: { referral_credit: 'credit-2' } },
        { id: 'cbtxn_hand', object: 'customer_balance_transaction', metadata: {} },
        { id: 'cbtxn_mine', object: 'customer_balance_transaction', metadata: { referral_credit: 'credit-1' } },
      ),
    )

    expect(await credits.appliedCredit('cus_1', 'credit-1')).toBe('cbtxn_mine')
    expect(await credits.appliedCredit('cus_1', 'credit-3')).toBeNull()
  })

  it('reads a price\'s lookup key', async () => {
    const { credits } = answering(() => ({ id: 'price_1', object: 'price', lookup_key: 'discipler_up_to_the_limit_monthly' }))
    expect(await credits.lookupKeyOfPrice('price_1')).toBe('discipler_up_to_the_limit_monthly')
  })
})
