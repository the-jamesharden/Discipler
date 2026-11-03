import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { ministryId } from '~/domain/ids'
import { paidPhasesOf, STRIPE_COUPONS } from '~/domain/offers'
import { createCatalog } from '~/platform/stripe/catalog'
import { createStripeTrials } from '~/platform/stripe/trials'

/**
 * What is written to Stripe (Exponential launch, ticket 04), through the real SDK and
 * against a `fetch` that answers as Stripe's API does, so what is tested is what is
 * asked for. No request leaves this process. Whether Stripe then does as it documents
 * is a test clock's to prove, on staging.
 */
interface Asked {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly body: URLSearchParams
}

type Answer = (asked: Asked) => unknown

const answering = (answer: Answer) => {
  const asked: Asked[] = []
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url))
    const request: Asked = {
      method: init?.method ?? 'GET',
      path: parsed.pathname,
      query: parsed.searchParams,
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
    }
    asked.push(request)
    const answered = answer(request)
    const missing = answered === undefined
    return new Response(
      JSON.stringify(
        missing
          ? { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such thing' } }
          : answered,
      ),
      { status: missing ? 404 : 200, headers: { 'content-type': 'application/json' } },
    )
  }
  const client = new Stripe('rk_test_not_a_real_key', {
    httpClient: Stripe.createFetchHttpClient(fake as typeof fetch),
    maxNetworkRetries: 0,
  })
  return { asked, client, trials: createStripeTrials(() => client) }
}

const list = (...data: unknown[]) => ({ object: 'list', data, has_more: false, url: '/v1/x' })

const aSubscription = (changes: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  status: 'trialing',
  created: 1_790_000_000,
  latest_invoice: 'in_1',
  pending_setup_intent: {
    id: 'seti_1',
    object: 'setup_intent',
    status: 'requires_payment_method',
    client_secret: 'seti_1_secret_x',
  },
  default_payment_method: null,
  schedule: null,
  trial_end: 1_792_000_000,
  cancel_at: null,
  cancel_at_period_end: false,
  metadata: {},
  items: {
    object: 'list',
    data: [{ id: 'si_1', current_period_end: 1_792_000_000, price: { id: 'price_97' } }],
  },
  ...changes,
})

const CHURCH = ministryId('11111111-1111-1111-1111-111111111111')

describe('making a church’s Customer', () => {
  it('sends its name, the Admin’s email and its ID, and nothing else', async () => {
    const { asked, trials } = answering(() => ({ id: 'cus_1', object: 'customer', livemode: false }))

    expect(await trials.createCustomer({ church: CHURCH, churchName: 'Grace', email: 'a@grace.example' })).toEqual({
      id: 'cus_1',
      livemode: false,
    })

    expect(asked[0]?.path).toBe('/v1/customers')
    expect(Object.fromEntries(asked[0]!.body)).toEqual({
      name: 'Grace',
      email: 'a@grace.example',
      'metadata[ministry_id]': CHURCH,
    })
  })

  it('leaves the email off where the Admin has none', async () => {
    const { asked, trials } = answering(() => ({ id: 'cus_1', object: 'customer', livemode: true }))

    await trials.createCustomer({ church: CHURCH, churchName: 'Grace', email: null })

    expect(asked[0]!.body.has('email')).toBe(false)
  })
})

describe('opening a trial', () => {
  const opening = (cycle: 'month' | 'year', trialDays: number) => {
    const fake = answering(({ path, method }) => {
      if (path === '/v1/prices') return list({ id: 'price_found', object: 'price' })
      if (path === '/v1/subscriptions' && method === 'POST') return aSubscription()
      return undefined
    })
    return { ...fake, opened: fake.trials.openTrial({ customerId: 'cus_1', church: CHURCH, cycle, trialDays }) }
  }

  it('finds the starting price of the cycle chosen, by its key', async () => {
    const monthly = opening('month', 30)
    await monthly.opened
    expect(monthly.asked[0]?.query.get('lookup_keys[0]')).toBe('discipler_up_to_the_limit_monthly')

    const yearly = opening('year', 30)
    await yearly.opened
    expect(yearly.asked[0]?.query.get('lookup_keys[0]')).toBe('discipler_up_to_the_limit_yearly')
  })

  it('creates the Subscription with its trial, waiting for the Element', async () => {
    const { asked, opened } = opening('month', 60)
    await opened

    const created = Object.fromEntries(asked[1]!.body)
    expect(asked[1]?.path).toBe('/v1/subscriptions')
    expect(created).toMatchObject({
      customer: 'cus_1',
      'items[0][price]': 'price_found',
      'items[0][quantity]': '1',
      trial_period_days: '60',
      payment_behavior: 'default_incomplete',
      'trial_settings[end_behavior][missing_payment_method]': 'cancel',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'metadata[ministry_id]': CHURCH,
      'expand[0]': 'pending_setup_intent',
    })
  })

  it('accepts a card, Link and a US bank account, by instant sign-in only', async () => {
    const { asked, opened } = opening('month', 30)
    await opened

    const { body } = asked[1]!
    expect(body.get('payment_settings[payment_method_types][0]')).toBe('card')
    expect(body.get('payment_settings[payment_method_types][1]')).toBe('link')
    expect(body.get('payment_settings[payment_method_types][2]')).toBe('us_bank_account')
    expect(body.has('payment_settings[payment_method_types][3]')).toBe(false)
    expect(body.get('payment_settings[payment_method_options][us_bank_account][verification_method]')).toBe('instant')
  })

  it('leaves Stripe Tax off', async () => {
    const { asked, opened } = opening('month', 30)
    await opened

    expect([...asked[1]!.body.keys()].some((key) => key.startsWith('automatic_tax'))).toBe(false)
  })

  it('answers the setup intent’s secret, and reads as waiting for its payment method', async () => {
    const { opened } = opening('month', 30)

    const { clientSecret, subscription } = await opened
    expect(clientSecret).toBe('seti_1_secret_x')
    expect(subscription).toMatchObject({ id: 'sub_1', status: 'trialing', awaitingPaymentMethod: true })
  })

  it('stops a Subscription that came with no setup intent, which would read as confirmed', async () => {
    const { asked, trials } = answering(({ path, method }) => {
      if (path === '/v1/prices') return list({ id: 'price_found', object: 'price' })
      if (path === '/v1/subscriptions' && method === 'POST') return aSubscription({ pending_setup_intent: null })
      if (method === 'DELETE') return aSubscription({ status: 'canceled', pending_setup_intent: null })
      return undefined
    })

    await expect(
      trials.openTrial({ customerId: 'cus_1', church: CHURCH, cycle: 'month', trialDays: 30 }),
    ).rejects.toThrow(/no setup intent/)

    expect(asked.at(-1)).toMatchObject({ method: 'DELETE', path: '/v1/subscriptions/sub_1' })
  })

  it('refuses without a catalog rather than inventing a price', async () => {
    const { trials } = answering(() => list())

    await expect(
      trials.openTrial({ customerId: 'cus_1', church: CHURCH, cycle: 'month', trialDays: 30 }),
    ).rejects.toThrow(/catalog/)
  })
})

describe('a trial nobody confirmed', () => {
  it('hands back the secret while its setup intent waits, and nothing once it has gone', async () => {
    const waiting = answering(() => aSubscription())
    expect(await waiting.trials.setupSecretOf('sub_1')).toBe('seti_1_secret_x')

    const cleared = answering(() => aSubscription({ pending_setup_intent: null }))
    expect(await cleared.trials.setupSecretOf('sub_1')).toBeNull()
  })

  it('ends along with its setup intent, so a stale tab cannot save a card against nothing', async () => {
    const { asked, trials } = answering(({ path }) =>
      path.startsWith('/v1/setup_intents')
        ? { id: 'seti_1', object: 'setup_intent', status: 'canceled' }
        : aSubscription({ status: 'canceled' }),
    )

    await trials.cancelUnconfirmed('sub_1')

    expect(asked.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'DELETE /v1/subscriptions/sub_1',
      'POST /v1/setup_intents/seti_1/cancel',
    ])
  })
})

describe('the default payment method', () => {
  const aCard = { id: 'pm_1', object: 'payment_method', type: 'card', card: { fingerprint: 'fp_card' } }
  const aBank = {
    id: 'pm_2',
    object: 'payment_method',
    type: 'us_bank_account',
    us_bank_account: { fingerprint: 'fp_bank' },
  }

  it('answers the fingerprint of one Stripe already saved, and changes nothing', async () => {
    const { asked, trials } = answering(() => aSubscription({ default_payment_method: aCard }))

    expect(await trials.confirmDefaultPaymentMethod('sub_1', 'cus_1')).toEqual({ fingerprint: 'fp_card' })
    expect(asked.filter(({ method }) => method === 'POST')).toEqual([])
  })

  it('sets the newest the customer holds where Stripe has not, and reads a bank’s fingerprint', async () => {
    const { asked, trials } = answering(({ path }) =>
      path.endsWith('/payment_methods') ? list(aBank) : aSubscription(),
    )

    expect(await trials.confirmDefaultPaymentMethod('sub_1', 'cus_1')).toEqual({ fingerprint: 'fp_bank' })

    const update = asked.at(-1)!
    expect(update).toMatchObject({ method: 'POST', path: '/v1/subscriptions/sub_1' })
    expect(update.body.get('default_payment_method')).toBe('pm_2')
  })

  it('answers no fingerprint for Link, which has none', async () => {
    const link = { id: 'pm_3', object: 'payment_method', type: 'link', link: { email: null } }
    const { trials } = answering(() => aSubscription({ default_payment_method: link }))

    expect(await trials.confirmDefaultPaymentMethod('sub_1', 'cus_1')).toEqual({ fingerprint: null })
  })

  it('answers null where the customer holds nothing', async () => {
    const { trials } = answering(({ path }) =>
      path.endsWith('/payment_methods') ? list() : aSubscription(),
    )

    expect(await trials.confirmDefaultPaymentMethod('sub_1', 'cus_1')).toBeNull()
  })
})

describe('the phases after the free days', () => {
  const aSchedule = {
    id: 'sub_sched_1',
    object: 'subscription_schedule',
    phases: [{ start_date: 1_790_000_000, end_date: 1_792_000_000 }],
  }
  const scheduling = (subscription = aSubscription()) =>
    answering(({ path }) =>
      path.startsWith('/v1/subscription_schedules') ? aSchedule : subscription,
    )

  const updateOf = (asked: readonly Asked[]) => asked.at(-1)!.body

  it('become a schedule made from the Subscription, for EXPO26 monthly', async () => {
    const { asked, trials } = scheduling()

    await trials.schedulePhases(
      'sub_1',
      paidPhasesOf({ cycle: 'month', offer: 'exponential', plantYear: false }),
    )

    const made = asked.find(({ method, path }) => method === 'POST' && path === '/v1/subscription_schedules')
    expect(made?.body.get('from_subscription')).toBe('sub_1')

    expect(Object.fromEntries(updateOf(asked))).toMatchObject({
      end_behavior: 'release',
      proration_behavior: 'none',
      // The free days, exactly as Stripe has them.
      'phases[0][items][0][price]': 'price_97',
      'phases[0][start_date]': '1790000000',
      'phases[0][end_date]': '1792000000',
      'phases[0][trial_end]': '1792000000',
      // Twelve months at the offer, from the first paid bill.
      'phases[1][items][0][price]': 'price_97',
      'phases[1][duration][interval]': 'month',
      'phases[1][duration][interval_count]': '12',
      'phases[1][discounts][0][coupon]': STRIPE_COUPONS.exponentialYear.id,
      // Then one with no discount at all, so a released Subscription keeps none.
      'phases[2][items][0][price]': 'price_97',
      'phases[2][duration][interval_count]': '1',
      'phases[2][discounts]': '',
    })
  })

  it('run a year at a time for a yearly church', async () => {
    const { asked, trials } = scheduling()

    await trials.schedulePhases('sub_1', paidPhasesOf({ cycle: 'year', offer: 'exponential', plantYear: false }))

    expect(updateOf(asked).get('phases[1][duration][interval]')).toBe('year')
    expect(updateOf(asked).get('phases[1][duration][interval_count]')).toBe('1')
  })

  it('use the schedule already there, so doing it twice is doing it once', async () => {
    const { asked, trials } = scheduling(aSubscription({ schedule: 'sub_sched_1' }))

    await trials.schedulePhases('sub_1', paidPhasesOf({ cycle: 'month', offer: 'referral', plantYear: false }))

    expect(asked.some(({ method, path }) => method === 'POST' && path === '/v1/subscription_schedules')).toBe(false)
    expect(updateOf(asked).get('phases[1][discounts][0][coupon]')).toBe(STRIPE_COUPONS.firstMonth.id)
  })
})

describe('the catalog', () => {
  it('creates everything in an empty account, with the product named as James said', async () => {
    const { asked, client } = answering(({ method, path }) => {
      if (method === 'POST') return { id: 'made', object: path.split('/').at(-1) }
      if (path === '/v1/prices') return list()
      return undefined
    })

    const result = await createCatalog(client)

    expect(result.created).toHaveLength(1 + 4 + 4)
    expect(result.different).toEqual([])

    const product = asked.find(({ method, path }) => method === 'POST' && path === '/v1/products')!
    expect(Object.fromEntries(product.body)).toEqual({
      id: 'discipler_for_churches',
      name: 'Discipler for Churches',
    })

    const prices = asked.filter(({ method, path }) => method === 'POST' && path === '/v1/prices')
    expect(prices.map(({ body }) => [body.get('unit_amount'), body.get('recurring[interval]')])).toEqual([
      ['9700', 'month'],
      ['93120', 'year'],
      ['14700', 'month'],
      ['141120', 'year'],
    ])

    const coupons = asked.filter(({ method, path }) => method === 'POST' && path === '/v1/coupons')
    expect(coupons.every(({ body }) => body.get('duration') === 'forever')).toBe(true)
    expect(coupons.map(({ body }) => body.get('percent_off') ?? body.get('amount_off'))).toEqual([
      '20',
      '100',
      '7760',
      '100',
    ])
  })

  it('adds nothing to an account that has it all, and reports what differs', async () => {
    const { asked, client } = answering(({ path, query }) => {
      if (path === '/v1/prices') {
        const key = query.get('lookup_keys[0]')!
        const cents = { discipler_up_to_the_limit_monthly: 9_700, discipler_up_to_the_limit_yearly: 93_120, discipler_above_the_limit_monthly: 14_700, discipler_above_the_limit_yearly: 1 }[key]
        return list({
          id: 'price_x',
          object: 'price',
          unit_amount: cents,
          currency: 'usd',
          recurring: { interval: key.endsWith('monthly') ? 'month' : 'year' },
        })
      }
      if (path.startsWith('/v1/products')) return { id: 'discipler_for_churches', object: 'product', name: 'Discipler for Churches' }
      const id = path.split('/').at(-1)!
      const coupon = Object.values(STRIPE_COUPONS).find((known) => known.id === id)!
      return {
        id,
        object: 'coupon',
        duration: 'forever',
        percent_off: 'percentOff' in coupon ? coupon.percentOff : null,
        amount_off: 'centsOff' in coupon ? coupon.centsOff : null,
        currency: 'centsOff' in coupon ? 'usd' : null,
      }
    })

    const result = await createCatalog(client)

    expect(result.created).toEqual([])
    expect(result.alreadyThere).toHaveLength(9)
    expect(result.different).toEqual(['discipler_above_the_limit_yearly'])
    expect(asked.every(({ method }) => method === 'GET')).toBe(true)
  })
})
