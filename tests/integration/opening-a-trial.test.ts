import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripeInboxEntryOf } from '~/domain/billing'
import { createTestClock } from '~/domain/clock'
import { paidPhasesOf } from '~/domain/offers'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { readPageDocument, resolutionOf } from '~/platform/supabase/page'
import type { Invitations, TrialWork } from '~/service/open-trial'
import type { AdminResolution, SupportAlerts } from '~/service/ports'
import { processStripeEvent, STRIPE_EVENT_LEASE_MS, type StripeEventWork } from '~/service/stripe-events'
import { POST as open } from '../../app/signup/payment/open/route'
import { aFakeStripe } from '../support/fake-stripe'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Opening a church's trial and what follows it (Exponential launch, ticket 04), through
 * the route, against the real schema, the real roles and a real signed-in session read
 * through the same page function every Admin surface reads. Stripe is the one fake, at
 * its ports. A built server cannot be used: sign-up is shut there, which
 * `sign-up-is-shut-over-http.test.ts` holds it to, and it must not reach Stripe.
 */

let work: TrialWork | null = null
let session: () => Promise<AdminResolution> = async () => ({ status: 'signed-out' })
let tokenEmail: string | null = 'pastor@grace.example'

vi.mock('~/service/container', () => ({
  getTrialWork: () => {
    if (!work) throw new Error('The route reached Stripe while it should have been shut.')
    return work
  },
}))

vi.mock('~/platform/supabase/current-admin', () => ({
  resolveAdmin: () => session(),
  adminEmailFromToken: async () => tokenEmail,
}))

const unique = () => crypto.randomUUID().replaceAll('-', '')
const DAY_MS = 24 * 60 * 60 * 1000

// What self sign-up makes. The shared fixture's default is a church billed by hand, which
// this page refuses, and these tests are about the church that has to pay.
const aChurchThatSignedItselfUp = (name: string) =>
  createMinistryWithAdmin(name, undefined, { billedOutsideStripe: false })

// Longer than the default: each test here opens a church or two, signs in and walks a
// whole sign-up, and under a shared lock's load that has run past five seconds. A test
// that times out goes on running, against the next test's fake, and fails that one too.
describe('Opening a trial', { timeout: 30_000 }, () => {
  let pool: pg.Pool
  let billing: PostgresBilling
  let clock: ReturnType<typeof createTestClock>
  let fake: ReturnType<typeof aFakeStripe>
  let invited: Set<string>
  let events: StripeEventWork
  let grace: MinistryFixture

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    billing = createPostgresBilling(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await pool.query(`delete from stripe_event`)
    await billing.close()
    await pool.end()
  })

  const asAdminOf = (church: MinistryFixture) => {
    session = async () => resolutionOf(await readPageDocument(await signInAs(church), 'signed_in_admin'))
  }

  beforeEach(async () => {
    clock = createTestClock(new Date('2026-11-10T18:00:00Z'))
    fake = aFakeStripe(clock)
    invited = new Set()
    const invitations: Invitations = { wasInvited: async (church) => invited.has(church) }
    work = { records: billing.records, stripe: fake.stripe, trials: fake.trials, invitations, clock }
    const alerts = { async billingEventRefused() {} } as unknown as SupportAlerts
    events = {
      inbox: billing.inbox,
      records: billing.records,
      stripe: fake.stripe,
      trials: fake.trials,
      alerts,
      clock,
    }
    tokenEmail = 'pastor@grace.example'
    vi.stubEnv('SIGN_UP_OPEN', 'true')
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_not_a_real_key')

    // One of its own per test: a customer can be stored once and history never cleared.
    grace = await aChurchThatSignedItselfUp('Grace Church')
    asAdminOf(grace)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const post = (fields: Record<string, string> = { cycle: 'month' }) =>
    open(
      new NextRequest('http://127.0.0.1:3341/signup/payment/open', {
        method: 'POST',
        body: new URLSearchParams(fields),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    )

  const opened = async (fields?: Record<string, string>) => {
    const response = await post(fields)
    expect(response.status).toBe(200)
    return response.json() as Promise<{
      clientSecret: string
      intentType: string
      publishableKey: string
      trialEndsAt: string
      offer: string
      codeRefusal: { refusal: string; message: string } | null
    }>
  }

  const customerOf = async (church: MinistryFixture = grace) => {
    const { customerId } = await billing.records.of(church.id)
    if (!customerId) throw new Error('This church has no customer yet')
    return customerId
  }

  const subscriptions = async (church: MinistryFixture = grace) =>
    fake.held.get(await customerOf(church)) ?? []

  /** Stripe sends an event about this customer, and the webhook's processing reads it. */
  const stripeSays = async (type: string, church: MinistryFixture = grace) => {
    const customer = await customerOf(church)
    const id = `evt_${unique()}`
    const object = type.startsWith('setup_intent')
      ? { object: 'setup_intent', id: `seti_${unique()}`, customer, metadata: {} }
      : { object: 'subscription', id: `sub_${unique()}`, customer, metadata: { ministry_id: church.id } }
    await billing.inbox.receive(
      stripeInboxEntryOf({ id, type, livemode: false, created: Math.floor(clock.now().getTime() / 1000), object }),
      clock.now(),
    )
    return { id, processed: await processStripeEvent(events, id) }
  }

  const stateOf = async (church: MinistryFixture = grace) => (await billing.records.of(church.id)).state

  const openingOf = async (subscriptionId: string) => {
    const { rows } = await pool.query(`select * from trial_opening where stripe_subscription_id = $1`, [
      subscriptionId,
    ])
    return rows[0]
  }

  describe('the route', () => {
    it('is not there while sign-up is shut', async () => {
      vi.stubEnv('SIGN_UP_OPEN', '')
      work = null

      const response = await post()

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
    })

    it('refuses somebody signed out, before anything is made at Stripe', async () => {
      session = async () => ({ status: 'signed-out' })

      const response = await post()

      expect(response.status).toBe(401)
      expect((await response.json()).refusal).toBe('payment.not_signed_in')
      expect(fake.calls.customers).toEqual([])
    })

    it('refuses a Leader of the church, who is signed in and no Admin', async () => {
      const leader = await addPersonWithAccount(grace, 'A Leader', 'leader')
      session = async () => resolutionOf(await readPageDocument(await signInWith(leader), 'signed_in_admin'))

      const response = await post()

      expect(response.status).toBe(403)
      expect((await response.json()).refusal).toBe('payment.not_an_admin')
      expect(fake.calls.customers).toEqual([])
    })

    it('refuses a session whose password has since changed, through session_is_live', async () => {
      const client = await signInAs(grace)
      session = async () => resolutionOf(await readPageDocument(client, 'signed_in_admin'))
      await pool.query(`delete from auth.sessions where user_id = $1`, [grace.adminUserId])

      expect((await post()).status).toBe(401)
      expect(fake.calls.customers).toEqual([])
    })

    it('refuses a billing cycle that is neither, and makes nothing', async () => {
      for (const cycle of ['', 'week', 'price_1']) {
        const response = await post({ cycle })
        expect(response.status).toBe(422)
        expect((await response.json()).refusal).toBe('payment.bad_cycle')
      }
      expect(fake.calls.customers).toEqual([])
    })

    it('makes nothing on a deployment with no publishable key', async () => {
      vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '')

      const response = await post()

      expect(response.status).toBe(502)
      expect(fake.calls.customers).toEqual([])
    })

    it('says only that it could not, when Stripe fails, and logs no detail of Stripe’s', async () => {
      fake.state.failOpening = true
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await post()

      expect(response.status).toBe(502)
      const body = await response.json()
      expect(body.refusal).toBe('payment.not_opened')
      expect(JSON.stringify(body)).not.toContain('cus_secret')
      expect(JSON.stringify(logged.mock.calls)).not.toContain('cus_secret')
    })
  })

  describe('a church with no offer', () => {
    it('gets a 30-day trial on the first monthly price', async () => {
      const answer = await opened()

      expect(fake.calls.opened).toEqual([
        { customerId: await customerOf(), church: grace.id, cycle: 'month', trialDays: 30 },
      ])
      const [subscription] = await subscriptions()
      expect(subscription?.priceId).toBe('price_97')
      expect(answer).toEqual({
        clientSecret: expect.stringMatching(/^seti_secret_/),
        intentType: 'setup',
        publishableKey: 'pk_test_not_a_real_key',
        trialEndsAt: new Date(clock.now().getTime() + 30 * DAY_MS).toISOString(),
        offer: 'none',
        codeRefusal: null,
      })
    })

    it('gets the first yearly price where it chose yearly', async () => {
      await opened({ cycle: 'year' })

      expect(fake.calls.opened[0]).toMatchObject({ cycle: 'year', trialDays: 30 })
    })

    it('has its Customer made from the church’s name and the Admin’s email only', async () => {
      await opened()

      expect(fake.calls.customers).toEqual([
        { church: grace.id, churchName: 'Grace Church', email: 'pastor@grace.example' },
      ])
      expect(await customerOf()).toMatch(/^cus_/)
    })

    it('has its Customer made with no email for an Admin with none', async () => {
      tokenEmail = null

      await opened()

      expect(fake.calls.customers[0]?.email).toBeNull()
    })
  })

  describe('nothing about a church comes from the browser', () => {
    it('ignores a church, a customer, a price and free days in the form', async () => {
      const other = await aChurchThatSignedItselfUp('Another Church')

      await opened({
        cycle: 'month',
        ministry_id: other.id,
        church: other.id,
        customer: 'cus_forged',
        customerId: 'cus_forged',
        price: 'price_forged',
        trialDays: '9999',
        offer: 'exponential',
        invited: 'true',
      })

      expect(fake.calls.customers[0]).toMatchObject({ church: grace.id, churchName: 'Grace Church' })
      expect(fake.calls.opened).toEqual([
        { customerId: await customerOf(), church: grace.id, cycle: 'month', trialDays: 30 },
      ])
      expect((await billing.records.of(other.id)).customerId).toBeNull()
      expect((await billing.records.of(grace.id)).customerId).not.toBe('cus_forged')
    })
  })

  describe('EXPO26', () => {
    it('gives 60 days, whichever case it was typed in', async () => {
      const answer = await opened({ cycle: 'month', code: 'expo26' })

      expect(answer.offer).toBe('exponential')
      expect(answer.codeRefusal).toBeNull()
      expect(answer.trialEndsAt).toBe(new Date(clock.now().getTime() + 60 * DAY_MS).toISOString())
      expect(fake.calls.opened[0]?.trialDays).toBe(60)
    })

    it('is refused in the spec’s words after December 11, Pacific, and carries on at the normal price', async () => {
      clock = createTestClock(new Date('2026-12-12T08:00:00Z'))
      work = { ...work!, clock }

      const answer = await opened({ cycle: 'month', code: 'EXPO26' })

      expect(answer.offer).toBe('none')
      expect(answer.codeRefusal).toEqual({
        refusal: 'offer.code_expired',
        message: 'That code has expired, but your free trial still applies.',
      })
      expect(fake.calls.opened[0]?.trialDays).toBe(30)
    })

    it('still works in the last minute of December 11, Pacific', async () => {
      clock = createTestClock(new Date('2026-12-12T07:59:00Z'))
      work = { ...work!, clock }

      expect((await opened({ cycle: 'month', code: 'EXPO26' })).offer).toBe('exponential')
    })

    it('with an invitation applies only the Exponential special offer', async () => {
      invited.add(grace.id)

      const answer = await opened({ cycle: 'month', code: 'EXPO26' })
      expect(answer.offer).toBe('exponential')

      const [subscription] = await subscriptions()
      fake.confirm(subscription!.id)
      await stripeSays('setup_intent.succeeded')

      expect(fake.calls.scheduled).toEqual([
        {
          subscriptionId: subscription!.id,
          phases: paidPhasesOf({ cycle: 'month', offer: 'exponential', plantYear: false }),
        },
      ])
    })

    it('cannot be had a second time by a church that has had a Subscription', async () => {
      await opened({ cycle: 'month', code: 'EXPO26' })
      const [subscription] = await subscriptions()
      fake.confirm(subscription!.id)
      await stripeSays('setup_intent.succeeded')
      fake.set(subscription!.id, { status: 'canceled' })
      await stripeSays('customer.subscription.deleted')

      const response = await post({ cycle: 'month', code: 'EXPO26' })

      expect(response.status).toBe(409)
      expect((await response.json()).refusal).toBe('payment.restart')
      expect(fake.calls.opened).toHaveLength(1)
    })
  })

  describe('a code that is not one', () => {
    it('is refused in a sentence and the church carries on', async () => {
      const answer = await opened({ cycle: 'month', code: 'NOPE' })

      expect(answer.offer).toBe('none')
      expect(answer.codeRefusal?.refusal).toBe('offer.code_unknown')
      expect(answer.clientSecret).toMatch(/^seti_secret_/)
    })
  })

  describe('a Subscription whose setup intent is not confirmed', () => {
    it('counts as no access, however many events say it is there', async () => {
      await opened()

      await stripeSays('customer.subscription.created')

      const state = await stateOf()
      expect(state).toMatchObject({ standing: 'incomplete', hasAccess: false })
      expect(state.trialEndsAt).toEqual(new Date(clock.now().getTime() + 30 * DAY_MS))
    })

    it('counts as no access at the one question the texting gate asks', async () => {
      await opened()
      await stripeSays('customer.subscription.created')
      const [subscription] = await subscriptions()

      const hasAccess = async () => {
        const client = await pool.connect()
        try {
          await client.query('begin')
          await client.query('set local role discipler_command')
          await client.query(`select set_config('discipler.ministry_id', $1, true)`, [grace.id])
          const { rows } = await client.query(`select app.billing_has_access($1) as access`, [grace.id])
          await client.query('rollback')
          return rows[0].access
        } finally {
          client.release()
        }
      }

      expect(await hasAccess()).toBe(false)

      fake.confirm(subscription!.id)
      await stripeSays('setup_intent.succeeded')

      expect(await hasAccess()).toBe(true)
    })

    it('reads as no access on the church’s own pages too', async () => {
      await opened()
      await stripeSays('customer.subscription.created')

      const resolution = resolutionOf(await readPageDocument(await signInAs(grace), 'signed_in_admin'))

      expect(resolution).toMatchObject({
        status: 'admin',
        admin: { billing: { standing: 'incomplete', hasAccess: false } },
      })
    })

    it('becomes access once Stripe says the setup intent was confirmed', async () => {
      await opened()
      await stripeSays('customer.subscription.created')
      const [subscription] = await subscriptions()

      fake.confirm(subscription!.id)
      const { processed } = await stripeSays('setup_intent.succeeded')

      expect(processed).toBe('recorded')
      expect(await stateOf()).toMatchObject({ standing: 'trialing', hasAccess: true })
    })

    it('stays no access if a later event arrives before the Element has confirmed it', async () => {
      await opened()
      await stripeSays('customer.subscription.created')

      await stripeSays('customer.subscription.updated')

      expect(await stateOf()).toMatchObject({ standing: 'incomplete', hasAccess: false })
    })

    it('that ran out is a church with no subscription, not one whose subscription ended', async () => {
      await opened()
      await stripeSays('customer.subscription.created')
      const [subscription] = await subscriptions()

      // Stripe cancels it at the trial's end, and leaves its setup intent as it was.
      fake.set(subscription!.id, { status: 'canceled' })
      await stripeSays('customer.subscription.deleted')

      expect(await stateOf()).toMatchObject({ standing: 'no_subscription', hasAccess: false })
    })
  })

  describe('a church that comes back', () => {
    it('is handed the same Subscription on the same day', async () => {
      const first = await opened()
      const second = await opened()

      expect(second.clientSecret).toBe(first.clientSecret)
      expect(fake.calls.opened).toHaveLength(1)
      expect(fake.calls.canceled).toEqual([])
    })

    it('opens one Subscription for a double click', async () => {
      const [first, second] = await Promise.all([opened(), opened()])

      expect(second.clientSecret).toBe(first.clientSecret)
      expect(fake.calls.opened).toHaveLength(1)
    })

    it('gets its full free days after a day away, on a new Subscription', async () => {
      await opened()
      const [old] = await subscriptions()

      clock.advanceBy(DAY_MS)
      const answer = await opened()

      expect(fake.calls.canceled).toEqual([old!.id])
      expect(fake.calls.opened).toHaveLength(2)
      expect(answer.trialEndsAt).toBe(new Date(clock.now().getTime() + 30 * DAY_MS).toISOString())
    })

    it('gets what it now chose, where it changed its mind', async () => {
      await opened({ cycle: 'month' })
      const [old] = await subscriptions()

      await opened({ cycle: 'year' })

      expect(fake.calls.canceled).toEqual([old!.id])
      expect(fake.calls.opened.at(-1)).toMatchObject({ cycle: 'year' })
    })

    it('loses a 60-day trial when the code has run out since', async () => {
      clock = createTestClock(new Date('2026-12-11T18:00:00Z'))
      work = { ...work!, clock }
      await opened({ cycle: 'month', code: 'EXPO26' })
      const [old] = await subscriptions()

      clock.advanceBy(DAY_MS)
      const answer = await opened({ cycle: 'month', code: 'EXPO26' })

      expect(fake.calls.canceled).toEqual([old!.id])
      expect(answer.offer).toBe('none')
      expect(fake.calls.opened.at(-1)?.trialDays).toBe(30)
    })

    it('can start again after its old one ran out', async () => {
      await opened()
      const [old] = await subscriptions()
      fake.set(old!.id, { status: 'canceled' })
      await stripeSays('customer.subscription.deleted')

      const answer = await opened()

      expect(answer.clientSecret).toMatch(/^seti_secret_/)
      expect(fake.calls.opened).toHaveLength(2)
      await stripeSays('customer.subscription.created')
      expect(await stateOf()).toMatchObject({ standing: 'incomplete', hasAccess: false })
    })

    it('can start again even where Stripe cleared the replaced one’s setup intent', async () => {
      await opened()
      const [old] = await subscriptions()
      fake.set(old!.id, { status: 'canceled', awaitingPaymentMethod: false })

      expect((await post()).status).toBe(200)
    })

    it('is told it is already set up, once it is', async () => {
      await opened()
      const [subscription] = await subscriptions()
      fake.confirm(subscription!.id)
      await stripeSays('setup_intent.succeeded')

      const response = await post()

      expect(response.status).toBe(409)
      expect((await response.json()).refusal).toBe('payment.already_paying')
      expect(fake.calls.opened).toHaveLength(1)
    })
  })

  describe('a church billed outside Stripe', () => {
    it('has nothing to open', async () => {
      await pool.query(
        `insert into ministry_billing (ministry_id, billed_outside_stripe) values ($1, true)
         on conflict (ministry_id) do update set billed_outside_stripe = true`,
        [grace.id],
      )

      const response = await post()

      expect(response.status).toBe(409)
      expect((await response.json()).refusal).toBe('payment.outside_stripe')
      expect(fake.calls.customers).toEqual([])
    })
  })

  describe('once its setup intent is confirmed', () => {
    const confirmed = async (
      church: MinistryFixture,
      fields: Record<string, string>,
      fingerprint: string | null = `fp_${unique()}`,
    ) => {
      asAdminOf(church)
      await opened(fields)
      const [subscription] = await subscriptions(church)
      fake.confirm(subscription!.id, fingerprint)
      await stripeSays('setup_intent.succeeded', church)
      return subscription!
    }

    it('is scheduled 12 invoices at the offer, for EXPO26', async () => {
      const subscription = await confirmed(grace, { cycle: 'month', code: 'EXPO26' })

      expect(fake.calls.scheduled).toEqual([
        {
          subscriptionId: subscription.id,
          phases: paidPhasesOf({ cycle: 'month', offer: 'exponential', plantYear: false }),
        },
      ])
      expect(await openingOf(subscription.id)).toMatchObject({
        ministry_id: grace.id,
        billing_cycle: 'month',
        offer: 'exponential',
        settled_as: 'as_opened',
      })
    })

    it('needs no schedule with no offer, and still has its default payment method seen to', async () => {
      const subscription = await confirmed(grace, { cycle: 'month' })

      expect(fake.calls.scheduled).toEqual([])
      expect(fake.calls.defaults).toEqual([subscription.id])
      expect(await openingOf(subscription.id)).toMatchObject({ settled_as: 'as_opened' })
    })

    it('is settled once, however many events follow', async () => {
      await confirmed(grace, { cycle: 'month', code: 'EXPO26' })

      await stripeSays('customer.subscription.updated')
      await stripeSays('customer.subscription.trial_will_end')

      expect(fake.calls.scheduled).toHaveLength(1)
      expect(fake.calls.defaults).toHaveLength(1)
    })

    it('settles nothing before it is confirmed', async () => {
      await opened({ cycle: 'month', code: 'EXPO26' })

      await stripeSays('customer.subscription.created')

      expect(fake.calls.scheduled).toEqual([])
      expect(fake.calls.defaults).toEqual([])
    })

    it('settles nothing for a Subscription not opened here', async () => {
      await billing.records.rememberCustomer(grace.id, `cus_${unique()}`, false)
      const customer = await customerOf()
      fake.held.set(customer, [
        {
          id: `sub_${unique()}`,
          status: 'active',
          awaitingPaymentMethod: false,
          createdAt: clock.now(),
          priceId: 'price_97',
          latestInvoiceId: null,
          trialEndsAt: null,
          currentPeriodEndsAt: null,
          cancelsAt: null,
          namedChurch: null,
        },
      ])

      expect((await stripeSays('customer.subscription.updated')).processed).toBe('recorded')
      expect(fake.calls.defaults).toEqual([])
    })

    it('keeps its access through a Stripe failure, and the sweep finishes the rest', async () => {
      await opened({ cycle: 'month', code: 'EXPO26' })
      const [subscription] = await subscriptions()
      fake.confirm(subscription!.id)
      fake.state.failScheduling = true

      const customer = await customerOf()
      const id = `evt_${unique()}`
      await billing.inbox.receive(
        stripeInboxEntryOf({
          id,
          type: 'setup_intent.succeeded',
          livemode: false,
          created: Math.floor(clock.now().getTime() / 1000),
          object: { object: 'setup_intent', id: 'seti_x', customer, metadata: {} },
        }),
        clock.now(),
      )

      await expect(processStripeEvent(events, id)).rejects.toThrow('Stripe is down')

      // The pastor is in, and nothing says the bills were scheduled.
      expect(await stateOf()).toMatchObject({ standing: 'trialing', hasAccess: true })
      expect(await openingOf(subscription!.id)).toMatchObject({ settled_at: null })

      fake.state.failScheduling = false
      clock.advanceBy(STRIPE_EVENT_LEASE_MS)
      expect(await processStripeEvent(events, id)).toBe('recorded')

      expect(fake.calls.scheduled).toHaveLength(1)
      expect(await openingOf(subscription!.id)).toMatchObject({ settled_as: 'as_opened' })
    })

    describe('for an invited church', () => {
      it('is scheduled a first free month', async () => {
        invited.add(grace.id)

        const subscription = await confirmed(grace, { cycle: 'month' })

        expect(fake.calls.scheduled).toEqual([
          {
            subscriptionId: subscription.id,
            phases: paidPhasesOf({ cycle: 'month', offer: 'referral', plantYear: false }),
          },
        ])
      })

      it('is refused one on a card that had one, in another church', async () => {
        const fingerprint = `fp_${unique()}`
        const other = await aChurchThatSignedItselfUp('Another Church')
        invited.add(grace.id).add(other.id)

        await confirmed(grace, { cycle: 'month' }, fingerprint)
        const second = await confirmed(other, { cycle: 'month' }, fingerprint)

        expect(fake.calls.scheduled).toHaveLength(1)
        expect(await openingOf(second.id)).toMatchObject({
          offer: 'referral',
          settled_as: 'free_month_refused',
        })
        // It keeps its trial: only the free month is refused.
        expect(await stateOf(other)).toMatchObject({ standing: 'trialing', hasAccess: true })
      })

      it('is refused one on a bank account or card that had one, however it was opened', async () => {
        const fingerprint = `fp_${unique()}`
        const other = await aChurchThatSignedItselfUp('Yearly Church')
        invited.add(grace.id).add(other.id)

        await confirmed(grace, { cycle: 'month' }, fingerprint)
        const second = await confirmed(other, { cycle: 'year' }, fingerprint)

        expect(await openingOf(second.id)).toMatchObject({ settled_as: 'free_month_refused' })
      })

      it('is given one on a method with no fingerprint, which has used nothing up', async () => {
        invited.add(grace.id)

        await confirmed(grace, { cycle: 'month' }, null)

        expect(fake.calls.scheduled).toHaveLength(1)
      })

      it('leaves EXPO26 alone on a card that had a first free month', async () => {
        const fingerprint = `fp_${unique()}`
        const other = await aChurchThatSignedItselfUp('Another Church')
        invited.add(grace.id)

        await confirmed(grace, { cycle: 'month' }, fingerprint)
        await confirmed(other, { cycle: 'month', code: 'EXPO26' }, fingerprint)

        expect(fake.calls.scheduled.at(-1)?.phases).toEqual(
          paidPhasesOf({ cycle: 'month', offer: 'exponential', plantYear: false }),
        )
      })
    })
  })

  describe('the fingerprint rule', () => {
    const claim = (church: MinistryFixture, fingerprint: string, grant: 'first_free_month' | 'plant_year') =>
      billing.records.establish(church.id, (unit) => unit.claimFingerprint(fingerprint, grant, clock.now()))

    it('gives a second plant year to nobody', async () => {
      const print = `fp_${unique()}`
      const other = await aChurchThatSignedItselfUp('Another Plant')

      expect(await claim(grace, print, 'plant_year')).toBe(true)
      expect(await claim(other, print, 'plant_year')).toBe(false)
    })

    it('says yes again to the church that holds it, so a retry is not refused its own', async () => {
      const print = `fp_${unique()}`

      expect(await claim(grace, print, 'first_free_month')).toBe(true)
      expect(await claim(grace, print, 'first_free_month')).toBe(true)
    })

    it('keeps a first free month and a plant year apart', async () => {
      const print = `fp_${unique()}`
      const other = await aChurchThatSignedItselfUp('Another Plant')

      expect(await claim(grace, print, 'first_free_month')).toBe(true)
      expect(await claim(other, print, 'plant_year')).toBe(true)
    })

    it('holds with two churches claiming one card at once', async () => {
      const print = `fp_${unique()}`
      const other = await aChurchThatSignedItselfUp('Another Plant')

      const answers = await Promise.all([
        claim(grace, print, 'first_free_month'),
        claim(other, print, 'first_free_month'),
      ])

      expect(answers.filter(Boolean)).toHaveLength(1)
    })

    it('cannot be read or claimed from a browser', async () => {
      const client = await signInAs(grace)

      const read = await client.from('payment_fingerprint_grant').select('*')
      expect(read.error).not.toBeNull()

      const claimed = await client.schema('app' as never).rpc('claim_payment_fingerprint' as never, {
        print: 'fp_x',
        kind: 'plant_year',
        at: clock.now().toISOString(),
      } as never)
      expect(claimed.error).not.toBeNull()
    })
  })

  describe('what is kept', () => {
    it('stops a browser reading a church’s openings', async () => {
      await opened()

      const client = await signInAs(grace)
      const { error } = await client.from('trial_opening').select('*')

      expect(error).not.toBeNull()
    })

    it('holds no secret and nothing about the payer', async () => {
      const answer = await opened()
      const [subscription] = await subscriptions()

      const kept = JSON.stringify(await openingOf(subscription!.id))

      expect(kept).not.toContain(answer.clientSecret)
      expect(kept).not.toContain('pastor@grace.example')
    })
  })
})
