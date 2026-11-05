import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { ministryId } from '~/domain/ids'
import { createStripeAccount } from '~/platform/stripe/account'
import { factsOf } from '~/platform/stripe/billing'

/**
 * The Billing page's Stripe calls (Exponential launch, ticket 33), through the real SDK and
 * against a `fetch` that answers as Stripe's API does. Whether Stripe then does as it
 * documents is a sandbox's to prove: what is tested is what is asked for.
 */
interface Asked {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly body: URLSearchParams
}

const answering = (answer: (asked: Asked) => unknown) => {
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
    const error = (answered as { error?: { status?: number } } | undefined)?.error
    return new Response(
      JSON.stringify(answered ?? { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such thing' } }),
      { status: error?.status ?? (answered === undefined ? 404 : 200), headers: { 'content-type': 'application/json' } },
    )
  }
  const client = new Stripe('rk_test_not_a_real_key', {
    httpClient: Stripe.createFetchHttpClient(fake as typeof fetch),
    maxNetworkRetries: 0,
  })
  return { asked, account: createStripeAccount(() => client) }
}

const list = (...data: unknown[]) => ({ object: 'list', data, has_more: false, url: '/v1/x' })

const DAY = 24 * 60 * 60
const NOW = 1_790_000_000
const AT = new Date(NOW * 1000)

const VISA = {
  id: 'pm_visa',
  object: 'payment_method',
  type: 'card',
  card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2029 },
}

const aSchedule = (changes: Record<string, unknown> = {}) => ({
  id: 'sub_sched_1',
  object: 'subscription_schedule',
  end_behavior: 'release',
  metadata: {},
  current_phase: { start_date: NOW - 10 * DAY, end_date: NOW + 50 * DAY },
  phases: [
    { start_date: NOW - 10 * DAY, end_date: NOW + 50 * DAY, discounts: [] },
    {
      start_date: NOW + 50 * DAY,
      end_date: NOW + 415 * DAY,
      discounts: [{ coupon: 'discipler_exponential_special_offer' }],
    },
    { start_date: NOW + 415 * DAY, end_date: NOW + 445 * DAY, discounts: [] },
  ],
  ...changes,
})

const aSubscription = (changes: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  status: 'trialing',
  created: NOW - 10 * DAY,
  latest_invoice: null,
  pending_setup_intent: null,
  default_payment_method: VISA,
  schedule: aSchedule(),
  trial_start: NOW - 10 * DAY,
  trial_end: NOW + 50 * DAY,
  cancel_at: null,
  cancel_at_period_end: false,
  ended_at: null,
  metadata: {},
  items: {
    object: 'list',
    data: [
      {
        id: 'si_1',
        current_period_end: NOW + 50 * DAY,
        price: {
          id: 'price_97',
          unit_amount: 9_700,
          lookup_key: 'discipler_up_to_the_limit_monthly',
          recurring: { interval: 'month' },
        },
      },
    ],
  },
  ...changes,
})

const aCustomer = (changes: Record<string, unknown> = {}) => ({
  id: 'cus_1',
  object: 'customer',
  balance: 0,
  invoice_settings: { default_payment_method: null },
  ...changes,
})

const stripeHolding = (
  subscriptions: readonly unknown[],
  {
    customer = aCustomer(),
    preview = { id: 'upcoming', object: 'invoice', total: 7_760, amount_due: 7_760 },
  }: { customer?: unknown; preview?: unknown } = {},
) =>
  answering(({ path }) => {
    if (path === '/v1/subscriptions') return list(...subscriptions)
    if (path === '/v1/customers/cus_1') return customer
    if (path === '/v1/invoices/create_preview') return preview
    return undefined
  })

describe('a church’s plan', () => {
  it('reads a trial on a schedule, previewing the schedule so its next phase counts', async () => {
    const { asked, account } = stripeHolding([aSubscription()])

    const picture = await account.pictureOf('cus_1', AT)

    expect(picture).toMatchObject({
      subscriptionId: 'sub_1',
      onASchedule: true,
      status: 'trialing',
      cycle: 'month',
      priceCents: 9_700,
      aboveTheLimit: false,
      trial: { days: 60, endsAt: new Date((NOW + 50 * DAY) * 1000) },
      nextPayment: { cents: 7_760, fullCents: 7_760, at: new Date((NOW + 50 * DAY) * 1000) },
      offers: [{ kind: 'exponential', endsAt: new Date((NOW + 415 * DAY) * 1000) }],
      method: { kind: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 },
      failed: null,
    })
    const preview = asked.find(({ path }) => path === '/v1/invoices/create_preview')!
    expect(preview.body.get('schedule')).toBe('sub_sched_1')
    expect(preview.body.has('subscription')).toBe(false)
  })

  it('previews a Subscription with no schedule as itself', async () => {
    const { asked, account } = stripeHolding([aSubscription({ schedule: null, status: 'active', trial_start: null, trial_end: null })])

    const picture = await account.pictureOf('cus_1', AT)

    expect(picture).toMatchObject({ onASchedule: false, trial: null, offers: [] })
    expect(asked.find(({ path }) => path === '/v1/invoices/create_preview')!.body.get('subscription')).toBe('sub_1')
  })

  it('is correct with Link, which gives no details', async () => {
    const { account } = stripeHolding([
      aSubscription({ default_payment_method: { id: 'pm_link', object: 'payment_method', type: 'link', link: {} } }),
    ])

    expect((await account.pictureOf('cus_1', AT))?.method).toEqual({ kind: 'link' })
  })

  it('reads a bank account', async () => {
    const { account } = stripeHolding([
      aSubscription({
        default_payment_method: {
          id: 'pm_bank',
          object: 'payment_method',
          type: 'us_bank_account',
          us_bank_account: { bank_name: 'Chase', account_type: 'checking', last4: '6789' },
        },
      }),
    ])

    expect((await account.pictureOf('cus_1', AT))?.method).toEqual({
      kind: 'bank',
      bankName: 'Chase',
      accountType: 'checking',
      last4: '6789',
    })
  })

  it('falls back on the customer’s default', async () => {
    const { account } = stripeHolding([aSubscription({ default_payment_method: null })], {
      customer: aCustomer({ invoice_settings: { default_payment_method: VISA } }),
    })

    expect((await account.pictureOf('cus_1', AT))?.method).toMatchObject({ kind: 'card', last4: '4242' })
  })

  it('reads credit, and what will be left after the next bill', async () => {
    const { account } = stripeHolding([aSubscription({ status: 'active', trial_start: null, trial_end: null })], {
      customer: aCustomer({ balance: -9_700 }),
      preview: { id: 'upcoming', object: 'invoice', total: 7_760, amount_due: 0 },
    })

    expect(await account.pictureOf('cus_1', AT)).toMatchObject({
      nextPayment: { cents: 0, fullCents: 7_760 },
      creditCents: 9_700,
      creditLeftCents: 1_940,
    })
  })

  it('takes "nothing more to bill" as an answer', async () => {
    const { account } = stripeHolding([aSubscription()], {
      preview: { error: { status: 400, type: 'invalid_request_error', code: 'invoice_upcoming_none', message: 'None' } },
    })

    expect((await account.pictureOf('cus_1', AT))?.nextPayment).toBeNull()
  })

  it('reads a failed payment from the latest invoice, and asks for no preview', async () => {
    const { asked, account } = stripeHolding([
      aSubscription({
        status: 'past_due',
        trial_start: null,
        trial_end: null,
        latest_invoice: {
          id: 'in_9',
          object: 'invoice',
          amount_due: 7_760,
          created: NOW - 3 * DAY,
          status_transitions: { finalized_at: NOW - 2 * DAY },
          next_payment_attempt: NOW + DAY,
        },
      }),
    ])

    expect(await account.pictureOf('cus_1', AT)).toMatchObject({
      status: 'past_due',
      nextPayment: null,
      failed: {
        cents: 7_760,
        on: new Date((NOW - 2 * DAY) * 1000),
        retriesOn: new Date((NOW + DAY) * 1000),
      },
    })
    expect(asked.some(({ path }) => path === '/v1/invoices/create_preview')).toBe(false)
  })

  it('reads a cancellation made on the schedule, and the offers it kept', async () => {
    const kept = JSON.stringify([
      { e: NOW + 50 * DAY, c: null },
      { e: NOW + 415 * DAY, c: 'discipler_exponential_special_offer' },
      { e: NOW + 445 * DAY, c: null },
    ])
    const { asked, account } = stripeHolding([
      aSubscription({
        schedule: aSchedule({
          end_behavior: 'cancel',
          metadata: { discipler_phases_kept: kept },
          phases: [{ start_date: NOW - 10 * DAY, end_date: NOW + 50 * DAY, discounts: [] }],
        }),
      }),
    ])

    expect(await account.pictureOf('cus_1', AT)).toMatchObject({
      cancelsAt: new Date((NOW + 50 * DAY) * 1000),
      nextPayment: null,
      offers: [{ kind: 'exponential' }],
    })
    expect(asked.some(({ path }) => path === '/v1/invoices/create_preview')).toBe(false)
  })

  it('says what ended, and when', async () => {
    const { account } = stripeHolding([
      aSubscription({ status: 'canceled', trial_start: null, trial_end: null, ended_at: NOW - DAY, schedule: null }),
    ])

    expect(await account.pictureOf('cus_1', AT)).toMatchObject({
      status: 'canceled',
      endedAt: new Date((NOW - DAY) * 1000),
      nextPayment: null,
    })
  })

  it('reads what ended, not a restart whose first payment has not gone through', async () => {
    const { account } = stripeHolding([
      aSubscription({ id: 'sub_restart', status: 'incomplete', created: NOW, schedule: null, trial_start: null, trial_end: null }),
      aSubscription({ id: 'sub_ended', status: 'canceled', ended_at: NOW - DAY, schedule: null, trial_start: null, trial_end: null }),
    ])

    expect((await account.pictureOf('cus_1', AT))?.subscriptionId).toBe('sub_ended')
  })

  it('has nothing to say about a trial nobody confirmed', async () => {
    const { account } = stripeHolding([
      aSubscription({ pending_setup_intent: { id: 'seti_1', object: 'setup_intent', status: 'requires_payment_method' } }),
    ])

    expect(await account.pictureOf('cus_1', AT)).toBeNull()
  })

  it('has nothing to say about a customer with none', async () => {
    const { account } = stripeHolding([])

    expect(await account.pictureOf('cus_1', AT)).toBeNull()
  })
})

describe('what the webhook reads of a cancellation', () => {
  it('sees one made on the schedule, which the Subscription itself does not say', () => {
    const facts = factsOf(
      aSubscription({
        schedule: aSchedule({
          end_behavior: 'cancel',
          phases: [{ start_date: NOW - 10 * DAY, end_date: NOW + 50 * DAY, discounts: [] }],
        }),
      }) as unknown as Stripe.Subscription,
    )

    expect(facts.cancelsAt).toEqual(new Date((NOW + 50 * DAY) * 1000))
  })
})

describe('past bills', () => {
  const anInvoice = (changes: Record<string, unknown>) => ({
    id: 'in_1',
    object: 'invoice',
    status: 'paid',
    created: NOW,
    status_transitions: { finalized_at: NOW },
    billing_reason: 'subscription_cycle',
    total: 7_760,
    amount_due: 7_760,
    attempted: true,
    hosted_invoice_url: 'https://invoice.example/1',
    lines: { object: 'list', data: [{ period: { start: NOW - 30 * DAY, end: NOW } }] },
    ...changes,
  })

  it('lists what was billed, and not what never was', async () => {
    const { account } = answering(({ path }) => {
      if (path === '/v1/invoices') {
        return list(
          anInvoice({ id: 'in_paid' }),
          anInvoice({ id: 'in_year', lines: { object: 'list', data: [{ period: { start: NOW - 365 * DAY, end: NOW } }] } }),
          anInvoice({ id: 'in_free', billing_reason: 'subscription_create', total: 0, amount_due: 0 }),
          anInvoice({ id: 'in_draft', status: 'draft' }),
          anInvoice({ id: 'in_void', status: 'void' }),
          anInvoice({ id: 'in_untried', status: 'open', attempted: false }),
          anInvoice({ id: 'in_failed', status: 'open' }),
          anInvoice({ id: 'in_debit', status: 'open' }),
        )
      }
      if (path === '/v1/invoices/in_failed') return anInvoice({ id: 'in_failed', payments: { data: [] } })
      if (path === '/v1/invoices/in_debit') {
        return anInvoice({
          id: 'in_debit',
          payments: { data: [{ payment: { payment_intent: { id: 'pi_1', object: 'payment_intent', status: 'processing' } } }] },
        })
      }
      return undefined
    })

    const bills = await account.billsOf('cus_1')

    expect(bills.map(({ what, status, cents }) => [what, status, cents])).toEqual([
      ['month', 'paid', 7_760],
      ['year', 'paid', 7_760],
      ['free_trial', 'paid', 0],
      ['month', 'not_paid', 7_760],
      ['month', 'processing', 7_760],
    ])
    expect(bills[0]?.viewAt).toBe('https://invoice.example/1')
  })
})

describe('opening Stripe’s billing page', () => {
  const portal = () =>
    answering(({ path, method }) => {
      if (path === '/v1/billing_portal/configurations') {
        return list(
          { id: 'bpc_default', object: 'billing_portal.configuration', metadata: {} },
          { id: 'bpc_ours', object: 'billing_portal.configuration', metadata: { discipler: 'billing_portal' } },
        )
      }
      if (path === '/v1/billing_portal/sessions' && method === 'POST') {
        return { id: 'bps_1', object: 'billing_portal.session', url: 'https://billing.stripe.example/s' }
      }
      return undefined
    })

  it('goes straight to the new card, on Discipler’s configuration, and comes back', async () => {
    const { asked, account } = portal()

    const address = await account.portalAddress({
      customerId: 'cus_1',
      step: 'update_method',
      subscriptionId: 'sub_1',
      returnTo: 'https://app.example/settings/billing',
    })

    expect(address).toBe('https://billing.stripe.example/s')
    const session = asked.find(({ path }) => path === '/v1/billing_portal/sessions')!
    expect(Object.fromEntries(session.body)).toEqual({
      customer: 'cus_1',
      configuration: 'bpc_ours',
      return_url: 'https://app.example/settings/billing',
      'flow_data[type]': 'payment_method_update',
      'flow_data[after_completion][type]': 'redirect',
      'flow_data[after_completion][redirect][return_url]': 'https://app.example/settings/billing',
    })
  })

  it('goes straight to cancelling that Subscription', async () => {
    const { asked, account } = portal()

    await account.portalAddress({
      customerId: 'cus_1',
      step: 'cancel',
      subscriptionId: 'sub_1',
      returnTo: 'https://app.example/settings/billing',
    })

    const session = asked.find(({ path }) => path === '/v1/billing_portal/sessions')!
    expect(session.body.get('flow_data[type]')).toBe('subscription_cancel')
    expect(session.body.get('flow_data[subscription_cancel][subscription]')).toBe('sub_1')
  })

  it('refuses to fall back on Stripe’s default configuration, which has a login page and plan switching', async () => {
    const { asked, account } = answering(({ path }) =>
      path === '/v1/billing_portal/configurations' ? list({ id: 'bpc_default', metadata: {} }) : undefined,
    )

    await expect(
      account.portalAddress({ customerId: 'cus_1', step: 'cancel', subscriptionId: 'sub_1', returnTo: 'https://a.example' }),
    ).rejects.toThrow(/no configuration/)
    expect(asked.some(({ path }) => path === '/v1/billing_portal/sessions')).toBe(false)
  })
})

describe('cancelling and keeping', () => {
  const holding = (subscription: unknown) =>
    answering(({ path, method }) => {
      if (path === '/v1/subscriptions/sub_1' && method === 'GET') return subscription
      if (method === 'POST') return { id: 'x', object: 'x' }
      return undefined
    })

  const posted = (asked: readonly Asked[]) => asked.filter(({ method }) => method === 'POST')

  it('cancels a trial on a schedule at the end of its free days, and keeps what it would have billed', async () => {
    const { asked, account } = holding(aSubscription())

    await account.cancelOnItsSchedule('sub_1')

    const [update] = posted(asked)
    expect(update?.path).toBe('/v1/subscription_schedules/sub_sched_1')
    const body = Object.fromEntries(update!.body)
    expect(body).toMatchObject({
      end_behavior: 'cancel',
      proration_behavior: 'none',
      'phases[0][end_date]': String(NOW + 50 * DAY),
      'phases[0][trial_end]': String(NOW + 50 * DAY),
    })
    expect(body['phases[1][end_date]']).toBeUndefined()
    expect(JSON.parse(body['metadata[discipler_phases_kept]']!)).toEqual([
      { e: NOW + 50 * DAY, c: null },
      { e: NOW + 415 * DAY, c: 'discipler_exponential_special_offer' },
      { e: NOW + 445 * DAY, c: null },
    ])
  })

  it('cancels a paying church at its next bill, keeping the discount it has until then', async () => {
    const running = {
      start_date: NOW - 100 * DAY,
      end_date: NOW + 265 * DAY,
      discounts: [{ coupon: 'discipler_exponential_special_offer' }],
    }
    const { asked, account } = holding(
      aSubscription({
        status: 'active',
        trial_start: null,
        trial_end: null,
        items: { object: 'list', data: [{ id: 'si_1', current_period_end: NOW + 20 * DAY, price: { id: 'price_97' } }] },
        schedule: aSchedule({ current_phase: { start_date: NOW - 100 * DAY }, phases: [running] }),
      }),
    )

    await account.cancelOnItsSchedule('sub_1')

    expect(Object.fromEntries(posted(asked)[0]!.body)).toMatchObject({
      'phases[0][end_date]': String(NOW + 20 * DAY),
      'phases[0][discounts][0][coupon]': 'discipler_exponential_special_offer',
      'phases[0][proration_behavior]': 'none',
    })
  })

  it('does nothing asked twice, which would lose what it kept', async () => {
    const { asked, account } = holding(aSubscription({ schedule: aSchedule({ end_behavior: 'cancel' }) }))

    await account.cancelOnItsSchedule('sub_1')

    expect(posted(asked)).toEqual([])
  })

  it('keeps a Subscription on a schedule by putting back what it would have billed', async () => {
    const kept = JSON.stringify([
      { e: NOW + 50 * DAY, c: null },
      { e: NOW + 415 * DAY, c: 'discipler_exponential_special_offer' },
      { e: NOW + 445 * DAY, c: null },
    ])
    const { asked, account } = holding(
      aSubscription({
        schedule: aSchedule({
          end_behavior: 'cancel',
          metadata: { discipler_phases_kept: kept },
          phases: [{ start_date: NOW - 10 * DAY, end_date: NOW + 50 * DAY, discounts: [] }],
        }),
      }),
    )

    await account.keep('sub_1')

    const body = Object.fromEntries(posted(asked)[0]!.body)
    expect(posted(asked)[0]?.path).toBe('/v1/subscription_schedules/sub_sched_1')
    expect(body).toMatchObject({
      end_behavior: 'release',
      'phases[0][end_date]': String(NOW + 50 * DAY),
      'phases[1][end_date]': String(NOW + 415 * DAY),
      'phases[1][discounts][0][coupon]': 'discipler_exponential_special_offer',
      'phases[2][end_date]': String(NOW + 445 * DAY),
      'metadata[discipler_phases_kept]': '',
    })
  })

  it('keeps a Subscription its billing page cancelled at the period’s end', async () => {
    const { asked, account } = holding(aSubscription({ schedule: null, cancel_at_period_end: true }))

    await account.keep('sub_1')

    expect(posted(asked).map(({ path, body }) => [path, Object.fromEntries(body)])).toEqual([
      ['/v1/subscriptions/sub_1', { cancel_at_period_end: 'false' }],
    ])
  })

  it('keeps a Subscription its billing page cancelled with a date', async () => {
    const { asked, account } = holding(aSubscription({ schedule: null, cancel_at: NOW + DAY }))

    await account.keep('sub_1')

    expect(Object.fromEntries(posted(asked)[0]!.body)).toEqual({ cancel_at: '' })
  })
})

describe('restarting', () => {
  const CHURCH = ministryId('11111111-1111-1111-1111-111111111111')

  const stripe = (answers: Record<string, unknown> = {}) =>
    answering(({ path, method }) => {
      if (path === '/v1/prices') return list({ id: 'price_found', object: 'price' })
      if (path === '/v1/subscriptions' && method === 'POST') {
        return aSubscription({
          id: 'sub_new',
          status: 'incomplete',
          schedule: null,
          latest_invoice: { id: 'in_new', object: 'invoice', confirmation_secret: { client_secret: 'pi_new_secret' } },
        })
      }
      return answers[`${method} ${path}`] ?? (method === 'DELETE' ? { id: 'x', object: 'subscription', status: 'canceled' } : undefined)
    })

  it('is billed today at the normal price, with no trial, no discount and no schedule', async () => {
    const { asked, account } = stripe()

    expect(await account.openRestart({ customerId: 'cus_1', church: CHURCH, cycle: 'year', waiting: [] })).toEqual({
      clientSecret: 'pi_new_secret',
    })

    expect(asked[0]?.query.get('lookup_keys[0]')).toBe('discipler_up_to_the_limit_yearly')
    const created = asked.find(({ path, method }) => path === '/v1/subscriptions' && method === 'POST')!
    const body = Object.fromEntries(created.body)
    expect(body).toMatchObject({
      customer: 'cus_1',
      'items[0][price]': 'price_found',
      'items[0][quantity]': '1',
      payment_behavior: 'default_incomplete',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'payment_settings[payment_method_types][0]': 'card',
      'payment_settings[payment_method_types][1]': 'link',
      'payment_settings[payment_method_types][2]': 'us_bank_account',
      'payment_settings[payment_method_options][us_bank_account][verification_method]': 'instant',
      'metadata[ministry_id]': CHURCH,
    })
    expect(Object.keys(body).filter((key) => /trial|discount|coupon|schedule/.test(key))).toEqual([])
  })

  const waiting = (priceId: string) =>
    ({
      id: 'sub_waiting',
      status: 'incomplete',
      awaitingPaymentMethod: false,
      createdAt: new Date(),
      priceId,
      latestInvoiceId: 'in_waiting',
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      cancelsAt: null,
      namedChurch: null,
    }) as const

  it('hands back a first payment still waiting at the same price, so a second press makes no second one', async () => {
    const { asked, account } = stripe({
      'GET /v1/subscriptions/sub_waiting': aSubscription({
        id: 'sub_waiting',
        latest_invoice: { id: 'in_waiting', object: 'invoice', confirmation_secret: { client_secret: 'pi_waiting_secret' } },
      }),
    })

    expect(
      await account.openRestart({ customerId: 'cus_1', church: CHURCH, cycle: 'month', waiting: [waiting('price_found')] }),
    ).toEqual({ clientSecret: 'pi_waiting_secret' })
    expect(asked.some(({ path, method }) => path === '/v1/subscriptions' && method === 'POST')).toBe(false)
  })

  it('ends one waiting at the other price, and makes the one asked for', async () => {
    const { asked, account } = stripe()

    await account.openRestart({ customerId: 'cus_1', church: CHURCH, cycle: 'month', waiting: [waiting('price_other')] })

    expect(asked.some(({ path, method }) => path === '/v1/subscriptions/sub_waiting' && method === 'DELETE')).toBe(true)
    expect(asked.some(({ path, method }) => path === '/v1/subscriptions' && method === 'POST')).toBe(true)
  })

  it('answers no secret where credit left nothing to pay', async () => {
    const { account } = answering(({ path, method }) => {
      if (path === '/v1/prices') return list({ id: 'price_found', object: 'price' })
      if (path === '/v1/subscriptions' && method === 'POST') {
        return aSubscription({
          status: 'active',
          schedule: null,
          latest_invoice: { id: 'in_new', object: 'invoice', confirmation_secret: null },
        })
      }
      return undefined
    })

    expect(await account.openRestart({ customerId: 'cus_1', church: CHURCH, cycle: 'month', waiting: [] })).toEqual({
      clientSecret: null,
    })
  })
})

describe('offering the method on file', () => {
  it('lets the Element show it and nothing else', async () => {
    const { asked, account } = answering(({ path }) =>
      path === '/v1/customer_sessions' ? { object: 'customer_session', client_secret: 'cuss_secret' } : undefined,
    )

    expect(await account.customerSessionSecret('cus_1')).toBe('cuss_secret')

    expect(Object.fromEntries(asked[0]!.body)).toMatchObject({
      customer: 'cus_1',
      'components[payment_element][enabled]': 'true',
      'components[payment_element][features][payment_method_redisplay]': 'enabled',
      'components[payment_element][features][payment_method_save]': 'disabled',
      'components[payment_element][features][payment_method_remove]': 'disabled',
    })
  })
})
