import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StripeSubscriptionFacts } from '~/domain/billing'
import { createTestClock } from '~/domain/clock'
import { paidPhasesOf, type BillingCycle, type PaidPhase, type TrialOffer } from '~/domain/offers'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import {
  createPostgresChurchPlantApplications,
  type PostgresChurchPlantApplications,
} from '~/platform/supabase/church-plant-applications'
import {
  approvePlantApplication,
  declinePlantApplication,
  plantOutcomeSentences,
  type PlantDecisionWork,
} from '~/service/church-plant-decisions'
import { createEmailSender } from '~/service/email-sender'
import type { StripeBilling, StripeTrials } from '~/service/ports'
import {
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'
import { createRecordingEmail } from '../support/sign-up-scenarios'

/**
 * The operator's approval of a church-plant application (Exponential launch, ticket 19),
 * against the real schema, roles and billing lock. Stripe and Resend are the fakes, at
 * their ports. What is asked of Stripe's own API is
 * `tests/app/opening-a-trial-at-stripe.test.ts`, and that Stripe then does as it documents
 * is one approval on staging's sandbox with a test clock, still to be run.
 */

const unique = () => crypto.randomUUID().replaceAll('-', '')
const NOW = new Date('2026-11-10T18:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

const aFakeStripe = () => {
  const subscriptions = new Map<string, StripeSubscriptionFacts[]>()
  const methods = new Map<string, { fingerprint: string | null } | null>()
  const calls = { reads: 0, defaults: 0, scheduled: [] as { subscriptionId: string; phases: readonly PaidPhase[] }[] }
  const state = { failScheduling: false }

  const stripe: StripeBilling = {
    async subscriptionsOf(customerId) {
      calls.reads += 1
      return subscriptions.get(customerId) ?? []
    },
    async customerOfCharge() {
      return null
    },
  }
  const trials = {
    async confirmDefaultPaymentMethod(subscriptionId: string) {
      calls.defaults += 1
      return methods.has(subscriptionId) ? methods.get(subscriptionId)! : { fingerprint: `fp_${unique()}` }
    },
    async schedulePhases(subscriptionId: string, phases: readonly PaidPhase[]) {
      if (state.failScheduling) throw new Error('Stripe is down')
      calls.scheduled.push({ subscriptionId, phases })
    },
  } as unknown as StripeTrials

  const touches = () => calls.reads + calls.defaults + calls.scheduled.length
  return { subscriptions, methods, calls, state, stripe, trials, touches }
}

const aTrial = (changes: Partial<StripeSubscriptionFacts> = {}): StripeSubscriptionFacts => ({
  id: `sub_${unique()}`,
  status: 'trialing',
  awaitingPaymentMethod: false,
  createdAt: new Date(NOW.getTime() - 5 * DAY_MS),
  priceId: 'price_97',
  latestInvoiceId: `in_${unique()}`,
  trialEndsAt: new Date(NOW.getTime() + 25 * DAY_MS),
  currentPeriodEndsAt: new Date(NOW.getTime() + 25 * DAY_MS),
  cancelsAt: null,
  namedChurch: null,
  ...changes,
})

describe('Deciding a church-plant application', { timeout: 30_000 }, () => {
  let pool: pg.Pool
  let billing: PostgresBilling
  let applications: PostgresChurchPlantApplications
  let fake: ReturnType<typeof aFakeStripe>
  let email: ReturnType<typeof createRecordingEmail>
  let work: PlantDecisionWork

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    billing = createPostgresBilling(localSupabase().databaseUrl)
    applications = createPostgresChurchPlantApplications(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await billing.close()
    await applications.close()
    await pool.end()
  })

  beforeEach(() => {
    fake = aFakeStripe()
    email = createRecordingEmail()
    work = {
      applications,
      records: billing.records,
      stripe: fake.stripe,
      trials: fake.trials,
      sender: createEmailSender(email.transport),
      clock: createTestClock(NOW),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A church that signed itself up, with the address it proved, and its application. */
  const anApplicant = async (name = `Grace Church ${unique().slice(0, 8)}`) => {
    const church = await createMinistryWithAdmin(name, undefined, { billedOutsideStripe: false })
    const address = `pastor-${unique().slice(0, 12)}@grace.example`
    const { rows: admin } = await pool.query<{ user_id: string }>(
      `select user_id from ministry_member where ministry_id = $1 and tier = 'admin'`,
      [church.id],
    )
    const { error } = await serviceRoleClient().auth.admin.updateUserById(admin[0]!.user_id, {
      email: address,
      email_confirm: true,
    })
    if (error) throw error

    const { rows } = await pool.query<{ id: string }>(
      `insert into church_plant_application
         (ministry_id, launch_date, sending_church, average_attendance, lead_pastor, anything_else, applied_at)
       values ($1, 'September 2025', 'First Baptist', '120', 'Dan Whitfield', null, $2)
       returning id`,
      [church.id, new Date(NOW.getTime() - DAY_MS)],
    )
    return { church, name, address, id: rows[0]!.id }
  }

  /** It opened a trial through sign-up and confirmed its card, and the webhook settled that. */
  const onATrial = async (
    church: MinistryFixture,
    {
      cycle = 'month',
      offer = 'none',
      fingerprint = `fp_${unique()}`,
      subscription = aTrial(),
      settled = true,
    }: {
      readonly cycle?: BillingCycle
      readonly offer?: TrialOffer
      readonly fingerprint?: string | null
      readonly subscription?: StripeSubscriptionFacts
      readonly settled?: boolean
    } = {},
  ) => {
    const customer = await billing.records.rememberCustomer(church.id, `cus_${unique()}`, false)
    fake.subscriptions.set(customer, [subscription])
    fake.methods.set(subscription.id, { fingerprint })
    await billing.records.establish(church.id, async (unit) => {
      await unit.recordOpening({ subscriptionId: subscription.id, cycle, offer }, NOW)
      if (settled) await unit.settleOpening(subscription.id, 'as_opened', NOW)
    })
    return { customer, subscription }
  }

  const rowOf = async (id: string) => {
    const { rows } = await pool.query(`select * from church_plant_application where id = $1`, [id])
    return rows[0] as { decision: string | null; decided_at: Date | null }
  }

  const claimsOn = async (fingerprint: string) => {
    const { rows } = await pool.query(
      `select church from payment_fingerprint_grant where fingerprint = $1 and grant_kind = 'plant_year'`,
      [fingerprint],
    )
    return rows.map((row: { church: string }) => row.church)
  }

  const decisionEmails = () => email.delivered.filter(({ kind }) => kind === 'churchPlantDecision')

  describe('approving', () => {
    it('claims the card, schedules the free year, records it and emails the church', async () => {
      const { church, id, name, address } = await anApplicant()
      const fingerprint = `fp_${unique()}`
      const { subscription } = await onATrial(church, { fingerprint })

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ approved: true, church: name, methodUnchecked: false, nextBill: null, email: 'sent' })
      expect(fake.calls.scheduled).toEqual([
        { subscriptionId: subscription.id, phases: paidPhasesOf({ cycle: 'month', offer: 'none', plantYear: true }) },
      ])
      expect(await claimsOn(fingerprint)).toEqual([church.id])
      const row = await rowOf(id)
      expect(row.decision).toBe('approved')
      expect(row.decided_at).toEqual(NOW)

      expect(decisionEmails()).toHaveLength(1)
      const [sent] = decisionEmails()
      expect(sent!.to).toEqual([address])
      expect(sent!.text).toContain(name)
      expect(sent!.text).toContain('begins when your free trial ends')
      expect(sent!.text).not.toMatch(/https?:/)
    })

    it('follows the free year with the offer\'s year for a church that came with EXPO26', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { offer: 'exponential' })

      await approvePlantApplication(work, id)

      expect(fake.calls.scheduled[0]!.phases).toEqual(paidPhasesOf({ cycle: 'month', offer: 'exponential', plantYear: true }))
    })

    it('takes a yearly church a year at a time', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { cycle: 'year' })

      await approvePlantApplication(work, id)

      expect(fake.calls.scheduled[0]!.phases).toEqual(paidPhasesOf({ cycle: 'year', offer: 'none', plantYear: true }))
    })

    it('lets the plant offer win over a referral month', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { offer: 'referral' })

      await approvePlantApplication(work, id)

      expect(fake.calls.scheduled[0]!.phases).toEqual(paidPhasesOf({ cycle: 'month', offer: 'none', plantYear: true }))
    })

    it('refuses a second church on the same card, says so, and emails nothing', async () => {
      const fingerprint = `fp_${unique()}`
      const first = await anApplicant()
      await onATrial(first.church, { fingerprint })
      await approvePlantApplication(work, first.id)

      const second = await anApplicant()
      await onATrial(second.church, { fingerprint })
      const outcome = await approvePlantApplication(work, second.id)

      expect(outcome).toMatchObject({ refused: 'method_already_had_a_year' })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('already had a church plant year')
      expect(fake.calls.scheduled).toHaveLength(1)
      expect((await rowOf(second.id)).decision).toBeNull()
      expect(decisionEmails()).toHaveLength(1)
      expect(await claimsOn(fingerprint)).toEqual([first.church.id])
    })

    it('approves a method with no fingerprint, and tells the operator it could not be checked', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { fingerprint: null })

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ approved: true, methodUnchecked: true })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('could not be checked')
      expect((await rowOf(id)).decision).toBe('approved')
    })

    it('does nothing at Stripe and sends nothing the second time', async () => {
      const { church, id, name } = await anApplicant()
      await onATrial(church)
      await approvePlantApplication(work, id)
      const decidedAt = (await rowOf(id)).decided_at
      const touches = fake.touches()

      const outcome = await approvePlantApplication(
        { ...work, clock: createTestClock(new Date(NOW.getTime() + DAY_MS)) },
        id,
      )

      expect(outcome).toEqual({ already: 'approved', church: name })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('Nothing was done at Stripe')
      expect(fake.touches()).toBe(touches)
      expect(decisionEmails()).toHaveLength(1)
      expect((await rowOf(id)).decided_at).toEqual(decidedAt)
    })

    it('does it once when two approvals run at the same moment', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church)

      const outcomes = await Promise.all([approvePlantApplication(work, id), approvePlantApplication(work, id)])

      expect(outcomes.filter((outcome) => 'approved' in outcome)).toHaveLength(1)
      expect(outcomes.filter((outcome) => 'already' in outcome)).toHaveLength(1)
      expect(fake.calls.scheduled).toHaveLength(1)
      expect(decisionEmails()).toHaveLength(1)
    })

    it('takes the claim back and records nothing when Stripe fails, and a second try finishes it', async () => {
      const fingerprint = `fp_${unique()}`
      const { church, id } = await anApplicant()
      await onATrial(church, { fingerprint })
      fake.state.failScheduling = true

      await expect(approvePlantApplication(work, id)).rejects.toThrow('Stripe is down')

      expect((await rowOf(id)).decision).toBeNull()
      expect(await claimsOn(fingerprint)).toEqual([])
      expect(decisionEmails()).toEqual([])

      fake.state.failScheduling = false
      expect(await approvePlantApplication(work, id)).toMatchObject({ approved: true })
      expect(await claimsOn(fingerprint)).toEqual([church.id])
    })

    it('stands when the email fails, and tells the operator to write by hand', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { church, id } = await anApplicant()
      await onATrial(church)
      email.failWith(Object.assign(new Error('Resend said something about the address'), { name: 'ResendDown' }))

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ approved: true, email: { failed: 'ResendDown' } })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('Write to it by hand')
      expect((await rowOf(id)).decision).toBe('approved')
      expect(logged.mock.calls.join(' ')).not.toContain('Resend said')
    })
  })

  describe('approving after the trial', () => {
    const paying = (nextBill: Date) =>
      aTrial({
        status: 'active',
        trialEndsAt: new Date(NOW.getTime() - 5 * DAY_MS),
        currentPeriodEndsAt: nextBill,
      })

    it('starts at the next bill, says so to the church, and tells the operator about refunds', async () => {
      const { church, id } = await anApplicant()
      const nextBill = new Date('2026-12-05T12:00:00Z')
      const { subscription } = await onATrial(church, { subscription: paying(nextBill) })

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ approved: true, nextBill })
      expect(fake.calls.scheduled[0]!.subscriptionId).toBe(subscription.id)
      const told = plantOutcomeSentences(outcome).join(' ')
      expect(told).toContain('2026-12-05')
      expect(told).toContain("a refund is James's by hand")
      const [sent] = decisionEmails()
      expect(sent!.text).toContain('begins at your next bill, on December 5, 2026')
      expect(sent!.text).toContain('stays as it is')
    })

    it('counts a church behind on its bill too', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { subscription: { ...paying(new Date('2026-12-05T12:00:00Z')), status: 'past_due' } })

      expect(await approvePlantApplication(work, id)).toMatchObject({ approved: true })
    })
  })

  describe('refusing', () => {
    const expectNothingDone = async (id: string) => {
      expect((await rowOf(id)).decision).toBeNull()
      expect(fake.calls.scheduled).toEqual([])
      expect(decisionEmails()).toEqual([])
    }

    it('an ID there is no application for, mistyped or not', async () => {
      expect(await approvePlantApplication(work, crypto.randomUUID())).toEqual({ refused: 'not_found', church: null })
      expect(await approvePlantApplication(work, 'not-an-id')).toEqual({ refused: 'not_found', church: null })
    })

    it('a church that never opened a Subscription', async () => {
      const { id } = await anApplicant()

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ refused: 'no_subscription' })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('no live Subscription')
      await expectNothingDone(id)
    })

    it('a church billed outside Stripe', async () => {
      const { church, id } = await anApplicant()
      await pool.query(`update ministry_billing set billed_outside_stripe = true where ministry_id = $1`, [church.id])

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ refused: 'outside_stripe' })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('billed outside Stripe')
      await expectNothingDone(id)
    })

    it('a church with no confirmed payment method, and approves it once it has one', async () => {
      const { church, id } = await anApplicant()
      const waiting = aTrial({ awaitingPaymentMethod: true })
      const { customer } = await onATrial(church, { subscription: waiting, settled: false })

      const outcome = await approvePlantApplication(work, id)

      expect(outcome).toMatchObject({ refused: 'no_payment_method' })
      expect(plantOutcomeSentences(outcome).join(' ')).toContain('has not confirmed a card or bank account')
      await expectNothingDone(id)

      fake.subscriptions.set(customer, [{ ...waiting, awaitingPaymentMethod: false }])
      await billing.records.establish(church.id, (unit) => unit.settleOpening(waiting.id, 'as_opened', NOW))
      expect(await approvePlantApplication(work, id)).toMatchObject({ approved: true })
    })

    it('a confirmation the webhook has not finished, which would write over the free year', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { settled: false })

      expect(await approvePlantApplication(work, id)).toMatchObject({ refused: 'not_settled_yet' })
      await expectNothingDone(id)
    })

    it('a Subscription that has ended', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { subscription: aTrial({ status: 'canceled' }) })

      expect(await approvePlantApplication(work, id)).toMatchObject({ refused: 'no_subscription' })
      await expectNothingDone(id)
    })

    it('a Subscription set to end', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church, { subscription: aTrial({ cancelsAt: new Date(NOW.getTime() + DAY_MS) }) })

      expect(await approvePlantApplication(work, id)).toMatchObject({ refused: 'subscription_ending' })
      await expectNothingDone(id)
    })

    it('an application already declined, without touching Stripe', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church)
      await declinePlantApplication(work, id, { email: false })
      const touches = fake.touches()

      expect(await approvePlantApplication(work, id)).toMatchObject({ refused: 'decided_otherwise' })
      expect(fake.touches()).toBe(touches)
      expect((await rowOf(id)).decision).toBe('declined')
    })
  })

  describe('declining', () => {
    it('records it and emails nothing, and leaves Stripe alone', async () => {
      const { church, id, name } = await anApplicant()
      await onATrial(church)

      const outcome = await declinePlantApplication(work, id, { email: false })

      expect(outcome).toEqual({ declined: true, church: name, email: 'not_asked' })
      const row = await rowOf(id)
      expect(row.decision).toBe('declined')
      expect(row.decided_at).toEqual(NOW)
      expect(email.delivered).toEqual([])
      expect(fake.touches()).toBe(0)
    })

    it('sends the decline wording with --email', async () => {
      const { church, id, name, address } = await anApplicant()
      await onATrial(church)

      expect(await declinePlantApplication(work, id, { email: true })).toMatchObject({ declined: true, email: 'sent' })

      const [sent] = decisionEmails()
      expect(sent!.to).toEqual([address])
      expect(sent!.text).toContain(name)
      expect(sent!.text).toContain("aren't able to offer")
    })

    it('changes nothing and sends nothing the second time', async () => {
      const { id, name } = await anApplicant()
      await declinePlantApplication(work, id, { email: true })
      const decidedAt = (await rowOf(id)).decided_at

      expect(await declinePlantApplication(work, id, { email: true })).toEqual({ already: 'declined', church: name })
      expect(decisionEmails()).toHaveLength(1)
      expect((await rowOf(id)).decided_at).toEqual(decidedAt)
    })

    it('is refused for an application already approved', async () => {
      const { church, id } = await anApplicant()
      await onATrial(church)
      await approvePlantApplication(work, id)

      expect(await declinePlantApplication(work, id, { email: true })).toMatchObject({ refused: 'decided_otherwise' })
      expect((await rowOf(id)).decision).toBe('approved')
      expect(decisionEmails()).toHaveLength(1)
    })
  })

  describe('listing', () => {
    it('shows every application with no decision, whichever church, and none decided', async () => {
      const waiting = await anApplicant()
      const decided = await anApplicant()
      await declinePlantApplication(work, decided.id, { email: false })

      const listed = await applications.undecided()

      const found = listed.find(({ id }) => id === waiting.id)
      expect(found).toMatchObject({
        churchId: waiting.church.id,
        churchName: waiting.name,
        adminEmail: waiting.address,
        answers: { sendingChurch: 'First Baptist', anythingElse: null },
        decision: null,
      })
      expect(listed.some(({ id }) => id === decided.id)).toBe(false)
    })
  })

  describe('row-level security', () => {
    it('holds a command acting for one church to that church', async () => {
      const mine = await anApplicant()
      const theirs = await anApplicant()

      const seen = await billing.records.establish(mine.church.id, async (unit) => {
        await unit.recordPlantDecision(theirs.id, 'approved', NOW)
        return {
          mine: await unit.plantDecisionOf(mine.id),
          theirs: await unit.plantDecisionOf(theirs.id),
        }
      })

      expect(seen).toEqual({ mine: null, theirs: null })
      expect((await rowOf(theirs.id)).decision).toBeNull()
    })
  })

  describe('the command itself', { timeout: 120_000 }, () => {
    const run = promisify(execFile)
    // No Stripe key and no Resend key, so anything that reached either would fail here.
    const command = async (...args: string[]) => {
      const { STRIPE_SECRET_KEY: _stripe, RESEND_API_KEY: _resend, ...env } = process.env
      void _stripe
      void _resend
      try {
        const { stdout, stderr } = await run(
          'npx',
          ['vite-node', '-c', 'vitest.config.ts', 'scripts/church-plant.ts', ...args],
          { env: { ...env, DATABASE_URL: localSupabase().databaseUrl } },
        )
        return { code: 0, stdout, stderr }
      } catch (error) {
        const failed = error as { code: number; stdout: string; stderr: string }
        return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
      }
    }

    it('refuses a mistyped command before anything else', async () => {
      expect(await command('approve')).toMatchObject({ code: 2, stderr: expect.stringContaining('Usage') })
      expect(await command('promote', 'x')).toMatchObject({ code: 2 })
      expect(await command('decline', 'x', '--emial')).toMatchObject({ code: 2 })
    })

    it('lists, declines, and refuses to approve a decided one with no key for Stripe', async () => {
      const { id, name } = await anApplicant()

      const listed = await command('list')
      expect(listed.code).toBe(0)
      expect((JSON.parse(listed.stdout) as { id: string }[]).some((application) => application.id === id)).toBe(true)

      const declined = await command('decline', id)
      expect(declined).toMatchObject({ code: 0 })
      expect(declined.stdout).toContain(`${name} is declined.`)

      const again = await command('approve', id)
      expect(again.code).toBe(1)
      expect(again.stdout).toContain('already been decided')
    })

    it('fails an approval with no key for Stripe, and records nothing', async () => {
      const { church, id } = await anApplicant()
      await billing.records.rememberCustomer(church.id, `cus_${unique()}`, false)

      const tried = await command('approve', id)

      expect(tried.code).toBe(1)
      expect(tried.stderr).toContain('Nothing was recorded')
      expect(tried.stderr).toContain('STRIPE_SECRET_KEY')
      expect((await rowOf(id)).decision).toBeNull()
    })
  })
})
