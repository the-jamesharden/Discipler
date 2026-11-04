import { NextRequest } from 'next/server'
import pg from 'pg'
import type { ReactElement, ReactNode } from 'react'
import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripeInboxEntryOf } from '~/domain/billing'
import { createTestClock, type Clock } from '~/domain/clock'
import { asEmailAddress, type Email } from '~/domain/email'
import type { MinistryId } from '~/domain/ids'
import type { BillingCycle } from '~/domain/offers'
import { churchOfRemindersOffToken, remindersOffToken } from '~/platform/reminder-link'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { createPostgresChurchSignups, type PostgresChurchSignups } from '~/platform/supabase/church-signups'
import { readPageDocument, resolutionOf } from '~/platform/supabase/page'
import { provisionMinistry } from '~/platform/supabase/provisioning'
import type { TrialWork } from '~/service/open-trial'
import { watchPaymentReminders } from '~/service/payment-reminder-watch'
import type { AdminResolution, EmailSender, SupportAlerts } from '~/service/ports'
import { processStripeEvent, type StripeEventWork } from '~/service/stripe-events'
import HomePage from '../../app/page'
import { GET as access } from '../../app/signup/payment/access/route'
import { stepAfterOpening } from '../../app/signup/payment/flow'
import { PaymentForm } from '../../app/signup/payment/form'
import { POST as open } from '../../app/signup/payment/open/route'
import PaymentPage from '../../app/signup/payment/page'
import RemindersOffPage from '../../app/signup/reminders-off/page'
import { POST as stopReminders } from '../../app/signup/reminders-off/stop/route'
import { aFakeStripe } from '../support/fake-stripe'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The payment step and everything around it (Exponential launch, ticket 18): the pages
 * and routes as the server runs them, against the real schema, roles and signed-in
 * session, with Stripe a fake at its ports and the Element's confirming a line in the
 * fake. In process, because a built server has sign-up shut and must not reach Stripe.
 * What the Elements do in a browser is for staging, which the ticket lists.
 */

let work: TrialWork | null = null
let signups: PostgresChurchSignups | null = null
let session: () => Promise<AdminResolution> = async () => ({ status: 'signed-out' })

vi.mock('~/service/container', () => ({
  getTrialWork: () => {
    if (!work) throw new Error('A route reached Stripe while it should have been shut.')
    return work
  },
  getChurchSignups: () => {
    if (!signups) throw new Error('A page reached the store too early.')
    return signups
  },
}))

vi.mock('~/platform/supabase/current-admin', () => ({
  resolveAdmin: () => session(),
  adminEmailFromToken: async () => 'dan@grace.example',
}))

const PASSWORD = 'grace shepherds 1'

const unique = () => crypto.randomUUID().replaceAll('-', '')

/** Where a page sends the browser, or null if it renders. */
const redirectOf = async (page: () => Promise<unknown>): Promise<string | null> => {
  try {
    await page()
    return null
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return digest.split(';')[2]!
    throw error
  }
}

const isNotFound = async (page: () => Promise<unknown>): Promise<boolean> => {
  try {
    await page()
    return false
  } catch (error) {
    return (error as { digest?: unknown }).digest === 'NEXT_HTTP_ERROR_FALLBACK;404'
  }
}

const noQuery = { searchParams: Promise.resolve({}) }

/** What the page hands the form: the church's own stored choice. */
const formPropsIn = (node: ReactNode): React.ComponentProps<typeof PaymentForm> | null => {
  if (!isValidElement(node)) return null
  const element = node as ReactElement<{ children?: ReactNode }>
  if (element.type === PaymentForm) return element.props as unknown as React.ComponentProps<typeof PaymentForm>
  const children = element.props.children
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = formPropsIn(child)
    if (found) return found
  }
  return null
}

describe('The payment step', { timeout: 30_000 }, () => {
  let pool: pg.Pool
  let billing: PostgresBilling
  let clock: ReturnType<typeof createTestClock>
  let fake: ReturnType<typeof aFakeStripe>
  let events: StripeEventWork

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    billing = createPostgresBilling(localSupabase().databaseUrl)
    signups = createPostgresChurchSignups(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await pool.query(`delete from stripe_event`)
    await billing.close()
    await signups?.close()
    await pool.end()
  })

  beforeEach(() => {
    clock = createTestClock(new Date('2026-11-10T18:00:00Z'))
    fake = aFakeStripe(clock)
    work = {
      records: billing.records,
      stripe: fake.stripe,
      trials: fake.trials,
      invitations: { wasInvited: async () => false },
      clock,
    }
    events = {
      inbox: billing.inbox,
      records: billing.records,
      stripe: fake.stripe,
      trials: fake.trials,
      alerts: { async billingEventRefused() {} } as unknown as SupportAlerts,
      clock,
    }
    vi.stubEnv('SIGN_UP_OPEN', 'true')
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_not_a_real_key')
    vi.stubEnv('SIGN_UP_CODE_SECRET', 'a-test-secret-that-is-long-enough-to-be-accepted')
    session = async () => ({ status: 'signed-out' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  /** A church as "Set up your account" opens one, spending a real attempt. */
  const aSignedUpChurch = async ({
    cycle = 'month',
    carriedCode = null,
    timezone = 'America/Chicago',
    fullName = 'Dan Whitfield',
    at = clock.now(),
  }: {
    cycle?: BillingCycle
    carriedCode?: string | null
    timezone?: string
    fullName?: string
    at?: Date
  } = {}): Promise<MinistryFixture & { email: string }> => {
    publishSupabaseCredentials()
    const email = `${unique()}@grace.example`
    const phone = aTestPhoneNumber()
    const attempt = await pool.query<{ id: string }>(
      `insert into pending_signup (attempt_digest, human_passed_at, email, phone, agreed_at, verified_at)
       values ($1, $2, $3, $4, $2, $2) returning id`,
      [unique() + unique(), at, email, phone],
    )
    const name = `Grace Church ${unique().slice(0, 8)}`
    const opened = await provisionMinistry({
      name,
      timezone,
      at,
      admin: { fullName, phone, password: PASSWORD, email: asEmailAddress(email)! },
      signedUp: {
        pendingSignupId: attempt.rows[0]!.id,
        agreedAt: at,
        cycle,
        carriedCode,
        heardFrom: null,
      },
    })
    return {
      id: opened.ministryId as MinistryId,
      name,
      adminName: fullName,
      adminPhone: opened.adminPhone,
      adminPassword: PASSWORD,
      adminUserId: opened.adminUserId,
      adminPersonId: opened.adminPersonId,
      shortName: opened.shortName,
      email,
    }
  }

  const asAdminOf = (church: MinistryFixture) => {
    session = async () => resolutionOf(await readPageDocument(await signInAs(church), 'signed_in_admin'))
  }

  const post = (fields: Record<string, string>) =>
    open(
      new NextRequest('http://127.0.0.1:3341/signup/payment/open', {
        method: 'POST',
        body: new URLSearchParams(fields),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    )

  /** The page, as far as the server takes it: what it read, and what opening it answered. */
  const arriveAtThePage = async (query: Record<string, string> = {}) => {
    const element = await PaymentPage({ searchParams: Promise.resolve(query) })
    const props = formPropsIn(element)
    if (!props) throw new Error('The page has no form on it')
    const response = await post({ cycle: props.cycle, code: props.code ?? '' })
    const body = (await response.json()) as Record<string, unknown>
    const step = stepAfterOpening(
      response.ok
        ? { ok: true, body: body as never }
        : { ok: false, refusal: body.refusal as string, message: body.message as string },
    )
    return { props, response, body, step, markup: renderToStaticMarkup(element) }
  }

  const hasAccess = async () => ((await (await access()).json()) as { hasAccess: boolean }).hasAccess

  const subscriptionsOf = async (church: MinistryFixture) => {
    const { customerId } = await billing.records.of(church.id)
    return customerId ? (fake.held.get(customerId) ?? []) : []
  }

  /** Stripe's event about this church, through the webhook's own processing. */
  const webhookLands = async (church: MinistryFixture, type = 'customer.subscription.updated') => {
    const { customerId } = await billing.records.of(church.id)
    if (!customerId) throw new Error('This church has no customer yet')
    const id = `evt_${unique()}`
    const object = type.startsWith('setup_intent')
      ? { object: 'setup_intent', id: `seti_${unique()}`, customer: customerId, metadata: {} }
      : { object: 'subscription', id: `sub_${unique()}`, customer: customerId, metadata: { ministry_id: church.id } }
    await billing.inbox.receive(
      stripeInboxEntryOf({ id, type, livemode: false, created: Math.floor(clock.now().getTime() / 1000), object }),
      clock.now(),
    )
    await processStripeEvent(events, id)
  }

  /** The Element confirms, and nothing else has happened yet. */
  const elementConfirms = async (church: MinistryFixture) => {
    const [subscription] = await subscriptionsOf(church)
    fake.confirm(subscription!.id)
    return subscription!
  }

  describe('coming back', () => {
    it('sends a church that signed itself up from / to the step, and the step agrees', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)

      expect(await redirectOf(() => HomePage())).toBe('/signup/payment')
      expect(await redirectOf(() => PaymentPage(noQuery))).toBeNull()
    })

    it('brings them back the next day with the same choice and the same code', async () => {
      const grace = await aSignedUpChurch({ cycle: 'year', carriedCode: 'EXPO26' })
      asAdminOf(grace)
      const first = await arriveAtThePage()
      expect(first.step.kind).toBe('form')

      clock.advanceBy(24 * 60 * 60 * 1000)

      expect(await redirectOf(() => HomePage())).toBe('/signup/payment')
      const { props, body, step } = await arriveAtThePage()
      expect(props).toMatchObject({ cycle: 'year', code: 'EXPO26', timeZone: 'America/Chicago' })
      expect(step.kind).toBe('form')
      expect(body.offer).toBe('exponential')
      expect(body.codeRefusal).toBeNull()
      // Replaced after a day, so they keep every free day (ticket 04), and only one is live.
      expect((await subscriptionsOf(grace)).filter(({ status }) => status === 'trialing')).toHaveLength(1)
      expect(fake.calls.canceled).toHaveLength(1)
      expect(fake.calls.opened.every((trial) => trial.cycle === 'year')).toBe(true)
    })

    it('brings a church holding an expired code back at the normal price, with the expired sentence', async () => {
      const grace = await aSignedUpChurch({ cycle: 'month', carriedCode: 'EXPO26' })
      asAdminOf(grace)

      clock.advanceTo(new Date('2026-12-20T18:00:00Z'))

      const { props, body, step, response } = await arriveAtThePage()
      expect(props.code).toBe('EXPO26')
      expect(response.status).toBe(200)
      expect(body.offer).not.toBe('exponential')
      expect(step).toMatchObject({
        kind: 'form',
        codeRefusal: {
          refusal: 'offer.code_expired',
          message: 'That code has expired, but your free trial still applies.',
        },
      })
    })

    it('never sends the Admin of an existing church billed outside Stripe there', async () => {
      const anthem = await createMinistryWithAdmin('Anthem')
      asAdminOf(anthem)

      expect(await redirectOf(() => HomePage())).toBe('/overview')
      expect(await redirectOf(() => PaymentPage(noQuery))).toBe('/')
    })

    it('never sends an Admin there whose church has no sign-up behind it, whatever its billing', async () => {
      const older = await createMinistryWithAdmin('Older Church', undefined, { billedOutsideStripe: false })
      asAdminOf(older)

      expect(await redirectOf(() => HomePage())).toBe('/overview')
      expect(await redirectOf(() => PaymentPage(noQuery))).toBe('/')
    })

    it('sends nobody there while sign-up is shut, and the page is not there at all', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)
      vi.stubEnv('SIGN_UP_OPEN', '')

      expect(await redirectOf(() => HomePage())).toBe('/overview')
      expect(await isNotFound(() => PaymentPage(noQuery))).toBe(true)
      expect((await access()).status).toBe(404)
    })

    it('sends somebody signed out to sign in', async () => {
      expect(await redirectOf(() => PaymentPage(noQuery))).toBe('/login')
    })

    it('lands on the Overview when the question about the step cannot be answered', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)
      const failing = vi.spyOn(signups!, 'of').mockRejectedValue(new Error('the secret words of a driver'))
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(await redirectOf(() => HomePage())).toBe('/overview')

      expect(logged.mock.calls.flat().join(' ')).not.toContain('secret words')
      failing.mockRestore()
    })
  })

  describe('nothing the browser says unlocks anything', () => {
    it('opens the form again at the return address when nothing was confirmed', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)
      await arriveAtThePage()

      const back = await arriveAtThePage({
        setup_intent: 'seti_1234',
        setup_intent_client_secret: 'seti_1234_secret_5678',
        redirect_status: 'succeeded',
      })

      expect(back.step.kind).toBe('form')
      expect(await hasAccess()).toBe(false)
      expect(await redirectOf(() => HomePage())).toBe('/signup/payment')
      expect((await billing.records.of(grace.id)).state).not.toBe('trialing')
    })

    it('hands back the same waiting Subscription within the day, so coming back makes no second one', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)
      await arriveAtThePage()

      clock.advanceBy(60 * 60 * 1000)
      const back = await arriveAtThePage()

      expect(back.step.kind).toBe('form')
      expect(await subscriptionsOf(grace)).toHaveLength(1)
      expect(fake.calls.canceled).toEqual([])
    })

    it('tells the page when Stripe sent a method back failed, and nothing else follows from it', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)

      const { props, step } = await arriveAtThePage({ redirect_status: 'failed' })

      expect(props.cameBackFailed).toBe(true)
      expect(step.kind).toBe('form')
      expect((await arriveAtThePage({ redirect_status: 'succeeded' })).props.cameBackFailed).toBe(false)
    })
  })

  describe('while the webhook is on its way', () => {
    it('never loops: / and the page agree before it lands and after', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)
      await arriveAtThePage()
      expect(await hasAccess()).toBe(false)

      await elementConfirms(grace)

      // Confirmed at Stripe, with nothing yet written here: the step, and it waits.
      expect(await redirectOf(() => HomePage())).toBe('/signup/payment')
      expect(await redirectOf(() => PaymentPage(noQuery))).toBeNull()
      const waiting = await arriveAtThePage()
      expect(waiting.body.refusal).toBe('payment.already_paying')
      expect(waiting.step).toEqual({ kind: 'waiting' })
      expect(await hasAccess()).toBe(false)

      await webhookLands(grace)

      expect(await hasAccess()).toBe(true)
      expect(await redirectOf(() => HomePage())).toBe('/overview')
      expect(await redirectOf(() => PaymentPage(noQuery))).toBe('/')
    })
  })

  describe('the access read', () => {
    it('says no to somebody signed out, and holds nothing else', async () => {
      const response = await access()

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ hasAccess: false })
    })

    it('is true for a church whose webhook has landed', async () => {
      const grace = await aSignedUpChurch()
      asAdminOf(grace)
      await arriveAtThePage()
      await elementConfirms(grace)
      await webhookLands(grace)

      expect(await (await access()).json()).toEqual({ hasAccess: true })
    })
  })

  describe('the reminder', () => {
    const LINKS = {
      start: () => new URL('https://app.trydiscipler.com/'),
      logo: () => new URL('https://app.trydiscipler.com/discipler-logo.png'),
      stop: (church: MinistryId) =>
        new URL(`https://app.trydiscipler.com/signup/reminders-off?t=${remindersOffToken(church)}`),
    }

    /** One tick's pass over a sender that keeps what it was given. */
    const aTick = async (at: Clock) => {
      const sent: Email[] = []
      const sender: EmailSender = {
        async send(email) {
          sent.push(email)
        },
      }
      const outcome = await watchPaymentReminders({ signups: signups!, sender, clock: at, links: LINKS })
      return { sent, outcome }
    }

    /** What one tick sent to this church, among every church the shared database holds. */
    const tickSends = async (church: { email: string }) => {
      const { sent } = await aTick(clock)
      return sent.filter(({ to }) => String(to) === church.email)
    }

    /** 3pm in Chicago on the day it opened, which is 21:00Z in November. */
    const OPENED = new Date('2026-11-10T21:00:00Z')
    const NEXT_DAY_858AM = new Date('2026-11-11T14:58:00Z')
    const NEXT_DAY_9AM = new Date('2026-11-11T15:00:00Z')

    beforeEach(() => clock.advanceTo(OPENED))

    it('goes once, on the first tick at or after 9am the next day on the church clock', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })

      expect(await tickSends(grace)).toEqual([])

      clock.advanceTo(NEXT_DAY_858AM)
      expect(await tickSends(grace)).toEqual([])

      clock.advanceTo(NEXT_DAY_9AM)
      const [email, ...more] = await tickSends(grace)
      expect(more).toEqual([])
      expect(email).toMatchObject({ kind: 'paymentReminder', subject: expect.anything() })

      clock.advanceBy(15 * 60 * 1000)
      expect(await tickSends(grace)).toEqual([])

      const { rows } = await pool.query(`select reminder_sent_at from church_signup where ministry_id = $1`, [grace.id])
      expect(rows[0].reminder_sent_at).toEqual(NEXT_DAY_9AM)
    })

    it('reads 9am on the church clock and nobody else', async () => {
      const opened = new Date('2026-11-10T21:00:00Z')
      const grace = await aSignedUpChurch({ at: opened, timezone: 'America/Los_Angeles' })

      clock.advanceTo(NEXT_DAY_9AM) // 7am in Los Angeles.
      expect(await tickSends(grace)).toEqual([])

      clock.advanceTo(new Date('2026-11-11T17:00:00Z')) // 9am in Los Angeles.
      expect(await tickSends(grace)).toHaveLength(1)
    })

    it('does not go on a later day if every tick of that day was missed', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })

      clock.advanceTo(new Date('2026-11-12T15:30:00Z'))

      expect(await tickSends(grace)).toEqual([])
    })

    it('does not go once the method is confirmed', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      asAdminOf(grace)
      await arriveAtThePage()
      await elementConfirms(grace)
      await webhookLands(grace)

      clock.advanceTo(NEXT_DAY_9AM)

      expect(await tickSends(grace)).toEqual([])
    })

    it('does go for a church that opened a trial and left without confirming', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      asAdminOf(grace)
      await arriveAtThePage()
      await webhookLands(grace, 'customer.subscription.created')

      clock.advanceTo(NEXT_DAY_9AM)

      expect(await tickSends(grace)).toHaveLength(1)
    })

    it('does not go to a church billed outside Stripe', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      await pool.query(`update ministry_billing set billed_outside_stripe = true where ministry_id = $1`, [grace.id])

      clock.advanceTo(NEXT_DAY_9AM)

      expect(await tickSends(grace)).toEqual([])
    })

    it('says a saved EXPO26 while it is valid, and to the address on the account', async () => {
      const grace = await aSignedUpChurch({ at: OPENED, carriedCode: 'EXPO26' })

      clock.advanceTo(NEXT_DAY_9AM)
      const [email] = await tickSends(grace)

      expect(String(email!.to)).toBe(grace.email)
      expect(email!.body.text).toContain('Your Exponential special offer is saved until December 11.')
      expect(email!.body.text).toContain('Dan, we are so excited')
    })

    it('costs nobody else their email when one send fails, and tries that one again', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      const hope = await aSignedUpChurch({ at: OPENED })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      clock.advanceTo(NEXT_DAY_9AM)

      const delivered: string[] = []
      const sender: EmailSender = {
        async send({ to }) {
          if (String(to) === grace.email) throw new Error('Resend is down')
          delivered.push(String(to))
        },
      }
      const outcome = await watchPaymentReminders({ signups: signups!, sender, clock, links: LINKS })

      expect(delivered).toContain(hope.email)
      expect(outcome.failed).toBeGreaterThanOrEqual(1)
      expect(await tickSends(grace)).toHaveLength(1)
      expect(await tickSends(hope)).toEqual([])
    })

    it('stops, signed out, when the button is pressed', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      const t = remindersOffToken(grace.id)

      // Following the link, as an email scanner does, stops nothing.
      const asked = renderToStaticMarkup(await RemindersOffPage({ searchParams: Promise.resolve({ t }) }))
      expect(asked).toContain('<button')
      expect((await signups!.of(grace.id))!.remindersOff).toBe(false)

      const response = await stopReminders(
        new NextRequest('http://127.0.0.1:3341/signup/reminders-off/stop', {
          method: 'POST',
          body: new URLSearchParams({ t }),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }),
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain(`/signup/reminders-off?t=${encodeURIComponent(t)}`)
      expect(response.headers.getSetCookie()).toEqual([])
      expect((await signups!.of(grace.id))!.remindersOff).toBe(true)
      const done = renderToStaticMarkup(await RemindersOffPage({ searchParams: Promise.resolve({ t }) }))
      expect(done).toContain('You won&#x27;t get another reminder.')
      expect(done).not.toContain('<button')

      clock.advanceTo(NEXT_DAY_9AM)
      expect(await tickSends(grace)).toEqual([])
    })

    it('works while sign-up is shut, because a sent email promised it', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      vi.stubEnv('SIGN_UP_OPEN', '')
      const t = remindersOffToken(grace.id)

      expect(renderToStaticMarkup(await RemindersOffPage({ searchParams: Promise.resolve({ t }) }))).toContain('<button')
    })

    it('is a 404 for a token that is not signed, and changes nothing', async () => {
      const grace = await aSignedUpChurch({ at: OPENED })
      const hope = await aSignedUpChurch({ at: OPENED })
      const forged = `${grace.id}.${remindersOffToken(hope.id).split('.')[1]}`
      expect(churchOfRemindersOffToken(forged)).toBeNull()

      for (const t of [forged, grace.id, 'nonsense', '']) {
        expect(await isNotFound(() => RemindersOffPage({ searchParams: Promise.resolve({ t }) }))).toBe(true)
        const response = await stopReminders(
          new NextRequest('http://127.0.0.1:3341/signup/reminders-off/stop', {
            method: 'POST',
            body: new URLSearchParams({ t }),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          }),
        )
        expect(response.status).toBe(404)
      }
      expect((await signups!.of(grace.id))!.remindersOff).toBe(false)
    })
  })

  describe('the store', () => {
    it('holds one church to its own row, as discipler_command', async () => {
      const grace = await aSignedUpChurch({ cycle: 'year', carriedCode: 'EXPO26' })
      const other = await createMinistryWithAdmin('No Sign-up Here', undefined, { billedOutsideStripe: false })

      expect(await signups!.of(grace.id)).toEqual({
        cycle: 'year',
        carriedCode: 'EXPO26',
        timeZone: 'America/Chicago',
        began: false,
        remindersOff: false,
      })
      expect(await signups!.of(other.id)).toBeNull()
    })
  })
})
