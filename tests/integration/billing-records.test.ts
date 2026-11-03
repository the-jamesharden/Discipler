import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  stripeInboxEntryOf,
  type StripeEventEnvelope,
  type StripeSubscriptionFacts,
  type SubscriptionStatus,
} from '~/domain/billing'
import { createTestClock } from '~/domain/clock'
import { ministryId } from '~/domain/ids'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { readPageDocument, resolutionOf } from '~/platform/supabase/page'
import { provisionMinistry } from '~/platform/supabase/provisioning'
import type { BillingEventRefused, StripeBilling, StripeTrials, SupportAlerts } from '~/service/ports'
import {
  processStripeEvent,
  STRIPE_EVENT_LEASE_MS,
  sweepStripeEvents,
  type StripeEventWork,
} from '~/service/stripe-events'
import {
  ACCOUNT_PASSWORD,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The webhook's processing and the records it writes (Exponential launch, ticket 03),
 * against the real schema, the real roles and the real adapters. Stripe is the one
 * fake, at its port: what it answers stands in for what Stripe's API says now, which
 * is deliberately not what the events below say.
 */

const unique = () => crypto.randomUUID().replaceAll('-', '')
const aCustomer = () => `cus_${unique()}`
const anEventId = () => `evt_${unique()}`

const aSubscription = (
  status: SubscriptionStatus,
  changes: Partial<StripeSubscriptionFacts> = {},
): StripeSubscriptionFacts => ({
  id: `sub_${unique()}`,
  status,
  awaitingPaymentMethod: false,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  priceId: 'price_97',
  latestInvoiceId: `in_${unique()}`,
  trialEndsAt: null,
  currentPeriodEndsAt: new Date('2026-12-01T00:00:00Z'),
  cancelsAt: null,
  namedChurch: null,
  ...changes,
})

/** A fake Stripe API: whatever each customer holds now, and a count of the reads. */
const aFakeStripe = () => {
  const held = new Map<string, readonly StripeSubscriptionFacts[]>()
  const charges = new Map<string, string | null>()
  const state = { reads: 0, down: false }
  const stripe: StripeBilling = {
    async subscriptionsOf(customerId) {
      state.reads += 1
      if (state.down) throw new Error(`Stripe is down, about ${customerId}`)
      return held.get(customerId) ?? []
    },
    async customerOfCharge(chargeId) {
      if (state.down) throw new Error(`Stripe is down, about ${chargeId}`)
      return charges.get(chargeId) ?? null
    },
  }
  return { held, charges, state, stripe }
}

describe('Billing records and the Stripe webhook', () => {
  let pool: pg.Pool
  let billing: PostgresBilling
  let riverside: MinistryFixture
  let northgate: MinistryFixture
  let fake: ReturnType<typeof aFakeStripe>
  let told: BillingEventRefused[]
  let work: StripeEventWork
  let customer: string
  const clock = createTestClock(new Date('2026-11-03T15:00:00Z'))

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    billing = createPostgresBilling(localSupabase().databaseUrl)
    northgate = await createMinistryWithAdmin('Northgate Fellowship', undefined, { billedOutsideStripe: false })
  })

  afterAll(async () => {
    await pool.query(`delete from stripe_event`)
    await billing.close()
    await pool.end()
  })

  beforeEach(async () => {
    fake = aFakeStripe()
    told = []
    const alerts: SupportAlerts = {
      async sharedNumbersNearCapacity() {},
      async twilioBalanceLow() {},
      async twilioSpendPassed() {},
      async dailyCapReached() {},
      async billingEventRefused(alert) {
        told.push(alert)
      },
      async textingGateUnread() {},
    }
    work = {
      inbox: billing.inbox,
      records: billing.records,
      stripe: fake.stripe,
      // Nothing here was opened through the route, so nothing here is ever settled.
      trials: {} as StripeTrials,
      alerts,
      clock,
    }

    // A church of its own per test: a customer can be stored once and history can
    // never be cleared, so nothing carries between them.
    riverside = await createMinistryWithAdmin('Riverside Chapel', undefined, { billedOutsideStripe: false })
    customer = aCustomer()
    await billing.records.rememberCustomer(riverside.id, customer, false)
  })

  const anEvent = (
    type: string,
    object: Record<string, unknown>,
    id = anEventId(),
  ): StripeEventEnvelope => ({
    id,
    type,
    livemode: false,
    created: Math.floor(clock.now().getTime() / 1000),
    object,
  })

  const aSubscriptionEvent = (type = 'customer.subscription.updated', changes = {}) =>
    anEvent(type, {
      object: 'subscription',
      id: `sub_${unique()}`,
      customer,
      status: 'active',
      ...changes,
    })

  const delivered = async (event: StripeEventEnvelope) => {
    const isNew = await billing.inbox.receive(stripeInboxEntryOf(event), clock.now())
    return { isNew, processed: await processStripeEvent(work, event.id) }
  }

  const history = async (church: MinistryFixture) => {
    const { rows } = await pool.query(
      `select * from billing_event where ministry_id = $1 order by position`,
      [church.id],
    )
    return rows
  }

  const inboxRow = async (id: string) => {
    const { rows } = await pool.query(`select * from stripe_event where id = $1`, [id])
    return rows[0]
  }

  describe('an event', () => {
    it('records the Subscription as Stripe says it is now, for the church of the stored customer', async () => {
      const subscription = aSubscription('trialing', {
        trialEndsAt: new Date('2026-12-30T00:00:00Z'),
      })
      fake.held.set(customer, [subscription])

      const event = aSubscriptionEvent('customer.subscription.created')
      const { processed } = await delivered(event)

      expect(processed).toBe('recorded')
      expect(await history(riverside)).toMatchObject([
        {
          stripe_event_id: event.id,
          stripe_event_type: 'customer.subscription.created',
          stripe_customer_id: customer,
          stripe_subscription_id: subscription.id,
          subscription_status: 'trialing',
          stripe_price_id: 'price_97',
          livemode: false,
          trial_ends_at: new Date('2026-12-30T00:00:00Z'),
        },
      ])

      const { state, subscriptionId, latestInvoiceId, priceId } = await billing.records.of(riverside.id)
      expect(state).toMatchObject({ standing: 'trialing', hasAccess: true })
      expect(state.trialEndsAt).toEqual(new Date('2026-12-30T00:00:00Z'))
      expect({ subscriptionId, latestInvoiceId, priceId }).toEqual({
        subscriptionId: subscription.id,
        latestInvoiceId: subscription.latestInvoiceId,
        priceId: 'price_97',
      })

      expect(await inboxRow(event.id)).toMatchObject({
        outcome: 'recorded',
        resolved_church: riverside.id,
        refusal: null,
        attempts: 1,
      })
    })

    it('that is replayed is processed once', async () => {
      fake.held.set(customer, [aSubscription('active')])
      const event = aSubscriptionEvent()

      const first = await delivered(event)
      const second = await delivered(event)

      expect(first).toEqual({ isNew: true, processed: 'recorded' })
      expect(second).toEqual({ isNew: false, processed: 'not-claimed' })
      expect(fake.state.reads).toBe(1)
      expect(await history(riverside)).toHaveLength(1)
    })

    it('recorded by a run that died before it could say so is recorded once', async () => {
      fake.held.set(customer, [aSubscription('active')])
      const event = aSubscriptionEvent()
      await delivered(event)
      // As if the row had been written and the inbox never told.
      await pool.query(
        `update stripe_event set processed_at = null, outcome = null, resolved_church = null,
                                 claimed_until = null
          where id = $1`,
        [event.id],
      )

      expect(await processStripeEvent(work, event.id)).toBe('recorded')

      expect(await history(riverside)).toHaveLength(1)
    })

    it('that is late cannot roll a canceled church back to active', async () => {
      // Stripe's answer now, whatever the events say: the church has canceled.
      fake.held.set(customer, [aSubscription('canceled')])
      await delivered(aSubscriptionEvent('customer.subscription.deleted', { status: 'canceled' }))

      // An update sent before the cancellation, arriving after it, saying active.
      await delivered(aSubscriptionEvent('customer.subscription.updated', { status: 'active' }))

      const { state } = await billing.records.of(riverside.id)
      expect(state).toMatchObject({ standing: 'ended', hasAccess: false })
      expect((await history(riverside)).map((row) => row.subscription_status)).toEqual([
        'canceled',
        'canceled',
      ])
    })

    it('about an old subscription cannot end the one a church restarted on', async () => {
      const old = aSubscription('canceled', { createdAt: new Date('2026-01-01T00:00:00Z') })
      const restart = aSubscription('active', { createdAt: new Date('2026-06-01T00:00:00Z') })
      fake.held.set(customer, [old, restart])

      await delivered(aSubscriptionEvent('customer.subscription.deleted', { id: old.id }))

      const { state, subscriptionId } = await billing.records.of(riverside.id)
      expect(state.standing).toBe('active')
      expect(subscriptionId).toBe(restart.id)
    })

    it('processed alongside another cannot land an older reading last', async () => {
      // The first read answers active and takes its time; by the second read Stripe
      // says canceled. Were reads not ordered by the church's lock, the older reading
      // could commit last and bring the church back.
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      let reads = 0
      const racing: StripeEventWork = {
        ...work,
        stripe: {
          ...fake.stripe,
          async subscriptionsOf() {
            reads += 1
            if (reads === 1) {
              await held
              return [aSubscription('active')]
            }
            return [aSubscription('canceled')]
          },
        },
      }

      const older = aSubscriptionEvent()
      const newer = aSubscriptionEvent('customer.subscription.deleted')
      await billing.inbox.receive(stripeInboxEntryOf(older), clock.now())
      await billing.inbox.receive(stripeInboxEntryOf(newer), clock.now())

      const first = processStripeEvent(racing, older.id)
      await vi.waitFor(() => expect(reads).toBe(1), { timeout: 10_000 })
      const second = processStripeEvent(racing, newer.id)
      await new Promise((resolve) => setTimeout(resolve, 100))
      // The second has not read: it is waiting on the church's lock.
      expect(reads).toBe(1)

      release()
      await Promise.all([first, second])

      expect(reads).toBe(2)
      expect((await billing.records.of(riverside.id)).state.standing).toBe('ended')
    })

    it('that names no subscription at all is still history, and establishes none', async () => {
      await delivered(
        anEvent('charge.refunded', { object: 'charge', id: 'ch_alone', customer }),
      )

      expect(await history(riverside)).toMatchObject([
        { stripe_charge_id: 'ch_alone', stripe_subscription_id: null, subscription_status: null },
      ])
      expect((await billing.records.of(riverside.id)).state.standing).toBe('no_subscription')
    })

    it('keeps the last status through an event that found none', async () => {
      fake.held.set(customer, [aSubscription('active')])
      await delivered(aSubscriptionEvent())
      fake.held.set(customer, [])

      await delivered(anEvent('charge.refunded', { object: 'charge', id: 'ch_1', customer }))

      expect((await billing.records.of(riverside.id)).state.standing).toBe('active')
    })

    it('that is a dispute finds its church through the charge', async () => {
      fake.held.set(customer, [aSubscription('active')])
      fake.charges.set('ch_disputed', customer)

      const event = anEvent('charge.dispute.created', {
        object: 'dispute',
        id: 'dp_1',
        charge: 'ch_disputed',
      })
      const { processed } = await delivered(event)

      expect(processed).toBe('recorded')
      expect(await history(riverside)).toMatchObject([
        { stripe_charge_id: 'ch_disputed', stripe_event_type: 'charge.dispute.created' },
      ])
    })

    it('that is an invoice keeps which invoice it was about', async () => {
      fake.held.set(customer, [aSubscription('past_due')])

      await delivered(
        anEvent('invoice.payment_failed', {
          object: 'invoice',
          id: 'in_failed',
          customer,
          parent: { subscription_details: { subscription: 'sub_x', metadata: {} } },
        }),
      )

      expect(await history(riverside)).toMatchObject([{ stripe_invoice_id: 'in_failed' }])
      expect((await billing.records.of(riverside.id)).state).toMatchObject({
        standing: 'past_due',
        hasAccess: true,
      })
    })

    it('of a type nobody subscribed to is kept and acted on no further', async () => {
      const event = anEvent('customer.created', { object: 'customer', id: customer })

      const { processed } = await delivered(event)

      expect(processed).toBe('ignored')
      expect(await inboxRow(event.id)).toMatchObject({ outcome: 'ignored', resolved_church: null })
      expect(fake.state.reads).toBe(0)
      expect(told).toEqual([])
    })

    it('keeps Stripe’s IDs in the inbox and nothing about whoever paid', async () => {
      const event = anEvent('charge.refunded', {
        object: 'charge',
        id: 'ch_1',
        customer,
        billing_details: { email: 'someone@example.com', name: 'Some One' },
        payment_method_details: { card: { last4: '4242' } },
      })

      await delivered(event)

      expect(JSON.stringify(await inboxRow(event.id))).not.toMatch(/someone@|Some One|4242/)
    })
  })

  describe('a refusal', () => {
    it('of an event whose metadata names a different church records nothing and tells support@', async () => {
      fake.held.set(customer, [aSubscription('active')])

      const event = aSubscriptionEvent('customer.subscription.updated', {
        metadata: { ministry_id: northgate.id },
      })
      const { processed } = await delivered(event)

      expect(processed).toBe('refused')
      expect(told).toEqual([
        { eventId: event.id, eventType: event.type, refusal: 'church_mismatch' },
      ])
      expect(await history(riverside)).toEqual([])
      expect(await history(northgate)).toEqual([])
      expect((await billing.records.of(riverside.id)).state.standing).toBe('no_subscription')
      expect(await inboxRow(event.id)).toMatchObject({
        outcome: 'refused',
        refusal: 'church_mismatch',
        resolved_church: riverside.id,
      })
    })

    it('of a Checkout session whose client reference names a different church', async () => {
      const event = anEvent('checkout.session.completed', {
        object: 'checkout.session',
        customer,
        client_reference_id: northgate.id,
      })

      expect((await delivered(event)).processed).toBe('refused')
      expect(told[0]?.refusal).toBe('church_mismatch')
    })

    it('of an event whose re-read Subscription names a different church', async () => {
      fake.held.set(customer, [aSubscription('active', { namedChurch: northgate.id })])

      const event = aSubscriptionEvent()

      expect((await delivered(event)).processed).toBe('refused')
      expect(told[0]?.refusal).toBe('church_mismatch')
      expect(await history(riverside)).toEqual([])
    })

    it('passes an event whose metadata agrees with the stored customer', async () => {
      fake.held.set(customer, [aSubscription('active', { namedChurch: riverside.id })])

      const event = aSubscriptionEvent('customer.subscription.updated', {
        metadata: { ministry_id: riverside.id },
      })

      expect((await delivered(event)).processed).toBe('recorded')
      expect(told).toEqual([])
    })

    it('of a customer no church holds', async () => {
      const event = anEvent('customer.subscription.updated', {
        object: 'subscription',
        customer: aCustomer(),
        // Metadata alone never finds a church.
        metadata: { ministry_id: riverside.id },
      })

      expect((await delivered(event)).processed).toBe('refused')
      expect(told).toEqual([
        { eventId: event.id, eventType: event.type, refusal: 'customer_unknown' },
      ])
      expect(await inboxRow(event.id)).toMatchObject({ resolved_church: null })
      expect(await history(riverside)).toEqual([])
    })

    it('of a dispute on a charge with no customer', async () => {
      const event = anEvent('charge.dispute.created', {
        object: 'dispute',
        charge: 'ch_guest',
      })

      expect((await delivered(event)).processed).toBe('refused')
      expect(told[0]?.refusal).toBe('customer_unknown')
    })

    it('that could not be told to support@ is tried again, not lost', async () => {
      const event = anEvent('customer.subscription.updated', {
        object: 'subscription',
        customer: aCustomer(),
      })
      await billing.inbox.receive(stripeInboxEntryOf(event), clock.now())
      const failing: StripeEventWork = {
        ...work,
        alerts: {
          ...work.alerts,
          async billingEventRefused() {
            throw new Error('the sender is down')
          },
        },
      }

      await expect(processStripeEvent(failing, event.id)).rejects.toThrow('the sender is down')
      expect(await inboxRow(event.id)).toMatchObject({ processed_at: null, outcome: null })

      clock.advanceBy(STRIPE_EVENT_LEASE_MS)
      expect(await processStripeEvent(work, event.id)).toBe('refused')
      expect(told).toHaveLength(1)
    })
  })

  describe('the sweep', () => {
    it('processes what the response missed', async () => {
      fake.held.set(customer, [aSubscription('active')])
      const event = aSubscriptionEvent()
      await billing.inbox.receive(stripeInboxEntryOf(event), clock.now())

      const swept = await sweepStripeEvents(work)

      expect(swept.recorded).toBeGreaterThanOrEqual(1)
      expect(await inboxRow(event.id)).toMatchObject({ outcome: 'recorded' })
      expect((await billing.records.of(riverside.id)).state.standing).toBe('active')
    })

    it('leaves an event somebody is working on alone until their hold runs out', async () => {
      fake.held.set(customer, [aSubscription('active')])
      const event = aSubscriptionEvent()
      await billing.inbox.receive(stripeInboxEntryOf(event), clock.now())
      await billing.inbox.claim(event.id, clock.now(), STRIPE_EVENT_LEASE_MS)

      await sweepStripeEvents(work)
      expect(await inboxRow(event.id)).toMatchObject({ processed_at: null })

      clock.advanceBy(STRIPE_EVENT_LEASE_MS)
      await sweepStripeEvents(work)
      expect(await inboxRow(event.id)).toMatchObject({ outcome: 'recorded', attempts: 2 })
    })

    it('takes a failed event again on the next pass and carries on past it', async () => {
      const silenced = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        fake.held.set(customer, [aSubscription('active')])
        const event = aSubscriptionEvent()
        await billing.inbox.receive(stripeInboxEntryOf(event), clock.now())

        fake.state.down = true
        const whileDown = await sweepStripeEvents(work)
        expect(whileDown.failed).toBeGreaterThanOrEqual(1)
        expect(await inboxRow(event.id)).toMatchObject({ processed_at: null, attempts: 1 })

        fake.state.down = false
        clock.advanceBy(STRIPE_EVENT_LEASE_MS)
        await sweepStripeEvents(work)
        expect(await inboxRow(event.id)).toMatchObject({ outcome: 'recorded', attempts: 2 })
      } finally {
        silenced.mockRestore()
      }
    })

    it('logs a failure by the event’s ID and never what Stripe’s error said', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const event = aSubscriptionEvent()
        await billing.inbox.receive(stripeInboxEntryOf(event), clock.now())
        fake.state.down = true

        await sweepStripeEvents(work)
        clock.advanceBy(STRIPE_EVENT_LEASE_MS)

        const lines = logged.mock.calls.flat().join('\n')
        expect(lines).toContain(event.id)
        expect(lines).not.toContain('cus_')

        fake.state.down = false
        await sweepStripeEvents(work)
      } finally {
        logged.mockRestore()
      }
    })
  })

  describe('a church’s billing state', () => {
    it.each([
      ['trialing', 'trialing', true],
      ['active', 'active', true],
      ['past_due', 'past_due', true],
      ['incomplete', 'incomplete', false],
      ['canceled', 'ended', false],
      ['unpaid', 'ended', false],
      ['incomplete_expired', 'ended', false],
      ['paused', 'ended', false],
    ] as const)('reads %s as %s', async (status, standing, hasAccess) => {
      fake.held.set(customer, [aSubscription(status)])

      await delivered(aSubscriptionEvent())

      expect((await billing.records.of(riverside.id)).state).toMatchObject({ standing, hasAccess })
    })

    it('is no subscription for a church that has none, without access', async () => {
      expect((await billing.records.of(riverside.id)).state).toMatchObject({
        standing: 'no_subscription',
        hasAccess: false,
      })
    })

    it('keeps a church billed outside Stripe working with no subscription', async () => {
      await pool.query(
        `update ministry_billing set billed_outside_stripe = true where ministry_id = $1`,
        [riverside.id],
      )

      expect((await billing.records.of(riverside.id)).state).toMatchObject({
        standing: 'outside_stripe',
        hasAccess: true,
      })
    })

    it('reads as outside Stripe whatever a subscription says', async () => {
      fake.held.set(customer, [aSubscription('canceled')])
      await delivered(aSubscriptionEvent())
      await pool.query(
        `update ministry_billing set billed_outside_stripe = true where ministry_id = $1`,
        [riverside.id],
      )

      expect((await billing.records.of(riverside.id)).state.standing).toBe('outside_stripe')
    })

    it('comes to the page through its function, with no Stripe ID in it', async () => {
      const subscription = aSubscription('active', {
        currentPeriodEndsAt: new Date('2026-12-01T00:00:00Z'),
      })
      fake.held.set(customer, [subscription])
      await delivered(aSubscriptionEvent())

      const doc = await readPageDocument(await signInAs(riverside), 'signed_in_admin')

      expect(doc.billing).toEqual({
        standing: 'active',
        has_access: true,
        trial_ends_at: null,
        current_period_ends_at: '2026-12-01T00:00:00+00:00',
        cancels_at: null,
      })
      expect(JSON.stringify(doc)).not.toMatch(/cus_|sub_|in_[0-9a-f]|price_/)

      const resolution = resolutionOf(doc)
      expect(resolution.status === 'admin' && resolution.admin.billing).toMatchObject({
        standing: 'active',
        hasAccess: true,
        currentPeriodEndsAt: new Date('2026-12-01T00:00:00Z'),
      })
    })

    it('is carried on an ordinary page too', async () => {
      const doc = await readPageDocument(await signInAs(riverside), 'settings_page')

      expect(doc.billing).toMatchObject({ standing: 'no_subscription' })
    })

    it('tells nobody about a church they do not administer', async () => {
      // Reached the way a function in `app` is: on a connection as that session.
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role authenticated')
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: northgate.adminUserId, role: 'authenticated' }),
        ])
        const { rows } = await client.query(`select * from app.billing_state_of($1)`, [riverside.id])
        const access = await client.query(`select app.billing_has_access($1) as has`, [riverside.id])
        expect(rows).toEqual([])
        expect(access.rows[0].has).toBe(false)
      } finally {
        await client.query('rollback')
        client.release()
      }
    })

    it('answers the texting gate’s question for the church a command acts for', async () => {
      fake.held.set(customer, [aSubscription('trialing')])
      await delivered(aSubscriptionEvent())

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [riverside.id])
        const own = await client.query(`select app.billing_has_access($1) as has`, [riverside.id])
        const other = await client.query(`select app.billing_has_access($1) as has`, [northgate.id])
        expect(own.rows[0].has).toBe(true)
        expect(other.rows[0].has).toBe(false)
      } finally {
        await client.query('rollback')
        client.release()
      }
    })
  })

  describe('a stored customer', () => {
    it('resolves to its church and nothing else', async () => {
      expect(await billing.records.churchOfCustomer(customer)).toBe(riverside.id)
      expect(await billing.records.churchOfCustomer(aCustomer())).toBeNull()
    })

    it('stands once stored: a second one made by a double click loses', async () => {
      const second = aCustomer()

      expect(await billing.records.rememberCustomer(riverside.id, second, false)).toBe(customer)
      expect(await billing.records.churchOfCustomer(second)).toBeNull()
      expect((await billing.records.of(riverside.id)).customerId).toBe(customer)
    })

    it('cannot be held by two churches', async () => {
      await expect(billing.records.rememberCustomer(northgate.id, customer, false)).rejects.toThrow()
    })
  })

  describe('the tables and functions', () => {
    const asCommandFor = async <T>(
      church: MinistryFixture,
      work: (client: pg.PoolClient) => Promise<T>,
    ): Promise<T> => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [church.id])
        return await work(client)
      } finally {
        await client.query('rollback')
        client.release()
      }
    }

    it('keep billing history append-only, for everybody', async () => {
      fake.held.set(customer, [aSubscription('active')])
      await delivered(aSubscriptionEvent())

      await expect(pool.query(`update billing_event set livemode = true where ministry_id = $1`, [riverside.id]))
        .rejects.toThrow(/append-only/)
      await expect(pool.query(`delete from billing_event where ministry_id = $1`, [riverside.id]))
        .rejects.toThrow(/append-only/)
      await expect(pool.query(`truncate table billing_event`)).rejects.toThrow(/append-only/)
    })

    it('give a command only its own church’s rows', async () => {
      await asCommandFor(northgate, async (client) => {
        const { rows } = await client.query(`select * from ministry_billing where ministry_id = $1`, [riverside.id])
        expect(rows).toEqual([])
      })
    })

    it('let no command write for another church', async () => {
      await asCommandFor(northgate, async (client) => {
        const { rowCount } = await client.query(
          `update ministry_billing set stripe_price_id = 'price_x' where ministry_id = $1`,
          [riverside.id],
        )
        expect(rowCount).toBe(0)
      })
    })

    it('let no command change the operator’s flag', async () => {
      await asCommandFor(riverside, async (client) => {
        await expect(
          client.query(`update ministry_billing set billed_outside_stripe = true`),
        ).rejects.toThrow(/permission denied/)
      })
    })

    it('let no command change a history row', async () => {
      await asCommandFor(riverside, async (client) => {
        await expect(client.query(`delete from billing_event`)).rejects.toThrow(/permission denied/)
      })
    })

    it('shut every browser role and the service role out', async () => {
      const { rows } = await pool.query<{ table_name: string; role: string }>(`
        select t.table_name, r.role
          from unnest(array['ministry_billing', 'billing_event', 'stripe_event']) as t(table_name)
         cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
         where has_table_privilege(r.role, t.table_name, 'select, insert, update, delete')
      `)
      expect(rows).toEqual([])
    })

    it('shut the command role out of the inbox', async () => {
      const { rows } = await pool.query<{ allowed: boolean }>(
        `select has_table_privilege('discipler_command', 'stripe_event', 'select, insert, update, delete') as allowed`,
      )
      expect(rows[0]!.allowed).toBe(false)
    })

    it('let only the command role look up a customer', async () => {
      const allowed = async (role: string) => {
        const { rows } = await pool.query<{ allowed: boolean }>(
          `select has_function_privilege($1, 'app.ministry_of_stripe_customer(text)', 'execute') as allowed`,
          [role],
        )
        return rows[0]!.allowed
      }

      expect(await allowed('anon')).toBe(false)
      expect(await allowed('authenticated')).toBe(false)
      expect(await allowed('service_role')).toBe(false)
      expect(await allowed('discipler_command')).toBe(true)
    })

    it('do not let a signed-out visitor read a state', async () => {
      const { rows } = await pool.query<{ allowed: boolean }>(
        `select has_function_privilege('anon', 'app.billing_state_of(uuid)', 'execute') as allowed`,
      )
      expect(rows[0]!.allowed).toBe(false)
    })
  })

  describe('a church opening', () => {
    it('that signs itself up has a billing row and no flag', async () => {
      const { rows } = await pool.query(`select * from ministry_billing where ministry_id = $1`, [
        northgate.id,
      ])

      expect(rows).toMatchObject([{ billed_outside_stripe: false, stripe_customer_id: null }])
    })

    it('that is told so is billed outside Stripe, as the seed’s demo churches are', async () => {
      const opened = await provisionMinistry({
        name: 'Demo Chapel',
        timezone: 'UTC',
        billedOutsideStripe: true,
        admin: { fullName: 'Demo Admin', phone: aTestPhoneNumber(), password: ACCOUNT_PASSWORD },
      })

      const { state } = await billing.records.of(ministryId(opened.ministryId))
      expect(state.standing).toBe('outside_stripe')
    })

    it('before the migration is billed outside Stripe, every one of them, with nothing about its name', async () => {
      const step = readFileSync(
        new URL(
          '../../supabase/migrations/20261103100400_the_churches_opened_before_stripe_are_billed_outside_it.sql',
          import.meta.url,
        ),
        'utf8',
      )

      const client = await pool.connect()
      try {
        await client.query('begin')
        // A church from before there was a billing row, and one with a row.
        await client.query(`delete from ministry_billing where ministry_id = $1`, [northgate.id])
        await client.query(step)

        const { rows } = await client.query<{ churches: number; flagged: number }>(`
          select (select count(*)::int from ministry) as churches,
                 (select count(*)::int from ministry_billing where billed_outside_stripe) as flagged
        `)
        expect(rows[0]!.flagged).toBe(rows[0]!.churches)
      } finally {
        await client.query('rollback')
        client.release()
      }
    })
  })
})
