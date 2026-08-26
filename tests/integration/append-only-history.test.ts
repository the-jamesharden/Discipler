import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import type { HistoryEvent } from '~/domain/history'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'

/**
 * History is append-only: new facts never overwrite old ones. The Week-by-Week
 * History cannot be reconstructed after the fact, so this is enforced in the
 * database -- by triggers, which a privileged connection cannot talk its way past
 * the way it can bypass a policy.
 */

describe('the history record', () => {
  const connectionString = () => localSupabase().databaseUrl
  let ministry: MinistryFixture
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    // A superuser connection: the most privileged caller there is.
    pool = new pg.Pool({ connectionString: connectionString() })
  })

  afterAll(async () => {
    await pool.end()
  })

  const appendWeek = async (
    type: string,
    payload: Record<string, unknown>,
  ): Promise<readonly HistoryEvent[]> => {
    const store = createPostgresEffectStore(connectionString())
    try {
      return await store.transact(ministry.id, (sink) =>
        sink.appendHistory([
          {
            ministryId: ministry.id,
            occurredAt: clock.now(),
            type,
            subjectType: 'ministry',
            subjectId: ministry.id,
            payload,
          },
        ]),
      )
    } finally {
      await store.close()
    }
  }

  it('refuses to let an old fact be rewritten', async () => {
    const [event] = await appendWeek('week.reported', { met: false })

    await expect(
      pool.query(`update ministry_event set payload = $1 where id = $2`, [
        JSON.stringify({ met: true }),
        event!.id,
      ]),
    ).rejects.toThrow(/append-only/)

    const { rows } = await pool.query(`select payload from ministry_event where id = $1`, [
      event!.id,
    ])
    expect(rows[0].payload).toEqual({ met: false })
  })

  it('refuses to let a fact be deleted', async () => {
    const [event] = await appendWeek('week.reported', { met: true })

    await expect(
      pool.query(`delete from ministry_event where id = $1`, [event!.id]),
    ).rejects.toThrow(/append-only/)

    const { rows } = await pool.query(`select count(*)::int as n from ministry_event where id = $1`, [
      event!.id,
    ])
    expect(rows[0].n).toBe(1)
  })

  it('will not let a whole Ministry\'s history be wiped in one statement', async () => {
    await appendWeek('week.reported', { met: true })

    await expect(
      pool.query(`delete from ministry_event where ministry_id = $1`, [ministry.id]),
    ).rejects.toThrow(/append-only/)
  })

  it('keeps a later fact beside the earlier one rather than in place of it', async () => {
    const before = await pool.query(
      `select count(*)::int as n from ministry_event where ministry_id = $1`,
      [ministry.id],
    )

    clock.advanceBy(weeks(1))
    await appendWeek('week.reported', { met: false })

    const { rows } = await pool.query(
      `select occurred_at, payload from ministry_event
        where ministry_id = $1 order by occurred_at asc`,
      [ministry.id],
    )

    expect(rows).toHaveLength(before.rows[0].n + 1)
    expect(new Set(rows.map((r) => r.occurred_at.toISOString()))).toContain(
      '2026-03-09T09:00:00.000Z',
    )
  })

  it('separates when something happened from when it was written down', async () => {
    clock.advanceBy(weeks(2))
    const [event] = await appendWeek('week.reported', { met: true })

    // occurred_at comes from the injected clock; recorded_at from the database.
    // A late reply attaches to the week it answers without that week's own
    // timestamp being rewritten.
    expect(event!.occurredAt).toEqual(clock.now())
    expect(event!.recordedAt.getTime()).not.toBe(event!.occurredAt.getTime())
  })
})
