import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { baseUrl, cronSecret, skipUnlessAppIsRunning } from '../support/app'
import {
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

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

  /**
   * A generous timeout, and the reason is the route's shape rather than the test's:
   * it ticks and drains every Ministry in turn, so one run costs the sum of them.
   * That is right for a pilot and it is why a local database, which accumulates a
   * Ministry per fixture per run and is only emptied by `npm run db:reset`, makes
   * this the slowest thing in the suite. Ministries are handled sequentially on
   * purpose -- each is its own transaction and one Ministry's failure must not take
   * another's week with it -- and nothing here is waiting on that changing.
   */
  const enoughForEveryMinistry = 120_000

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
      errors: { ministryId: string; error: string }[]
    }

    // Every Ministry, not the caller's: the scheduler has no session and no
    // Ministry of its own, and a tick that ran for one of them would leave every
    // other congregation's week unasked.
    expect(outcome.ministries).toBeGreaterThan(0)
    expect(Number.isInteger(outcome.sent)).toBe(true)
  })

  it('reports a Ministry with no number as unprovisioned rather than failing the run', { timeout: enoughForEveryMinistry }, async () => {
    // Not skipped when absent. This route is the only caller the clock has, and a
    // suite that quietly passed without exercising it would hide the one proof that
    // the scheduler can drive Discipler at all.
    if (!secret) throw new Error('CRON_SECRET is not set, so this cannot be exercised')

    const unprovisioned = await createMinistryWithAdmin('Cron Unprovisioned')
    await pool.query(`update ministry set sending_number = null where id = $1`, [
      unprovisioned.id,
    ])

    const { rows: goals } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [unprovisioned.id],
    )
    const service = createCommandService({
      clock,
      ids,
      store,
      appBaseUrl: baseUrl,
    })
    await service.execute({
      type: 'intake.submit',
      ministryId: unprovisioned.id,
      form: {
        fullName: 'Unprovisioned Person',
        phone: `5554${String(Date.now() % 1_000_000).padStart(6, '0')}`,
        email: null,
        ageBand: '25-34',
        gender: 'female',
        goalId: goals[0].id as string,
        availability: ['monday:midday'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: null,
        declaredSide: null,
        experience: null,
      },
    })

    const { status, body } = await tick(`Bearer ${secret}`)
    const outcome = JSON.parse(body) as {
      errors: { ministryId: string; error: string }[]
    }

    // 200 even so. The scheduler retries a non-2xx, and retrying the whole run to
    // recover one Ministry would re-drain every other one.
    expect(status).toBe(200)
    expect(outcome.errors).toContainEqual({
      ministryId: unprovisioned.id,
      error: 'no_sending_number',
    })

    // And it is still owed: nothing was written off on the way past.
    const { rows } = await pool.query(
      `select sent_at, withheld_at from outbound_message where ministry_id = $1`,
      [unprovisioned.id],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.sent_at).toBeNull()
      expect(row.withheld_at).toBeNull()
    }
  })
})
