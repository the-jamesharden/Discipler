import pg from 'pg'
import Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, skipUnlessAppIsRunning, stripeWebhookSecret } from '../support/app'
import { localSupabase } from '../support/local-supabase'

/**
 * The Stripe webhook as Stripe reaches it (Exponential launch, ticket 03), against the
 * built server: a request signed the way Stripe signs one, with the secret the server
 * was started with. What an admitted event then establishes is
 * `billing-records.test.ts`, against a fake Stripe; the server here has no Stripe key,
 * and processing after the response leaves the event for the sweep.
 */
const unique = () => crypto.randomUUID().replaceAll('-', '')

describe.skipIf(skipUnlessAppIsRunning)('the Stripe webhook, over HTTP', () => {
  let pool: pg.Pool
  const sent: string[] = []

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.query(`delete from stripe_event where id = any ($1)`, [sent])
    await pool.end()
  })

  const anEvent = (livemode = false) => {
    const id = `evt_${unique()}`
    sent.push(id)
    return {
      id,
      payload: JSON.stringify({
        id,
        object: 'event',
        type: 'customer.subscription.updated',
        livemode,
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            object: 'subscription',
            id: `sub_${unique()}`,
            customer: `cus_${unique()}`,
            metadata: {},
          },
        },
      }),
    }
  }

  const post = (payload: string, signature?: string) =>
    fetch(`${baseUrl}/stripe/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'stripe-signature': signature } : {}),
      },
      body: payload,
    })

  const signed = (payload: string, secret = stripeWebhookSecret!) =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret })

  const inboxRows = async (id: string) => {
    const { rows } = await pool.query(`select * from stripe_event where id = $1`, [id])
    return rows
  }

  it('is given a secret to verify with by whatever started the server', () => {
    expect(stripeWebhookSecret).toBeTruthy()
  })

  it('refuses a request with no signature, and says nothing', async () => {
    const { id, payload } = anEvent()

    const response = await post(payload)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('')
    expect(await inboxRows(id)).toEqual([])
  })

  it('refuses a forged signature, and says nothing', async () => {
    const { id, payload } = anEvent()

    const response = await post(payload, signed(payload, 'whsec_a_forger_guessing'))

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('')
    expect(await inboxRows(id)).toEqual([])
  })

  it('refuses a live event at a deployment that is not production', async () => {
    const { id, payload } = anEvent(true)

    const response = await post(payload, signed(payload))

    expect(response.status).toBe(400)
    expect(await inboxRows(id)).toEqual([])
  })

  it('keeps a verified event and answers before it is processed', async () => {
    const { id, payload } = anEvent()

    const response = await post(payload, signed(payload))

    expect(response.status).toBe(200)
    expect(await inboxRows(id)).toMatchObject([
      { id, type: 'customer.subscription.updated', livemode: false },
    ])
  })

  it('keeps a replayed event once', async () => {
    const { id, payload } = anEvent()

    const first = await post(payload, signed(payload))
    const second = await post(payload, signed(payload))

    expect([first.status, second.status]).toEqual([200, 200])
    expect(await inboxRows(id)).toHaveLength(1)
  })
})
