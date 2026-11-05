import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stripeInboxEntryOf, type StripeSubscriptionFacts } from '~/domain/billing'
import { createTestClock } from '~/domain/clock'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { readPageDocument, resolutionOf } from '~/platform/supabase/page'
import type { StripeAccount, SupportAlerts } from '~/service/ports'
import { restartSubscription } from '~/service/restart-subscription'
import { processStripeEvent, type StripeEventWork } from '~/service/stripe-events'
import { aFakeStripe } from '../support/fake-stripe'
import { createMinistryWithAdmin, localSupabase, signInAs, type MinistryFixture } from '../support/local-supabase'

/**
 * Restarting a church whose subscription ended (Exponential launch, ticket 33), against the
 * real schema and lock, with Stripe a fake at its ports. What is asked of Stripe itself is
 * `tests/app/reading-a-churchs-plan-from-stripe.test.ts`.
 */
const unique = () => crypto.randomUUID().replaceAll('-', '')
const NOW = new Date('2031-03-01T15:00:00Z')

const held = (changes: Partial<StripeSubscriptionFacts>): StripeSubscriptionFacts => ({
  id: `sub_${unique()}`,
  status: 'canceled',
  awaitingPaymentMethod: false,
  createdAt: new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000),
  priceId: 'price_97',
  latestInvoiceId: `in_${unique()}`,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  cancelsAt: null,
  namedChurch: null,
  ...changes,
})

describe('restarting a subscription', { timeout: 30_000 }, () => {
  let pool: pg.Pool
  let billing: PostgresBilling

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    billing = createPostgresBilling(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await pool.query(`delete from stripe_event`)
    await billing.close()
    await pool.end()
  })

  const clock = createTestClock(NOW)
  const fake = () => aFakeStripe(clock)
  const anAccount = () => {
    const calls = {
      opened: [] as Parameters<StripeAccount['openRestart']>[0][],
      ended: [] as string[],
    }
    const account: Pick<StripeAccount, 'openRestart' | 'end'> = {
      async openRestart(restart) {
        calls.opened.push(restart)
        return { clientSecret: 'pi_secret' }
      },
      async end(subscriptionId) {
        calls.ended.push(subscriptionId)
      },
    }
    return { calls, account }
  }

  const aChurchWithACustomer = async (name: string, options = { billedOutsideStripe: false }) => {
    const church = await createMinistryWithAdmin(name, undefined, options)
    const customerId = `cus_${unique()}`
    await billing.records.rememberCustomer(church.id, customerId, false)
    return { church, customerId }
  }

  it('makes one at the cycle chosen for a church whose subscription ended', async () => {
    const stripe = fake()
    const { church, customerId } = await aChurchWithACustomer(`Ended ${unique().slice(0, 6)}`)
    stripe.held.set(customerId, [held({})])
    const { calls, account } = anAccount()

    const opened = await restartSubscription({ records: billing.records, stripe: stripe.stripe, account }, church.id, 'year')

    expect(opened).toEqual({ clientSecret: 'pi_secret' })
    expect(calls.opened).toEqual([{ customerId, church: church.id, cycle: 'year', waiting: [] }])
  })

  it('leaves no trial opening behind, so nothing about an offer is settled later', async () => {
    const stripe = fake()
    const { church, customerId } = await aChurchWithACustomer(`No opening ${unique().slice(0, 6)}`)
    stripe.held.set(customerId, [held({})])

    await restartSubscription({ records: billing.records, stripe: stripe.stripe, account: anAccount().account }, church.id, 'month')

    const { rows } = await pool.query(`select 1 from trial_opening where ministry_id = $1`, [church.id])
    expect(rows).toEqual([])
  })

  it('hands on a first payment still waiting, for the adapter to reuse or replace', async () => {
    const stripe = fake()
    const { church, customerId } = await aChurchWithACustomer(`Waiting ${unique().slice(0, 6)}`)
    const waiting = held({ status: 'incomplete' })
    stripe.held.set(customerId, [held({}), waiting])
    const { calls, account } = anAccount()

    await restartSubscription({ records: billing.records, stripe: stripe.stripe, account }, church.id, 'month')

    expect(calls.opened[0]?.waiting).toEqual([waiting])
  })

  it('ends one Stripe would go on billing, before making another', async () => {
    const stripe = fake()
    const { church, customerId } = await aChurchWithACustomer(`Unpaid ${unique().slice(0, 6)}`)
    const unpaid = held({ status: 'unpaid' })
    stripe.held.set(customerId, [unpaid])
    const { calls, account } = anAccount()

    await restartSubscription({ records: billing.records, stripe: stripe.stripe, account }, church.id, 'month')

    expect(calls.ended).toEqual([unpaid.id])
    expect(calls.opened).toHaveLength(1)
  })

  it.each([
    ['billed by hand', { billedOutsideStripe: true }, () => [] as StripeSubscriptionFacts[], 'restart.outside_stripe'],
    ['that only ever waited for a card', { billedOutsideStripe: false }, () => [held({ awaitingPaymentMethod: true })], 'restart.never_began'],
    ['whose first payment ran out', { billedOutsideStripe: false }, () => [held({ status: 'incomplete_expired' })], 'restart.never_began'],
    ['already paying', { billedOutsideStripe: false }, () => [held({ status: 'active' })], 'restart.already_paying'],
    ['on its trial', { billedOutsideStripe: false }, () => [held({ status: 'trialing' })], 'restart.already_paying'],
    ['past due', { billedOutsideStripe: false }, () => [held({ status: 'past_due' })], 'restart.already_paying'],
  ])('refuses a church %s', async (_case, options, subscriptions, refusal) => {
    const stripe = fake()
    const { church, customerId } = await aChurchWithACustomer(`Refused ${unique().slice(0, 6)}`, options)
    stripe.held.set(customerId, subscriptions())
    const { calls, account } = anAccount()

    expect(await restartSubscription({ records: billing.records, stripe: stripe.stripe, account }, church.id, 'month')).toEqual({
      refusal,
    })
    expect(calls.opened).toEqual([])
  })

  it('refuses a church that never had a customer', async () => {
    const church = await createMinistryWithAdmin(`Never ${unique().slice(0, 6)}`, undefined, { billedOutsideStripe: false })
    const stripe = fake()

    expect(
      await restartSubscription({ records: billing.records, stripe: stripe.stripe, account: anAccount().account }, church.id, 'month'),
    ).toEqual({ refusal: 'restart.never_began' })
  })

  describe('what the webhook then writes', () => {
    const alerts = { async billingEventRefused() {} } as unknown as SupportAlerts

    const standingOf = async (church: MinistryFixture) => {
      const resolution = resolutionOf(await readPageDocument(await signInAs(church), 'signed_in_admin'))
      if (resolution.status !== 'admin') throw new Error('Expected an Admin')
      return resolution.admin.billing
    }

    const anEvent = (customerId: string, type = 'customer.subscription.updated') => ({
      id: `evt_${unique()}`,
      type,
      created: Math.floor(NOW.getTime() / 1000),
      livemode: false,
      object: { object: 'subscription', id: 'sub_any', customer: customerId },
    })

    const heard = async (work: StripeEventWork, customerId: string, type?: string) => {
      const entry = stripeInboxEntryOf(anEvent(customerId, type))
      await work.inbox.receive(entry, NOW)
      return processStripeEvent(work, entry.id)
    }

    const workOn = (stripe: ReturnType<typeof fake>): StripeEventWork => ({
      inbox: billing.inbox,
      records: billing.records,
      stripe: stripe.stripe,
      trials: stripe.trials,
      alerts,
      clock,
    })

    it('leaves a church ended while its restart waits for a first payment, and gives access back when it goes through', async () => {
      const stripe = fake()
      const { church, customerId } = await aChurchWithACustomer(`Coming back ${unique().slice(0, 6)}`)
      const restart = held({ status: 'incomplete', createdAt: NOW })
      stripe.held.set(customerId, [held({}), restart])
      const work = workOn(stripe)

      await heard(work, customerId)
      expect(await standingOf(church)).toMatchObject({ standing: 'ended', hasAccess: false })

      stripe.held.set(customerId, [held({}), { ...restart, status: 'active' }])
      await heard(work, customerId)
      expect(await standingOf(church)).toMatchObject({ standing: 'active', hasAccess: true })
    })

    it('moves a Subscription to the method chosen on Stripe’s billing page, when the customer changes', async () => {
      const stripe = fake()
      const { customerId } = await aChurchWithACustomer(`New card ${unique().slice(0, 6)}`)
      const live = held({ status: 'active' })
      stripe.held.set(customerId, [live])

      await heard(workOn(stripe), customerId, 'customer.updated')

      expect(stripe.calls.followedDefaults).toEqual([{ customerId, subscriptionId: live.id }])
    })
  })
})
