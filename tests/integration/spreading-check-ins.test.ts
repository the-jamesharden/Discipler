import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestClock, minutes, weeks } from '~/domain/clock'
import { personId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import { noDailyCap } from '../support/daily-cap'
import {
  addPerson,
  aTestPhoneNumber,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Check-ins spread across their hour (Exponential launch, ticket 07), which is **off
 * in the product** while `/cron/tick` runs hourly. It stays off until "Open: spreading
 * check-ins needs more than a faster send pass" in `docs/open-questions.md` is settled.
 * This suite runs the real tick and the real queue as if the send pass ran every five
 * minutes, so it says the spacing works and not that spreading is safe to switch on.
 */
vi.mock('~/domain/daily-cap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/domain/daily-cap')>()
  return {
    ...actual,
    SEND_PASS_EVERY_MINUTES: 5,
    checkInNotBefore: (slot: Parameters<typeof actual.checkInNotBefore>[0]) =>
      actual.checkInNotBefore({ ...slot, passEveryMinutes: 5 }),
  }
})

describe('Spreading check-ins, as a more frequent pass would', () => {
  // Monday 2026-03-02, 8pm in New York.
  const CHECK_IN_HOUR = new Date('2026-03-03T01:00:00Z')

  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let pool: pg.Pool
  let church: MinistryFixture
  const phones: string[] = []
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const delivered: string[] = []

  const transport: MessageTransport = {
    async deliver(_from, to) {
      delivered.push(to)
    },
  }

  const passAt = (now: Date) =>
    dispatchQueue({
      queue,
      transport,
      clock: createTestClock(now),
      ministryId: church.id,
      dailyCap: noDailyCap,
    })

  const after = (elapsed: number) => new Date(CHECK_IN_HOUR.getTime() + elapsed)

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    church = await createMinistryWithAdmin('Riverside Chapel')
    await pool.query(
      `update ministry
          set timezone = 'America/New_York', checkin_day = 1, checkin_hour = 20
        where id = $1`,
      [church.id],
    )

    for (const n of [1, 2, 3, 4]) {
      const phone = aTestPhoneNumber()
      phones.push(phone)
      const leader = personId(await addPerson(church, `Leader ${n}`, { phone }))
      const participant = personId(
        await addPerson(church, `Participant ${n}`, { phone: aTestPhoneNumber() }),
      )
      await completeIntake(church, leader)
      await completeIntake(church, participant)
      await pairOneToOne(church, leader, participant, {
        joinedAt: new Date(CHECK_IN_HOUR.getTime() - weeks(1)),
      })
    }

    await passAt(new Date(CHECK_IN_HOUR.getTime() - weeks(1)))
    delivered.length = 0
  })

  afterAll(async () => {
    await store.close()
    await queue.close()
    await pool.end()
  })

  it('sends the hour’s check-ins spread across it, each on the first pass after its moment', async () => {
    await createCommandService({
      clock: createTestClock(CHECK_IN_HOUR),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    }).execute({ type: 'scheduled.tick', ministryId: church.id })

    const { rows } = await pool.query<{ not_before: Date }>(
      `select not_before from outbound_message
        where ministry_id = $1 and scheduled_for is not null
        order by not_before`,
      [church.id],
    )
    expect(rows.map((row) => row.not_before)).toEqual([
      after(0),
      after(minutes(15)),
      after(minutes(30)),
      after(minutes(45)),
    ])

    // The tick's own drain sends the first at once. A drain in between, which is what
    // a reply causes, is held to the same moments as a pass.
    expect((await passAt(after(0))).sent).toBe(1)
    expect((await passAt(after(minutes(14)))).sent).toBe(0)
    expect((await passAt(after(minutes(15)))).sent).toBe(1)
    expect((await passAt(after(minutes(40)))).sent).toBe(1)
    expect((await passAt(after(minutes(45)))).sent).toBe(1)
    expect((await passAt(after(minutes(50)))).sent).toBe(0)

    expect([...delivered].sort()).toEqual([...phones].sort())
  })
})
