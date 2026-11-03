import Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stripeTakesLiveEvents } from '~/platform/deployment'
import { admittedStripeEvent } from '~/platform/stripe/webhook'

/**
 * Who may speak to the webhook (Exponential launch, ticket 03), through Stripe's own
 * verification and a signature made the way Stripe makes one. No request leaves.
 */
const SECRET = 'whsec_test_only'

const body = (livemode: boolean) =>
  JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'invoice.paid',
    livemode,
    created: 1_793_000_000,
    data: { object: { object: 'invoice', id: 'in_1', customer: 'cus_1' } },
  })

const signed = (payload: string, secret = SECRET, timestamp?: number) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) })

const staging = { DISCIPLER_ENVIRONMENT: 'staging', STRIPE_WEBHOOK_SECRET: SECRET }
const production = { VERCEL_ENV: 'production', STRIPE_WEBHOOK_SECRET: SECRET }

describe('admitting a Stripe event', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('admits one signed with the secret, in the deployment’s mode', () => {
    const payload = body(false)

    const event = admittedStripeEvent(payload, signed(payload), staging)

    expect(event).toMatchObject({ id: 'evt_1', type: 'invoice.paid', livemode: false })
    expect(event?.object).toMatchObject({ id: 'in_1' })
  })

  it('refuses every request when the secret is unset', () => {
    const payload = body(false)

    expect(admittedStripeEvent(payload, signed(payload), {})).toBeNull()
    expect(admittedStripeEvent(payload, signed(payload), { STRIPE_WEBHOOK_SECRET: '' })).toBeNull()
  })

  it('refuses a request with no signature', () => {
    expect(admittedStripeEvent(body(false), null, staging)).toBeNull()
  })

  it('refuses a signature made with another secret', () => {
    const payload = body(false)

    expect(admittedStripeEvent(payload, signed(payload, 'whsec_someone_else'), staging)).toBeNull()
  })

  it('refuses a body changed after it was signed', () => {
    const signature = signed(body(false))

    expect(admittedStripeEvent(body(true), signature, staging)).toBeNull()
  })

  it('refuses a good signature past Stripe’s default tolerance', () => {
    const payload = body(false)
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600

    expect(admittedStripeEvent(payload, signed(payload, SECRET, anHourAgo), staging)).toBeNull()
  })

  it('refuses a test-mode event at production', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = body(false)

    expect(admittedStripeEvent(payload, signed(payload), production)).toBeNull()
  })

  it('takes a live event at production', () => {
    const payload = body(true)

    expect(admittedStripeEvent(payload, signed(payload), production)).toMatchObject({ livemode: true })
  })

  it('refuses a live event at staging', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = body(true)

    expect(admittedStripeEvent(payload, signed(payload), staging)).toBeNull()
  })

  it('logs a refused mode by the event’s ID and type alone', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = body(false)

    admittedStripeEvent(payload, signed(payload), production)

    expect(warned.mock.calls.flat().join(' ')).toContain('evt_1')
    expect(warned.mock.calls.flat().join(' ')).not.toMatch(/cus_1|in_1/)
  })
})

describe('which mode a deployment takes', () => {
  it('is live on production and test everywhere else', () => {
    expect(stripeTakesLiveEvents({ VERCEL_ENV: 'production' })).toBe(true)
    expect(stripeTakesLiveEvents({ VERCEL_TARGET_ENV: 'production' })).toBe(true)
    expect(stripeTakesLiveEvents({ VERCEL_TARGET_ENV: 'staging' })).toBe(false)
    expect(stripeTakesLiveEvents({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(stripeTakesLiveEvents({})).toBe(false)
  })
})
