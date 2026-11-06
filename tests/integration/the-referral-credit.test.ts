import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StripeInboxEntry, StripeSubscriptionFacts } from '~/domain/billing'
import { createTestClock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import { REFERRAL_CREDIT_HELD_DAYS } from '~/domain/launch-terms'
import type { ChargeFacts, PaidInvoiceFacts } from '~/domain/referral-credit'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { referPageFrom } from '~/platform/supabase/refer-reader'
import {
  createPostgresReferralCredits,
  type PostgresReferralCredits,
} from '~/platform/supabase/referral-credits'
import type {
  ReferralCreditForReview,
  StripeBilling,
  StripeCredits,
  StripeTrials,
  SupportAlerts,
} from '~/service/ports'
import {
  creditOnStripeEvent,
  sweepReferralCredits,
  REFERRAL_CREDIT_LEASE_MS,
  type ReferralCreditWork,
} from '~/service/referral-credits'
import { processStripeEvent, type StripeEventWork } from '~/service/stripe-events'
import {
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The referral credit (Exponential launch, ticket 32) against the real schema, roles and
 * billing lock, through the real event processing. Stripe is a fake at its ports. Its
 * idempotency key is drawn as it really is, lasting a day, which is the point of the retry
 * test. What is asked of Stripe's own API is `tests/app/the-refer-page.test.ts`.
 */

const unique = () => crypto.randomUUID().replaceAll('-', '')
const DAY_MS = 24 * 60 * 60 * 1000
const HOLD_MS = REFERRAL_CREDIT_HELD_DAYS * DAY_MS
const KEY_LASTS_MS = DAY_MS

const aFakeStripe = (clock: { now(): Date }) => {
  const subscriptions = new Map<string, StripeSubscriptionFacts[]>()
  const invoices = new Map<string, PaidInvoiceFacts>()
  const charges = new Map<string, ChargeFacts>()
  const customers = new Map<string, { email: string | null; fingerprints: string[] }>()
  const prices = new Map<string, string | null>([
    ['price_97', 'discipler_up_to_the_limit_monthly'],
    ['price_931', 'discipler_up_to_the_limit_yearly'],
    ['price_147', 'discipler_above_the_limit_monthly'],
  ])
  const balance: { id: string; customerId: string; creditId: string; cents: number }[] = []
  const keys = new Map<string, { id: string; at: number }>()
  const state = { down: false, loseTheAnswer: false, onApply: null as null | ((creditId: string) => Promise<void>) }

  const stripe: StripeBilling = {
    async subscriptionsOf(customerId) {
      return subscriptions.get(customerId) ?? []
    },
    async customerOfCharge() {
      return null
    },
  }

  const credits: StripeCredits = {
    async invoice(invoiceId) {
      return invoices.get(invoiceId) ?? null
    },
    async charge(chargeId) {
      return charges.get(chargeId) ?? { takenBack: false, fingerprint: null }
    },
    async customer(customerId) {
      return customers.get(customerId) ?? { email: null, fingerprints: [] }
    },
    async lookupKeyOfPrice(priceId) {
      return prices.get(priceId) ?? null
    },
    async appliedCredit(customerId, creditId) {
      return balance.find((one) => one.customerId === customerId && one.creditId === creditId)?.id ?? null
    },
    async applyCredit({ customerId, creditId, cents }) {
      if (state.down) throw new Error('Stripe is down')
      await state.onApply?.(creditId)
      const now = clock.now().getTime()
      const key = keys.get(creditId)
      let id: string
      if (key && now - key.at < KEY_LASTS_MS) {
        id = key.id
      } else {
        // A key gone after a day: Stripe makes another, which is the second credit.
        id = `cbtxn_${unique()}`
        keys.set(creditId, { id, at: now })
        balance.push({ id, customerId, creditId, cents })
      }
      if (state.loseTheAnswer) throw new Error('The answer never came back')
      return id
    },
  }

  return { subscriptions, invoices, charges, customers, prices, balance, state, stripe, credits }
}

const aSubscription = (changes: Partial<StripeSubscriptionFacts> = {}): StripeSubscriptionFacts => ({
  id: `sub_${unique()}`,
  status: 'active',
  awaitingPaymentMethod: false,
  createdAt: new Date(Date.now() - 60 * DAY_MS),
  priceId: 'price_97',
  latestInvoiceId: `in_${unique()}`,
  trialEndsAt: null,
  currentPeriodEndsAt: new Date(Date.now() + 200 * DAY_MS),
  cancelsAt: null,
  namedChurch: null,
  ...changes,
})

describe('the referral credit', { timeout: 60_000 }, () => {
  let pool: pg.Pool
  let billing: PostgresBilling
  let credits: PostgresReferralCredits
  let fake: ReturnType<typeof aFakeStripe>
  let told: ReferralCreditForReview[]
  let work: ReferralCreditWork
  let events: StripeEventWork
  let clock: ReturnType<typeof createTestClock>
  let errors: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    billing = createPostgresBilling(localSupabase().databaseUrl)
    credits = createPostgresReferralCredits(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await pool.query(`delete from referral_credit`)
    await billing.close()
    await credits.close()
    await pool.end()
  })

  beforeEach(async () => {
    // A pass takes every credit that is due, so none may be left by another test or run.
    await pool.query(`delete from referral_credit`)
    // From today and never a pinned date: the hold keeps every credit here from coming due
    // for a real tick, on whatever day this runs.
    clock = createTestClock(new Date())
    fake = aFakeStripe(clock)
    told = []
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    work = {
      credits,
      billing: billing.records,
      stripe: fake.credits,
      alerts: {
        async referralCreditForReview(review) {
          told.push(review)
        },
      },
      clock,
    }
    events = {
      inbox: billing.inbox,
      records: billing.records,
      stripe: fake.stripe,
      trials: { firstBillSetsCustomersDefault: async () => false } as unknown as StripeTrials,
      alerts: {} as SupportAlerts,
      clock,
      creditOnEvent: (entry, church, customerId) => creditOnStripeEvent(work, entry, church, customerId),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const send = async (fields: Partial<StripeInboxEntry> & { type: string }) => {
    const id = `evt_${unique()}`
    await billing.inbox.receive(
      {
        id,
        livemode: false,
        occurredAt: clock.now(),
        customerId: null,
        subscriptionId: null,
        invoiceId: null,
        chargeId: null,
        namedChurches: [],
        ...fields,
      },
      clock.now(),
    )
    expect(await processStripeEvent(events, id)).toBe('recorded')
    return id
  }

  /** A church paying at Stripe, with its own email and card. */
  const aPayingChurch = async (
    changes: Partial<StripeSubscriptionFacts> = {},
  ): Promise<MinistryFixture & { customerId: string }> => {
    const church = await createMinistryWithAdmin(`Church ${unique().slice(0, 8)}`, undefined, { billedOutsideStripe: false })
    const customerId = `cus_${unique()}`
    await billing.records.rememberCustomer(church.id as MinistryId, customerId, false)
    fake.subscriptions.set(customerId, [aSubscription(changes)])
    fake.customers.set(customerId, { email: `pastor@${unique()}.example`, fingerprints: [`fp_${unique()}`] })
    await send({ type: 'customer.subscription.updated', customerId })
    return { ...church, customerId }
  }

  const invite = async (inviting: MinistryFixture, invited: MinistryFixture): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into referral (invited_church, inviting_church, referral_code, invited_at)
       select $1::uuid, held.ministry_id, held.id, $3
         from referral_code held where held.ministry_id = $2 and held.retired_at is null
       returning id`,
      [invited.id, inviting.id, clock.now()],
    )
    return rows[0]!.id
  }

  /** The invited church's invoice is paid, as Stripe then says it is. */
  const pays = async (church: { customerId: string }, cents: number, chargeId: string | null = `ch_${unique()}`) => {
    const invoiceId = `in_${unique()}`
    fake.invoices.set(invoiceId, {
      customerId: church.customerId,
      paid: true,
      amountPaidCents: cents,
      paidAt: clock.now(),
      chargeId: cents > 0 ? chargeId : null,
    })
    await send({ type: 'invoice.paid', customerId: church.customerId, invoiceId })
    return { invoiceId, chargeId }
  }

  const creditOf = async (referralId: string) => {
    const { rows } = await pool.query(`select * from referral_credit where referral = $1`, [referralId])
    return rows as Record<string, unknown>[]
  }

  const historyOf = async (church: MinistryFixture) => {
    const { rows } = await pool.query<{ type: string; subject_id: string; payload: unknown }>(
      `select type, subject_id, payload from ministry_event
        where ministry_id = $1 and subject_type = 'referral' order by occurred_at, recorded_at`,
      [church.id],
    )
    return rows
  }

  const pastTheHold = () => clock.advanceBy(HOLD_MS)

  describe('being earned', () => {
    it('is not earned by a trial\'s $0 invoice', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)

      await pays(invited, 0)

      expect(await creditOf(referral)).toEqual([])
      expect(await historyOf(inviter)).toEqual([])
    })

    it('is earned on the first invoice with a real amount, held 30 days, and says "Paying"', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 0)

      const paidAt = clock.now()
      const { invoiceId, chargeId } = await pays(invited, 9_700)

      const [credit] = await creditOf(referral)
      expect(credit).toMatchObject({
        state: 'held',
        stripe_invoice_id: invoiceId,
        stripe_charge_id: chargeId,
        paid_at: paidAt,
        held_until: new Date(paidAt.getTime() + HOLD_MS),
        amount_cents: null,
      })
      expect(await historyOf(inviter)).toEqual([{ type: 'referral.paying', subject_id: referral, payload: {} }])
      expect(fake.balance).toEqual([])
    })

    it('is earned once, whatever is replayed or paid after it', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)

      const { invoiceId } = await pays(invited, 9_700)
      await send({ type: 'invoice.paid', customerId: invited.customerId, invoiceId })
      clock.advanceBy(31 * DAY_MS)
      await pays(invited, 9_700)

      const rows = await creditOf(referral)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.stripe_invoice_id).toBe(invoiceId)
      expect((await historyOf(inviter)).map(({ type }) => type)).toEqual(['referral.paying'])
    })

    it('asks Stripe nothing for a church nobody invited', async () => {
      const church = await aPayingChurch()
      const asked = vi.spyOn(fake.credits, 'invoice')

      await pays(church, 9_700)

      expect(asked).not.toHaveBeenCalled()
    })

    it('leaves the event for the next sweep when Stripe cannot say, and then earns', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const invoiceId = `in_${unique()}`
      fake.invoices.set(invoiceId, { customerId: invited.customerId, paid: true, amountPaidCents: 9_700, paidAt: clock.now(), chargeId: 'ch_x' })
      vi.spyOn(fake.credits, 'invoice').mockRejectedValueOnce(new Error('Stripe is down'))

      const id = `evt_${unique()}`
      await billing.inbox.receive({ id, type: 'invoice.paid', livemode: false, occurredAt: clock.now(), customerId: invited.customerId, subscriptionId: null, invoiceId, chargeId: null, namedChurches: [] }, clock.now())
      await expect(processStripeEvent(events, id)).rejects.toThrow('Stripe is down')
      expect(await creditOf(referral)).toEqual([])

      clock.advanceBy(10 * 60 * 1000)
      expect(await processStripeEvent(events, id)).toBe('recorded')
      expect(await creditOf(referral)).toHaveLength(1)
    })
  })

  describe('being applied', () => {
    it('waits out the whole hold, then takes one month of the price off at Stripe', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)

      clock.advanceBy(HOLD_MS - 1000)
      expect((await sweepReferralCredits(work)).applied).toBe(0)
      expect(fake.balance).toEqual([])

      clock.advanceBy(1000)
      expect(await sweepReferralCredits(work)).toEqual({ applied: 1, cancelled: 0, inReview: 0, failed: 0 })

      const [credit] = await creditOf(referral)
      expect(fake.balance).toEqual([expect.objectContaining({ customerId: inviter.customerId, creditId: credit!.id, cents: 9_700 })])
      expect(credit).toMatchObject({ state: 'applied', amount_cents: 9_700, stripe_balance_transaction_id: fake.balance[0]!.id })
      expect((await historyOf(inviter)).map(({ type, subject_id }) => [type, subject_id])).toEqual([
        ['referral.paying', referral],
        ['referral.credit_applied', referral],
      ])
      expect(told).toEqual([])

      expect((await sweepReferralCredits(work)).applied).toBe(0)
      expect(fake.balance).toHaveLength(1)
    })

    it.each([
      ['$147 for a church on that price', 'price_147', 14_700],
      ['$97 for a church that bills yearly', 'price_931', 9_700],
    ])('is %s, whatever the invited church paid', async (_named, priceId, cents) => {
      const [inviter, invited] = [await aPayingChurch({ priceId }), await aPayingChurch()]
      await invite(inviter, invited)
      await pays(invited, 7_760)

      pastTheHold()
      await sweepReferralCredits(work)

      expect(fake.balance.map((one) => one.cents)).toEqual([cents])
    })

    it('writes its amount down before Stripe is called', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      let seen: unknown
      fake.state.onApply = async () => {
        seen = (await creditOf(referral))[0]
      }

      pastTheHold()
      await sweepReferralCredits(work)

      expect(seen).toMatchObject({ state: 'applying', amount_cents: 9_700 })
    })

    it('makes no second credit on a retry after a day, when Stripe\'s key has gone', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      fake.state.loseTheAnswer = true

      pastTheHold()
      expect(await sweepReferralCredits(work)).toMatchObject({ applied: 0, failed: 1 })
      expect(fake.balance).toHaveLength(1)
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'applying' })

      fake.state.loseTheAnswer = false
      clock.advanceBy(KEY_LASTS_MS + 1000)
      expect(await sweepReferralCredits(work)).toMatchObject({ applied: 1, failed: 0 })

      expect(fake.balance).toHaveLength(1)
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'applied', stripe_balance_transaction_id: fake.balance[0]!.id })
      expect((await historyOf(inviter)).filter(({ type }) => type === 'referral.credit_applied')).toHaveLength(1)
    })

    it('makes it on the next pass when Stripe was down, at the amount decided', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      fake.state.down = true

      pastTheHold()
      expect(await sweepReferralCredits(work)).toMatchObject({ failed: 1 })
      expect(errors.mock.calls.flat().join(' ')).not.toContain('Stripe is down')
      expect(fake.balance).toEqual([])

      fake.state.down = false
      fake.subscriptions.set(inviter.customerId, [aSubscription({ priceId: 'price_147' })])
      await send({ type: 'customer.subscription.updated', customerId: inviter.customerId })
      clock.advanceBy(60 * 60 * 1000)
      expect(await sweepReferralCredits(work)).toMatchObject({ applied: 1 })

      expect(fake.balance.map((one) => one.cents)).toEqual([9_700])
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'applied' })
    })

    it('credits nothing when a refund lands after the charge was read as clean', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      const { id } = (await creditOf(referral))[0] as { id: string }

      const read = fake.credits.charge.bind(fake.credits)
      vi.spyOn(fake.credits, 'charge').mockImplementationOnce(async (chargeId) => {
        const clean = await read(chargeId)
        await credits.cancel(id, 'payment_taken_back', clock.now())
        return clean
      })

      pastTheHold()
      await sweepReferralCredits(work)

      expect(fake.balance).toEqual([])
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'cancelled', cancelled_because: 'payment_taken_back' })
    })

    it('goes to James when the inviter is gone before it finished, since Stripe may have it', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      fake.state.down = true

      pastTheHold()
      expect(await sweepReferralCredits(work)).toMatchObject({ failed: 1 })
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'applying', amount_cents: 9_700 })

      fake.state.down = false
      await pool.query(`update referral set inviting_church = null where id = $1`, [referral])
      clock.advanceBy(60 * 60 * 1000)

      expect(await sweepReferralCredits(work)).toEqual({ applied: 0, cancelled: 0, inReview: 1, failed: 0 })
      expect((await creditOf(referral))[0]).toMatchObject({
        state: 'in_review',
        review_because: 'unfinished_inviter_gone',
        amount_cents: 9_700,
      })
      expect(told.map((review) => review.because)).toEqual(['unfinished_inviter_gone'])
      expect(fake.balance).toEqual([])

      // Off the list a pass works from, so it stops failing.
      clock.advanceBy(60 * 60 * 1000)
      expect(await sweepReferralCredits(work)).toEqual({ applied: 0, cancelled: 0, inReview: 0, failed: 0 })
    })

    it('is worked on by one pass at a time', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      await invite(inviter, invited)
      await pays(invited, 9_700)

      pastTheHold()
      const passes = await Promise.all([sweepReferralCredits(work), sweepReferralCredits(work)])

      expect(passes.reduce((total, pass) => total + pass.applied, 0)).toBe(1)
      expect(fake.balance).toHaveLength(1)
    })

    it('comes back to a pass that died, once its lease is up', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      pastTheHold()
      const [credit] = await creditOf(referral)
      expect(await credits.lease(String(credit!.id), clock.now(), REFERRAL_CREDIT_LEASE_MS)).toBe(true)

      expect((await sweepReferralCredits(work)).applied).toBe(0)

      clock.advanceBy(REFERRAL_CREDIT_LEASE_MS)
      expect((await sweepReferralCredits(work)).applied).toBe(1)
    })
  })

  describe('being cancelled', () => {
    it.each(['charge.refunded', 'charge.dispute.created'])('is cancelled by %s in the window, and nothing goes to Stripe', async (type) => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const { chargeId } = await pays(invited, 9_700)

      clock.advanceBy(10 * DAY_MS)
      fake.charges.set(chargeId!, { takenBack: true, fingerprint: null })
      await send({ type, customerId: invited.customerId, chargeId })

      expect((await creditOf(referral))[0]).toMatchObject({ state: 'cancelled', cancelled_because: 'payment_taken_back' })

      pastTheHold()
      expect(await sweepReferralCredits(work)).toEqual({ applied: 0, cancelled: 0, inReview: 0, failed: 0 })
      expect(fake.balance).toEqual([])
      expect((await historyOf(inviter)).map(({ type: kind }) => kind)).toEqual(['referral.paying'])
    })

    it('goes by what the charge says, and not by the event', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const { chargeId } = await pays(invited, 9_700)

      await send({ type: 'charge.refunded', customerId: invited.customerId, chargeId })

      expect((await creditOf(referral))[0]).toMatchObject({ state: 'held' })
    })

    it('is not touched by a refund of some other charge', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      const other = `ch_${unique()}`
      fake.charges.set(other, { takenBack: true, fingerprint: null })

      await send({ type: 'charge.refunded', customerId: invited.customerId, chargeId: other })

      expect((await creditOf(referral))[0]).toMatchObject({ state: 'held' })
    })

    it('is cancelled by a refund whose event never arrived, read again when the hold is over', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const { chargeId } = await pays(invited, 9_700)
      fake.charges.set(chargeId!, { takenBack: true, fingerprint: null })

      pastTheHold()
      expect(await sweepReferralCredits(work)).toMatchObject({ cancelled: 1, applied: 0 })

      expect((await creditOf(referral))[0]).toMatchObject({ state: 'cancelled' })
      expect(fake.balance).toEqual([])
    })

    it('stays applied when the refund comes after the window', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const { chargeId } = await pays(invited, 9_700)
      pastTheHold()
      await sweepReferralCredits(work)

      fake.charges.set(chargeId!, { takenBack: true, fingerprint: null })
      await send({ type: 'charge.refunded', customerId: invited.customerId, chargeId })

      expect((await creditOf(referral))[0]).toMatchObject({ state: 'applied' })
    })

    it('is cancelled where the inviting church is gone', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      await pool.query(`update referral set inviting_church = null where id = $1`, [referral])

      pastTheHold()
      expect(await sweepReferralCredits(work)).toMatchObject({ cancelled: 1 })

      expect((await creditOf(referral))[0]).toMatchObject({ state: 'cancelled', cancelled_because: 'inviting_church_gone' })
    })
  })

  describe('going to James', () => {
    const expectReview = async (referral: string, because: string) => {
      pastTheHold()
      expect(await sweepReferralCredits(work)).toEqual({ applied: 0, cancelled: 0, inReview: 1, failed: 0 })
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'in_review', review_because: because, amount_cents: null })
      expect(fake.balance).toEqual([])
      expect(told.map((review) => review.because)).toEqual([because])
    }

    it('sends SAU BCM\'s credit to James, not to Stripe', async () => {
      const sauBcm = await createMinistryWithAdmin(`SAU BCM ${unique().slice(0, 8)}`)
      const invited = await aPayingChurch()
      const referral = await invite(sauBcm, invited)
      await pays(invited, 9_700)
      const asked = vi.spyOn(fake.credits, 'applyCredit')

      await expectReview(referral, 'billed_outside_stripe')

      expect(asked).not.toHaveBeenCalled()
      expect(told[0]).toMatchObject({
        referralId: referral,
        invitingChurchName: sauBcm.name,
        invitingCustomerId: null,
        invitedCustomerId: invited.customerId,
      })
      expect((await historyOf(sauBcm)).map(({ type }) => type)).toEqual(['referral.paying'])
    })

    it('still cancels SAU BCM\'s on a refund, telling James nothing', async () => {
      const sauBcm = await createMinistryWithAdmin(`SAU BCM ${unique().slice(0, 8)}`)
      const invited = await aPayingChurch()
      const referral = await invite(sauBcm, invited)
      const { chargeId } = await pays(invited, 9_700)
      fake.charges.set(chargeId!, { takenBack: true, fingerprint: null })
      await send({ type: 'charge.refunded', customerId: invited.customerId, chargeId })

      pastTheHold()
      await sweepReferralCredits(work)

      expect(told).toEqual([])
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'cancelled' })
    })

    it('sends a shared card on file to James', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      fake.customers.get(invited.customerId)!.fingerprints.push(fake.customers.get(inviter.customerId)!.fingerprints[0]!)
      await pays(invited, 9_700)

      await expectReview(referral, 'shared_payment')
    })

    it('sends the card the bill was paid with to James, even once it has been taken off', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const { chargeId } = await pays(invited, 9_700)
      fake.charges.set(chargeId!, { takenBack: false, fingerprint: fake.customers.get(inviter.customerId)!.fingerprints[0]! })

      await expectReview(referral, 'shared_payment')
    })

    it('does not send two churches on gmail.com to James', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      fake.customers.get(inviter.customerId)!.email = 'first@gmail.com'
      fake.customers.get(invited.customerId)!.email = 'second@gmail.com'
      await pays(invited, 9_700)

      pastTheHold()
      expect(await sweepReferralCredits(work)).toMatchObject({ applied: 1, inReview: 0 })
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'applied' })
      expect(told).toEqual([])
    })

    it('lists a credit under review until James marks it settled, and keeps why it went', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const domain = `${unique()}.example`
      fake.customers.get(inviter.customerId)!.email = `one@${domain}`
      fake.customers.get(invited.customerId)!.email = `two@${domain}`
      await pays(invited, 9_700)
      await expectReview(referral, 'shared_email_domain')
      const creditId = (await creditOf(referral))[0]!.id as string
      const at = new Date('2027-03-01T12:00:00Z')

      expect((await credits.underReview()).map(({ id }) => id)).toContain(creditId)
      expect(await credits.settleReview(creditId, 'credited', at)).toBe('settled')

      expect((await credits.underReview()).map(({ id }) => id)).not.toContain(creditId)
      expect((await creditOf(referral))[0]).toMatchObject({
        state: 'settled',
        settled_as: 'credited',
        review_because: 'shared_email_domain',
      })
      // A second run says so and keeps the first answer.
      expect(await credits.settleReview(creditId, 'not_credited', at)).toBe('already_settled')
      expect((await creditOf(referral))[0]).toMatchObject({ settled_as: 'credited' })
    })

    it('settles nothing that is not under review', async () => {
      expect(await credits.settleReview(crypto.randomUUID(), 'credited', new Date())).toBe('not_under_review')
    })

    it('sends a shared email domain on the Stripe customers to James', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      fake.customers.get(inviter.customerId)!.email = 'one@same.example'
      fake.customers.get(invited.customerId)!.email = 'two@SAME.example'
      await pays(invited, 9_700)

      await expectReview(referral, 'shared_email_domain')
    })

    it('sends a shared email domain on the Admins\' accounts to James', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      const domain = `${unique()}.example`
      for (const church of [inviter, invited]) {
        await pool.query(
          `update auth.users set email = $2
            where id = (select user_id from ministry_member where ministry_id = $1 and tier = 'admin' limit 1)`,
          [church.id, `${unique()}@${domain}`],
        )
      }
      await pays(invited, 9_700)

      await expectReview(referral, 'shared_email_domain')
    })

    it('sends a church with nothing running to James, since it has no next bill', async () => {
      const [inviter, invited] = [await aPayingChurch({ status: 'canceled' }), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)

      await expectReview(referral, 'no_live_subscription')
    })

    it('sends a price not in the catalog to James', async () => {
      const [inviter, invited] = [await aPayingChurch({ priceId: 'price_by_hand' }), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)

      await expectReview(referral, 'unknown_price')
    })

    it('sends a payment with no charge to James, since a refund could not be checked', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700, null)

      await expectReview(referral, 'no_charge')
    })

    it('says it again on the next pass when the email did not go, and once it has, no more', async () => {
      const [inviter, invited] = [await createMinistryWithAdmin(`SAU BCM ${unique().slice(0, 8)}`), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      const down: ReferralCreditWork = {
        ...work,
        alerts: {
          async referralCreditForReview() {
            throw new Error('The sender is down')
          },
        },
      }

      pastTheHold()
      expect(await sweepReferralCredits(down)).toMatchObject({ failed: 1 })
      expect((await creditOf(referral))[0]).toMatchObject({ state: 'held' })

      clock.advanceBy(REFERRAL_CREDIT_LEASE_MS)
      expect(await sweepReferralCredits(work)).toMatchObject({ inReview: 1 })
      clock.advanceBy(REFERRAL_CREDIT_LEASE_MS)
      await sweepReferralCredits(work)
      expect(told).toHaveLength(1)
    })
  })

  describe('what a church can learn', () => {
    it('is nothing about the church it invited, from its own Refer page or the tables', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      const referral = await invite(inviter, invited)
      await pays(invited, 9_700)
      pastTheHold()
      await sweepReferralCredits(work)

      const browser = await signInAs(inviter)
      const { data: doc, error } = await browser.rpc('refer_page')
      expect(error).toBeNull()

      const said = JSON.stringify(doc)
      expect(said).not.toContain(invited.id)
      expect(said).not.toContain(invited.name)
      expect(said).not.toContain(referral)
      expect(referPageFrom(doc, clock)).toEqual({
        code: expect.stringMatching(/^[0-9a-hjkmnp-tv-z]{10}$/),
        followUpCount: 0,
      })

      for (const table of ['referral', 'referral_credit']) {
        const { data, error: refused } = await browser.from(table).select('*')
        expect(data, table).toBeNull()
        expect(refused?.message, table).toMatch(/permission denied/)
      }

      // Its history has the three events' opaque ID and nothing else.
      for (const { payload, subject_id } of await historyOf(inviter)) {
        expect(payload).toEqual({})
        expect(subject_id).toBe(referral)
      }
    })

    it('is nothing about the church that invited it', async () => {
      const [inviter, invited] = [await aPayingChurch(), await aPayingChurch()]
      await invite(inviter, invited)
      await pays(invited, 9_700)

      const browser = await signInAs(invited)
      const { data: doc } = await browser.rpc('refer_page')

      expect(JSON.stringify(doc)).not.toContain(inviter.id)
      expect(await historyOf(invited)).toEqual([])
    })

    it('reads only its own code, and only as an Admin', async () => {
      const [one, other] = [await aPayingChurch(), await aPayingChurch()]
      const browser = await signInAs(one)

      const { data, error } = await browser.schema('app' as 'public').rpc('live_referral_code', { target_ministry_id: other.id })

      // The schema is not on the API, and the function would answer nothing if it were.
      expect(data).toBeNull()
      expect(error).not.toBeNull()

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: one.adminUserId, role: 'authenticated' })])
        await client.query('set local role authenticated')
        const asked = await client.query<{ code: string | null }>(`select app.live_referral_code($1) as code`, [other.id])
        expect(asked.rows[0]!.code).toBeNull()
        const own = await client.query<{ code: string | null }>(`select app.live_referral_code($1) as code`, [one.id])
        expect(own.rows[0]!.code).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/)
      } finally {
        await client.query('rollback')
        client.release()
      }
    })
  })
})
