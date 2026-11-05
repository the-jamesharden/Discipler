import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BillingPicture } from '~/domain/billing-picture'
import { createTestClock } from '~/domain/clock'
import { openEnvelope, type Email } from '~/domain/email'
import {
  createPostgresTrialEndingNotices,
  type PostgresTrialEndingNotices,
} from '~/platform/supabase/trial-ending-notices'
import type { EmailSender } from '~/service/ports'
import { watchTrialEndings } from '~/service/trial-ending-watch'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The email a week before a trial ends (Exponential launch, ticket 33), read from the real
 * schema across every church, with Stripe and the sender fakes at their ports. A date no
 * other suite's church is near, and only these churches' customers answer, so another
 * suite's church in the shared database is never a candidate that says anything.
 */
const TRIAL_ENDS = new Date('2031-06-30T16:00:00Z')
const DUE = new Date('2031-06-23T13:00:00Z')

const unique = () => crypto.randomUUID().replaceAll('-', '')

describe('the trial-ending email', { timeout: 30_000 }, () => {
  let pool: pg.Pool
  let notices: PostgresTrialEndingNotices
  /** Which customers Stripe knows, and what it says of each. */
  const pictures = new Map<string, BillingPicture | null>()

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    notices = createPostgresTrialEndingNotices(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await notices.close()
    await pool.end()
  })

  const aPicture = (subscriptionId: string, changes: Partial<BillingPicture> = {}): BillingPicture => ({
    subscriptionId,
    onASchedule: false,
    status: 'trialing',
    cycle: 'month',
    priceCents: 9_700,
    aboveTheLimit: false,
    trial: { days: 30, endsAt: TRIAL_ENDS },
    nextPayment: { cents: 9_700, fullCents: 9_700, at: TRIAL_ENDS },
    cancelsAt: null,
    endedAt: null,
    offers: [],
    creditCents: 0,
    creditLeftCents: 0,
    method: { kind: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 },
    failed: null,
    ...changes,
  })

  const anEmailFor = (fixture: { id?: string }, seed: string) => `${seed}-${unique().slice(0, 8)}@church.example`

  /** A church on a confirmed trial, as the webhook would have written it. */
  const aChurchOnATrial = async (
    name: string,
    {
      billedOutsideStripe = false,
      awaiting = false,
      cancelsAt = null as Date | null,
      endsAt = TRIAL_ENDS,
    } = {},
  ): Promise<MinistryFixture & { customerId: string; subscriptionId: string }> => {
    const church = await createMinistryWithAdmin(name, undefined, { billedOutsideStripe })
    const customerId = `cus_${unique()}`
    const subscriptionId = `sub_${unique()}`
    await pool.query(`update ministry set timezone = 'America/New_York' where id = $1`, [church.id])
    await pool.query(
      `insert into ministry_billing (ministry_id, stripe_customer_id, stripe_subscription_id, livemode, billed_outside_stripe)
       values ($1, $2, $3, false, $4)
       on conflict (ministry_id) do update
         set stripe_customer_id = excluded.stripe_customer_id,
             stripe_subscription_id = excluded.stripe_subscription_id,
             livemode = false,
             billed_outside_stripe = excluded.billed_outside_stripe`,
      [church.id, customerId, subscriptionId, billedOutsideStripe],
    )
    await pool.query(
      `insert into billing_event (ministry_id, stripe_event_id, stripe_event_type, stripe_event_at, recorded_at,
                                  livemode, stripe_customer_id, stripe_subscription_id, subscription_status,
                                  trial_ends_at, cancels_at, awaiting_payment_method)
       values ($1, $2, 'setup_intent.succeeded', now(), now(), false, $3, $4, 'trialing', $5, $6, $7)`,
      [church.id, `evt_${unique()}`, customerId, subscriptionId, endsAt, cancelsAt, awaiting],
    )
    await pool.query(
      `update auth.users set email = $1
        where id = (select user_id from ministry_member where ministry_id = $2 and tier = 'admin' limit 1)`,
      [anEmailFor(church, 'first-admin'), church.id],
    )
    pictures.set(customerId, aPicture(subscriptionId))
    return { ...church, customerId, subscriptionId }
  }

  const aPlantApplication = (church: MinistryFixture, decision: 'approved' | 'declined' | null) =>
    pool.query(
      `insert into church_plant_application
         (ministry_id, launch_date, sending_church, average_attendance, lead_pastor, applied_at, decision, decided_at)
       values ($1, 'Next spring', 'Grace', '40', 'Dan', now(), $2::text, case when $2::text is null then null else now() end)`,
      [church.id, decision],
    )

  const aSender = (failingFor: (to: string) => boolean = () => false) => {
    const sent: Email[] = []
    const sender: EmailSender = {
      async send(email) {
        const { to } = openEnvelope(email)
        if (failingFor(to[0]!)) throw Object.assign(new Error('Resend said no'), { name: 'EmailNotSent' })
        sent.push(email)
      },
    }
    return { sent, sender }
  }

  const pass = async (sender: EmailSender, at: Date = DUE) =>
    watchTrialEndings({
      notices,
      account: { pictureOf: async (customerId) => pictures.get(customerId) ?? null },
      sender,
      clock: createTestClock(at),
      links: {
        billing: () => new URL('https://app.trydiscipler.com/settings/billing'),
        logo: () => new URL('https://app.trydiscipler.com/discipler-logo.png'),
      },
    })

  const about = (sent: readonly Email[], churchName: string) =>
    sent.map(openEnvelope).filter(({ text }) => text.includes(churchName))

  it('goes to every Admin, one email each, and once', async () => {
    const name = `Riverside ${unique().slice(0, 6)}`
    const church = await aChurchOnATrial(name)
    const second = await addPersonWithAccount(church, 'Second Admin', 'admin')
    await pool.query(`update auth.users set email = $1 where id = (select user_id from person where id = $2)`, [
      `second-${unique().slice(0, 8)}@church.example`,
      second.personId,
    ])

    const { sent, sender } = aSender()
    await pass(sender)

    const emails = about(sent, name)
    expect(emails).toHaveLength(2)
    expect(new Set(emails.map(({ to }) => to[0])).size).toBe(2)
    expect(emails[0]?.subject).toBe('Your free trial ends June 30')
    expect(new Set(emails.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(2)

    const again = aSender()
    await pass(again.sender, new Date(DUE.getTime() + 60 * 60 * 1000))
    expect(about(again.sent, name)).toEqual([])
  })

  it('tries again for only the Admin it missed', async () => {
    const name = `Retrying ${unique().slice(0, 6)}`
    const church = await aChurchOnATrial(name)
    const second = await addPersonWithAccount(church, 'Second Admin', 'admin')
    const address = `flaky-${unique().slice(0, 8)}@church.example`
    await pool.query(`update auth.users set email = $1 where id = (select user_id from person where id = $2)`, [
      address,
      second.personId,
    ])

    const first = aSender((to) => to === address)
    const outcome = await pass(first.sender)
    expect(about(first.sent, name)).toHaveLength(1)
    expect(outcome.failed).toBeGreaterThanOrEqual(1)

    const next = aSender()
    await pass(next.sender, new Date(DUE.getTime() + 60 * 60 * 1000))
    expect(about(next.sent, name).map(({ to }) => to[0])).toEqual([address])
  })

  it('is not sent before its day, and is sent late rather than never', async () => {
    const name = `Punctual ${unique().slice(0, 6)}`
    await aChurchOnATrial(name)

    const early = aSender()
    await pass(early.sender, new Date('2031-06-23T12:59:00Z'))
    expect(about(early.sent, name)).toEqual([])

    const late = aSender()
    await pass(late.sender, new Date('2031-06-29T02:00:00Z'))
    expect(about(late.sent, name)).toHaveLength(1)
  })

  it('sends an approved church plant nothing at all', async () => {
    const name = `Plant ${unique().slice(0, 6)}`
    await aPlantApplication(await aChurchOnATrial(name), 'approved')

    const { sent, sender } = aSender()
    await pass(sender)

    expect(about(sent, name)).toEqual([])
  })

  it.each(['declined', null] as const)('still warns a plant whose application is %s', async (decision) => {
    const name = `Applied ${unique().slice(0, 6)}`
    await aPlantApplication(await aChurchOnATrial(name), decision)

    const { sent, sender } = aSender()
    await pass(sender)

    expect(about(sent, name)).toHaveLength(1)
  })

  it('sends nothing to a church that is cancelling, billed by hand, or with nothing saved', async () => {
    const names = [`Cancelling ${unique().slice(0, 6)}`, `Hand ${unique().slice(0, 6)}`, `Waiting ${unique().slice(0, 6)}`]
    await aChurchOnATrial(names[0]!, { cancelsAt: TRIAL_ENDS })
    await aChurchOnATrial(names[1]!, { billedOutsideStripe: true })
    await aChurchOnATrial(names[2]!, { awaiting: true })

    const { sent, sender } = aSender()
    await pass(sender)

    for (const name of names) expect(about(sent, name)).toEqual([])
  })

  it('believes Stripe over its own record: one cancelled a moment ago hears nothing, and is not marked', async () => {
    const name = `Just left ${unique().slice(0, 6)}`
    const church = await aChurchOnATrial(name)
    pictures.set(church.customerId, aPicture(church.subscriptionId, { cancelsAt: TRIAL_ENDS }))

    const { sent, sender } = aSender()
    await pass(sender)
    expect(about(sent, name)).toEqual([])

    // Kept again before the week was out: it does hear.
    pictures.set(church.customerId, aPicture(church.subscriptionId))
    const next = aSender()
    await pass(next.sender, new Date(DUE.getTime() + 24 * 60 * 60 * 1000))
    expect(about(next.sent, name)).toHaveLength(1)
  })

  it('says nothing and tries again when Stripe cannot be read, and costs nobody else theirs', async () => {
    const name = `Unlucky ${unique().slice(0, 6)}`
    const other = `Lucky ${unique().slice(0, 6)}`
    const unlucky = await aChurchOnATrial(name)
    await aChurchOnATrial(other)

    const { sent, sender } = aSender()
    const outcome = await watchTrialEndings({
      notices,
      account: {
        pictureOf: async (customerId) => {
          if (customerId === unlucky.customerId) throw new Error('Stripe is down')
          return pictures.get(customerId) ?? null
        },
      },
      sender,
      clock: createTestClock(DUE),
      links: {
        billing: () => new URL('https://app.trydiscipler.com/settings/billing'),
        logo: () => new URL('https://app.trydiscipler.com/discipler-logo.png'),
      },
    })

    expect(outcome.failed).toBeGreaterThanOrEqual(1)
    expect(about(sent, name)).toEqual([])
    expect(about(sent, other)).toHaveLength(1)
  })

  it('needs no card details from a church paying with Link', async () => {
    const name = `Linked ${unique().slice(0, 6)}`
    const church = await aChurchOnATrial(name)
    pictures.set(church.customerId, aPicture(church.subscriptionId, { method: { kind: 'link' } }))

    const { sent, sender } = aSender()
    await pass(sender)

    expect(about(sent, name)[0]?.text).toContain('That day your Link account is charged $97.00 for your first month.')
  })
})
