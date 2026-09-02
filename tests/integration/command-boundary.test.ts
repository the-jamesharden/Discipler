import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { applyEffects } from '~/service/command-service'
import { appendHistory, enqueueMessage } from '~/domain/effects'
import { withoutTheSweep } from '../support/effects'
import { createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'

describe('driving the command boundary against a real Ministry', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))

  // What the command boundary added. A Ministry's history begins with its own
  // opening, written by provisioning before any command runs, and that one is
  // not the boundary's to be counted against.
  const countRows = async (table: 'ministry_event' | 'outbound_message') => {
    const { rows } = await pool.query(
      `select count(*)::int as n from ${table} where ministry_id = $1
        ${table === 'ministry_event' ? "and type <> 'ministry.opened'" : ''}`,
      [ministry.id],
    )
    return rows[0].n as number
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  it('a scheduled tick against a Ministry with nothing happening changes nothing', async () => {
    const service = createCommandService({ clock, ids: createSequentialIds(), store,   appBaseUrl: 'https://discipler.test', })

    const outcome = await service.execute({ type: 'scheduled.tick', ministryId: ministry.id })

    // The sweep is what every tick does regardless of what it finds, and against
    // a Ministry with no conversation open it closes nothing. Nothing else happens.
    expect(withoutTheSweep(outcome.effects)).toEqual([])
    expect(await countRows('ministry_event')).toBe(0)
    expect(await countRows('outbound_message')).toBe(0)
  })

  it('lands a command\'s effects together', async () => {
    await store.transact(ministry.id, (sink) =>
      applyEffects(
        [
          appendHistory({
            ministryId: ministry.id,
            occurredAt: clock.now(),
            type: 'leader.accepted',
            subjectType: 'ministry',
            subjectId: ministry.id,
            payload: {},
          }),
          enqueueMessage({
            ministryId: ministry.id,
            personId: null,
            toPhone: '+15550100',
            body: 'Riverside Chapel: you have been paired.',
            enqueuedAt: clock.now(),
            scheduledFor: null,
            disclosesPersonId: null,
            kind: 'no_reply',
          }),
        ],
        sink,
      ),
    )

    expect(await countRows('ministry_event')).toBe(1)
    expect(await countRows('outbound_message')).toBe(1)
  })

  it('or not at all -- a failed send leaves no history claiming it happened', async () => {
    const historyBefore = await countRows('ministry_event')
    const outboundBefore = await countRows('outbound_message')

    await expect(
      store.transact(ministry.id, (sink) =>
        applyEffects(
          [
            appendHistory({
              ministryId: ministry.id,
              occurredAt: clock.now(),
              type: 'starter.released',
              subjectType: 'ministry',
              subjectId: ministry.id,
              payload: {},
            }),
            // An empty body is rejected by a check constraint, standing in for any
            // reason the outbound queue might refuse a message.
            enqueueMessage({
              ministryId: ministry.id,
              personId: null,
              toPhone: '+15550100',
              body: '   ',
              enqueuedAt: clock.now(),
              scheduledFor: null,
              disclosesPersonId: null,
              kind: 'no_reply',
            }),
          ],
          sink,
        ),
      ),
    ).rejects.toThrow()

    expect(await countRows('ministry_event')).toBe(historyBefore)
    expect(await countRows('outbound_message')).toBe(outboundBefore)
  })
})
