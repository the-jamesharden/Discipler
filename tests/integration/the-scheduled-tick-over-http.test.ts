import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import { capacityConcerns } from '~/domain/shared-numbers'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresSharedNumbers } from '~/platform/supabase/shared-numbers'
import { createCommandService } from '~/service/command-service'
import { baseUrl, cronSecret, skipUnlessAppIsRunning } from '../support/app'
import {
  addASharedNumber,
  createMinistryWithAdmin,
  enoughForATick,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A generous timeout, and the reason is the route's shape rather than the test's:
 * it ticks and drains every Ministry in turn, so one run costs the sum of them.
 * That is right for a pilot and it is why a local database, which accumulates a
 * Ministry per fixture per run and is only emptied by `npm run db:reset`, makes
 * this the slowest thing in the suite. Ministries are handled sequentially on
 * purpose -- each is its own transaction and one Ministry's failure must not take
 * another's week with it -- and nothing here is waiting on that changing. So the
 * allowance is counted from the Ministries the database holds (`enoughForATick`),
 * before the tests are defined, and never fixed.
 */
const enoughForEveryMinistry = await enoughForATick()

/**
 * The clock's one caller, driven the way Vercel Cron drives it. Over HTTP against
 * the running app, because everything this route is for lives at the edge no unit
 * test reaches: the header the scheduler sends, the enumeration of Ministries the
 * tick is scoped by, and the drain that follows it in the same pass.
 *
 * The secret is the deployment's, so these read it rather than choosing it -- a
 * test that set it would be proving the route agrees with itself.
 */
describe.skipIf(skipUnlessAppIsRunning)('the scheduled tick, as the scheduler runs it', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const secret = cronSecret
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Cron Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    // A concern makes the capacity watch email support@, which a test cannot do, so
    // the pass would read as `failed`. A freshly reset database is quiet only until
    // a tick gives a phone its first number, so this counts one more church per phone
    // than there is today; only a suite that happened to run first would otherwise
    // have added the number that keeps it quiet.
    const numbers = createPostgresSharedNumbers(localSupabase().databaseUrl)
    const afterAPass = async () => {
      const load = await numbers.load()
      return { ...load, mostChurchesOnOnePhone: load.mostChurchesOnOnePhone + 1 }
    }
    while (capacityConcerns(await afterAPass()).length > 0) await addASharedNumber()
    await numbers.close()
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const tick = async (authorization?: string) => {
    const response = await fetch(`${baseUrl}/cron/tick`, {
      redirect: 'manual',
      headers: authorization ? { authorization } : {},
    })
    return { status: response.status, body: await response.text() }
  }

  it('refuses a caller with no credential at all', async () => {
    const { status } = await tick()
    expect(status).toBe(401)
  })

  it('refuses a caller offering the wrong secret', async () => {
    const { status, body } = await tick('Bearer not-the-secret')
    expect(status).toBe(401)
    // Nothing about why. Telling a stranger whether a secret is configured, or
    // merely wrong, tells them which of the two to keep trying.
    expect(body).not.toContain('CRON_SECRET')
  })

  it('refuses a secret offered without the scheme the scheduler uses', async () => {
    const { status } = await tick(secret ?? 'unset')
    expect(status).toBe(401)
  })

  it('runs every Ministry and reports each one, given the scheduler’s own header', { timeout: enoughForEveryMinistry }, async () => {
    // Not skipped when absent. This route is the only caller the clock has, and a
    // suite that quietly passed without exercising it would hide the one proof that
    // the scheduler can drive Discipler at all.
    if (!secret) throw new Error('CRON_SECRET is not set, so this cannot be exercised')

    const { status, body } = await tick(`Bearer ${secret}`)
    expect(status).toBe(200)

    const outcome = JSON.parse(body) as {
      ministries: number
      sent: number
      withheld: number
      failed: number
      settled: { fulfilled: number; refused: number; waiting: number }
      errors: { ministryId: string; error: string }[]
    }

    // Every Ministry, not the caller's: the scheduler has no session and no
    // Ministry of its own, and a tick that ran for one of them would leave every
    // other congregation's week unasked.
    expect(outcome.ministries).toBeGreaterThan(0)
    expect(Number.isInteger(outcome.sent)).toBe(true)
    // The pairings imports planned are settled on every pass, before the drain
    // that carries their invitations (ADR-0022).
    expect(Number.isInteger(outcome.settled.fulfilled)).toBe(true)
    expect(Number.isInteger(outcome.settled.waiting)).toBe(true)
  })

  it('sends a new church’s first texts from the shared numbers, with no operator step', { timeout: enoughForEveryMinistry }, async () => {
    // Not skipped when absent. This route is the only caller the clock has, and a
    // suite that quietly passed without exercising it would hide the one proof that
    // the scheduler can drive Discipler at all.
    if (!secret) throw new Error('CRON_SECRET is not set, so this cannot be exercised')

    // Exponential launch, ticket 06: a church opened today has no number of its own
    // and needs none. Before, this was `no_sending_number` until an operator bought
    // it one.
    const opened = await createMinistryWithAdmin('Cron Shared Numbers')

    const { rows: goals } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [opened.id],
    )
    const service = createCommandService({
      clock,
      ids,
      store,
      appBaseUrl: baseUrl,
    })
    const typed = `5554${String(Date.now() % 1_000_000).padStart(6, '0')}`
    await service.execute({
      type: 'intake.submit',
      ministryId: opened.id,
      form: {
        fullName: 'First Person Texted',
        phone: typed,
        email: null,
        ageBand: '25-34',
        gender: 'female',
        goalId: goals[0].id as string,
        goalOther: null,
        availability: ['monday:12'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: null,
        declaredSide: null,
        experience: null,
        oneToTwo: null,
        groupId: null,
      },
    })

    const { status, body } = await tick(`Bearer ${secret}`)
    const outcome = JSON.parse(body) as {
      awaitingANumber: number
      capacity: readonly string[] | 'failed'
      errors: { ministryId: string; error: string }[]
    }

    expect(status).toBe(200)
    expect(outcome.errors.filter((one) => one.ministryId === opened.id)).toEqual([])
    expect(Number.isInteger(outcome.awaitingANumber)).toBe(true)
    // The capacity watch ran once on the pass, whatever it found.
    expect(outcome.capacity).not.toBe('failed')

    // The Welcome went to a number from the shared set, given to this pair on its
    // first text and kept. Whether Twilio then took it is the transport's business,
    // and locally it has no account to take it with.
    const { rows } = await pool.query<{ sending_number: string }>(
      `select a.sending_number
         from sending_number_assignment a
         join shared_number s on s.phone = a.sending_number
        where a.ministry_id = $1 and a.phone = $2`,
      [opened.id, `+1${typed}`],
    )
    expect(rows).toHaveLength(1)
  })
})
