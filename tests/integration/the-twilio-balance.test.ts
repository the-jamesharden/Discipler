import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { EmailEnvelope } from '~/domain/email'
import { createPostgresTwilioBalanceFalls } from '~/platform/supabase/twilio-balance-falls'
import { createEmailSender } from '~/service/email-sender'
import type { TwilioBalanceReader } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'
import { watchTwilioBalance } from '~/service/twilio-balance-watch'
import { localSupabase } from '../support/local-supabase'

/**
 * The balance watch on the real table (Exponential launch, ticket 08), with Twilio
 * stubbed at the reader and Resend at the transport. The memory of "already told"
 * is the thing a stateless tick cannot hold for itself, so it is what is proved here.
 *
 * The table belongs to no church and nothing else in the suite writes to it: the
 * over-HTTP tick has no Twilio account to read, so its read fails before touching it.
 */
describe('the Twilio balance watch, on the real table', () => {
  const falls = createPostgresTwilioBalanceFalls(localSupabase().databaseUrl)
  let pool: pg.Pool

  const delivered: EmailEnvelope[] = []
  const alerts = createEmailSupportAlerts(
    createEmailSender({
      async deliver(envelope) {
        delivered.push(envelope)
      },
    }),
  )
  const clock = createTestClock(new Date('2026-11-09T15:00:00Z'))

  let cents = 7000
  const balance: TwilioBalanceReader = { readCents: async () => cents }
  const tick = () => watchTwilioBalance({ balance, falls, alerts, clock })

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await falls.close()
    await pool.end()
  })

  beforeEach(async () => {
    // A run before this one may have left a fall open; history is kept, so it is closed.
    await falls.recordRecovery(clock.now(), 100000)
    delivered.length = 0
  })

  it('sends one email at $70 and no more on the next ticks', async () => {
    cents = 7000

    expect(await tick()).toBe('told')
    expect(await tick()).toBe('still_low')
    expect(await tick()).toBe('still_low')

    expect(delivered).toHaveLength(1)
    expect(delivered[0]?.kind).toBe('twilioBalanceLow')
  })

  it('tells support@ again after a recovery and a second fall, under a new key', async () => {
    cents = 7000
    await tick()

    cents = 50000
    expect(await tick()).toBe('recovered')
    expect(await tick()).toBe('fine')

    cents = 7000
    expect(await tick()).toBe('told')

    expect(delivered).toHaveLength(2)
    expect(delivered[1]?.idempotencyKey).not.toBe(delivered[0]?.idempotencyKey)
  })

  it('keeps each fall, with what it fell to and what it recovered to', async () => {
    cents = 6123
    await tick()
    cents = 50000
    await tick()

    const { rows } = await pool.query<{
      balance_cents: number
      told_at: Date | null
      recovered_balance_cents: number | null
    }>(
      `select balance_cents, told_at, recovered_balance_cents
         from twilio_balance_fall
        where balance_cents = 6123
        order by fell_at desc, id
        limit 1`,
    )
    expect(rows[0]).toMatchObject({ balance_cents: 6123, recovered_balance_cents: 50000 })
    expect(rows[0]?.told_at).toBeInstanceOf(Date)
  })

  it('holds one open fall however many passes race to record it', async () => {
    const at = clock.now()
    const recorded = await Promise.all([
      falls.recordFall(at, 7000),
      falls.recordFall(at, 6900),
      falls.recordFall(at, 6800),
    ])

    expect(new Set(recorded.map((fall) => fall.id)).size).toBe(1)
    const { rows } = await pool.query<{ open: number }>(
      `select count(*)::int as open from twilio_balance_fall where recovered_at is null`,
    )
    expect(rows[0]?.open).toBe(1)
  })
})
