import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comesFromStripe, STRIPE_WEBHOOK_ADDRESSES } from '~/platform/stripe/webhook'

/**
 * Only Stripe's published addresses reach the webhook (Exponential launch, ticket 37),
 * through the handler itself. `deploymentOf` reads the deployment off the environment, and
 * the built server the over-HTTP suites drive is neither production nor staging, so the
 * door is proved here, with a signature that is good, so that nothing but the address can
 * be what turned the request away.
 */
const { container } = vi.hoisted(() => ({
  container: { received: [] as string[] },
}))

vi.mock('~/service/container', () => ({
  getStripeEventInbox: () => ({
    receive: async (entry: { readonly id: string }) => {
      container.received.push(entry.id)
    },
  }),
  processStripeEventAfterTheResponse: async () => undefined,
}))

vi.mock('next/server', async (actual) => ({
  ...(await actual<typeof import('next/server')>()),
  // Outside a request Next has nowhere to hold what comes after the response.
  after: () => undefined,
}))

const { POST } = await import('../../app/stripe/webhook/route')

const SECRET = 'whsec_test_only'
const STRIPES = '54.187.174.169'
const SOMEBODY = '203.0.113.9'

const posted = (from: string | null) => {
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'invoice.paid',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { object: 'invoice', id: 'in_1', customer: 'cus_1' } },
  })
  return POST(
    new NextRequest('https://staging.example/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }),
        ...(from ? { 'x-forwarded-for': from } : {}),
      },
      body: payload,
    }),
  )
}

describe('the webhook on a deployment Stripe sends to', () => {
  beforeEach(() => {
    container.received = []
    vi.stubEnv('DISCIPLER_ENVIRONMENT', 'staging')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('takes an event from one of Stripe’s addresses', async () => {
    expect((await posted(STRIPES)).status).toBe(200)
    expect(container.received).toEqual(['evt_1'])
  })

  it('turns away a correctly signed event from anywhere else, keeps nothing, and says so in the log', async () => {
    expect((await posted(SOMEBODY)).status).toBe(400)
    expect(container.received).toEqual([])
    expect(console.warn).toHaveBeenCalledOnce()
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).not.toContain(SOMEBODY)
  })

  it('turns away a request whose address cannot be told', async () => {
    expect((await posted(null)).status).toBe(400)
    expect(container.received).toEqual([])
  })

  it('reads the client from the front of a list, so a proxy cannot speak for Stripe by being last', async () => {
    expect((await posted(`${SOMEBODY}, ${STRIPES}`)).status).toBe(400)
  })
})

describe('whose addresses count', () => {
  it('holds Stripe’s list as published, and it is the only thing allowed through on production', () => {
    expect(STRIPE_WEBHOOK_ADDRESSES.size).toBe(15)
    expect(comesFromStripe(STRIPES, { VERCEL_ENV: 'production' })).toBe(true)
    expect(comesFromStripe(SOMEBODY, { VERCEL_ENV: 'production' })).toBe(false)
    expect(comesFromStripe(null, { VERCEL_ENV: 'production' })).toBe(false)
  })

  it('leaves a developer’s machine and a Preview to the signature, which is all `stripe listen` has', () => {
    expect(comesFromStripe('127.0.0.1', {})).toBe(true)
    expect(comesFromStripe(SOMEBODY, { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' })).toBe(true)
  })
})
