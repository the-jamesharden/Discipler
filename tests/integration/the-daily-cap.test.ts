import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, minutes, weeks } from '~/domain/clock'
import { DailyCapReached, holdFrom } from '~/domain/daily-cap'
import { personId, type IdSource, type MinistryId } from '~/domain/ids'
import { createPostgresDailyCapHolds } from '~/platform/supabase/daily-cap-holds'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { createDailyCap } from '~/service/daily-cap'
import { createEmailSender } from '~/service/email-sender'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'
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
 * The daily cap against the real queue, with the real tick queuing the real check-ins
 * (Exponential launch, ticket 07). What the domain suite cannot say: a row stays
 * neither sent nor withheld through a hold, gives its number back and takes it again,
 * and the hold is one row a Pacific day on a table nothing else can reach.
 *
 * `fetch` is not stubbed here because the fixtures need it, so the vendor is a
 * `MessageTransport` throwing what the Twilio transport throws on 30023; that
 * mapping is `tests/domain/the-daily-cap.test.ts`.
 *
 * The cap is the whole set's, and the local database is shared, so these clocks sit
 * years ahead: a hold only reaches a drain whose clock is at or after it, and every
 * other suite's is earlier. The rows are removed at the end regardless.
 *
 * Monday 2031-03-03, 8pm in New York, which is 5pm Pacific and 01:00 UTC on the 4th.
 */
describe('The daily cap on the real queue', () => {
  const PACIFIC_DAY = '2031-03-03'
  const CHECK_IN_HOUR = new Date('2031-03-04T01:00:00Z')
  const MIDNIGHT_PACIFIC = new Date('2031-03-04T08:00:00Z')
  const MORNING_IN_NEW_YORK = new Date('2031-03-04T13:00:00Z')

  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let holds: ReturnType<typeof createPostgresDailyCapHolds>
  let pool: pg.Pool
  let church: MinistryFixture
  let phones: string[]

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const delivered: { from: string; to: string }[] = []
  const emails: string[] = []
  let refuseAfter = Infinity

  const transport: MessageTransport = {
    async deliver(from, to) {
      if (delivered.length >= refuseAfter) throw new DailyCapReached('30023')
      delivered.push({ from, to })
    },
  }

  const dailyCap = () =>
    createDailyCap({
      holds,
      alerts: createEmailSupportAlerts(
        createEmailSender({
          async deliver(envelope) {
            emails.push(envelope.idempotencyKey)
          },
        }),
      ),
    })

  const drainAt = (now: Date, ministryId: MinistryId = church.id) =>
    dispatchQueue({
      queue,
      transport,
      clock: createTestClock(now),
      ministryId,
      dailyCap: dailyCap(),
    })

  const tickAt = (now: Date) =>
    createCommandService({
      clock: createTestClock(now),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    }).execute({ type: 'scheduled.tick', ministryId: church.id })

  const rowsFor = async (phone: string) => {
    const { rows } = await pool.query<{
      sent_at: Date | null
      withheld_at: Date | null
      prompt_state: string | null
      reply_opened_at: Date | null
      not_before: Date | null
    }>(
      `select sent_at, withheld_at, prompt_state, reply_opened_at, not_before
         from outbound_message
        where ministry_id = $1 and to_phone = $2 and scheduled_for is not null`,
      [church.id, phone],
    )
    return rows
  }

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    holds = createPostgresDailyCapHolds(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query(`delete from daily_cap_hold where day >= '2031-01-01'`)

    church = await createMinistryWithAdmin('Riverside Chapel')
    await pool.query(
      `update ministry
          set timezone = 'America/New_York', checkin_day = 1, checkin_hour = 20
        where id = $1`,
      [church.id],
    )

    phones = []
    for (const n of [1, 2, 3]) {
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

    // What setting the pairs up queued is not what this is about.
    await drainAt(new Date(CHECK_IN_HOUR.getTime() - weeks(1)))
    delivered.length = 0
  })

  afterAll(async () => {
    await pool.query(`delete from daily_cap_hold where day >= '2031-01-01'`)
    await store.close()
    await queue.close()
    await holds.close()
    await pool.end()
  })

  it('walks one hold through from the check-in hour to the next morning', async () => {
    await tickAt(CHECK_IN_HOUR)

    // The hour's three check-ins are given their moments across it.
    const SECOND_MOMENT = new Date(CHECK_IN_HOUR.getTime() + minutes(20))
    const THIRD_MOMENT = new Date(CHECK_IN_HOUR.getTime() + minutes(40))
    const moments = await Promise.all(
      phones.map(async (phone) => (await rowsFor(phone)).map((row) => row.not_before?.getTime())),
    )
    expect(moments.flat().sort()).toEqual(
      [CHECK_IN_HOUR, SECOND_MOMENT, THIRD_MOMENT].map((moment) => moment.getTime()),
    )

    // The first goes on its moment, and only then does Twilio start refusing.
    refuseAfter = 1
    const first = await drainAt(CHECK_IN_HOUR)
    expect(first.sent).toBe(1)
    expect(first.waitingOnTheCap).toBe(0)

    const atTheCap = await drainAt(SECOND_MOMENT)
    expect(atTheCap.sent).toBe(0)
    expect(atTheCap.failed).toBe(0)
    expect(atTheCap.waitingOnTheCap).toBe(1)

    // A moment that comes during the hold joins it, without asking Twilio again.
    const during = await drainAt(THIRD_MOMENT)
    expect(during.sent).toBe(0)
    expect(during.waitingOnTheCap).toBe(2)

    const told = delivered[0]!.to
    const heldPhones = phones.filter((phone) => phone !== told)

    // The hold is on the record, and support@ was told.
    const { rows: holdRows } = await pool.query(
      `select day::text as day, reached_at, held_until, alerted_at from daily_cap_hold
        where day = $1`,
      [PACIFIC_DAY],
    )
    expect(holdRows).toEqual([
      {
        day: PACIFIC_DAY,
        reached_at: SECOND_MOMENT,
        held_until: MIDNIGHT_PACIFIC,
        alerted_at: SECOND_MOMENT,
      },
    ])
    expect(emails).toEqual([`dailyCapReached/daily-cap:${PACIFIC_DAY}`])

    // A held row is neither sent nor withheld, and holds nobody's number.
    for (const phone of heldPhones) {
      expect(await rowsFor(phone)).toEqual([
        expect.objectContaining({
          sent_at: null,
          withheld_at: null,
          prompt_state: null,
          reply_opened_at: null,
        }),
      ])
    }

    // The next hour's pass asks nobody twice and tells nobody anything.
    refuseAfter = Infinity
    const anHourLater = new Date(CHECK_IN_HOUR.getTime() + 3_600_000)
    await tickAt(anHourLater)
    expect((await drainAt(anHourLater)).waitingOnTheCap).toBe(2)
    expect(delivered).toHaveLength(1)
    expect(emails).toHaveLength(1)

    // Midnight Pacific is 3am here: the limit has reset, and it is not morning.
    const atMidnight = await drainAt(MIDNIGHT_PACIFIC)
    expect(atMidnight.sent).toBe(0)
    expect(atMidnight.waitingOnTheCap).toBe(2)

    const inTheMorning = await drainAt(MORNING_IN_NEW_YORK)
    expect(inTheMorning.sent).toBe(2)
    expect(inTheMorning.waitingOnTheCap).toBe(0)

    // Each of the three heard once, each from the number the pair was given.
    expect(delivered.map(({ to }) => to).sort()).toEqual([...phones].sort())
    for (const { from, to } of delivered) {
      const { rows } = await pool.query<{ sending_number: string }>(
        `select sending_number from sending_number_assignment
          where ministry_id = $1 and phone = $2`,
        [church.id, to],
      )
      expect(rows).toEqual([{ sending_number: from }])
    }

    // A conversation opens when it is really sent, so its timeout runs from there.
    for (const phone of heldPhones) {
      expect(await rowsFor(phone)).toEqual([
        expect.objectContaining({
          sent_at: MORNING_IN_NEW_YORK,
          withheld_at: null,
          prompt_state: 'open',
          reply_opened_at: MORNING_IN_NEW_YORK,
        }),
      ])
    }

    // And nothing is left to go again.
    const after = await drainAt(new Date(MORNING_IN_NEW_YORK.getTime() + 3_600_000))
    expect(after.sent).toBe(0)
    expect(delivered).toHaveLength(3)
  })

  it('stops another church on the same hold, and waits for that church’s own morning', async () => {
    const other = await createMinistryWithAdmin('Northgate Fellowship')
    await pool.query(`update ministry set timezone = 'America/Los_Angeles' where id = $1`, [
      other.id,
    ])
    await store.transact(other.id, (sink) =>
      sink.enqueueMessages([
        {
          ministryId: other.id,
          personId: null,
          toPhone: aTestPhoneNumber(),
          body: 'Northgate Fellowship via Discipler: hello.',
          enqueuedAt: new Date(CHECK_IN_HOUR.getTime() + minutes(41)),
          scheduledFor: null,
          notBefore: null,
          disclosesPersonId: null,
          kind: 'no_reply',
          carriesRatesLine: false,
        },
      ]),
    )

    const during = await drainAt(new Date(CHECK_IN_HOUR.getTime() + minutes(42)), other.id)
    expect(during.sent).toBe(0)
    expect(during.waitingOnTheCap).toBe(1)

    // 5am in Los Angeles is past midnight Pacific and still not morning there, though
    // it is 8am in New York.
    expect((await drainAt(MORNING_IN_NEW_YORK, other.id)).waitingOnTheCap).toBe(1)

    const morning = await drainAt(new Date('2031-03-04T16:00:00Z'), other.id)
    expect(morning.sent).toBe(1)
    expect(morning.waitingOnTheCap).toBe(0)
  })

  it('keeps the first reach of a Pacific day, and the first time support@ was told', async () => {
    const first = new Date('2031-06-02T19:00:00Z')
    const later = new Date('2031-06-02T20:00:00Z')

    expect((await holds.latest(new Date('2031-06-02T18:59:59Z')))?.day).not.toBe('2031-06-02')

    await holds.record(holdFrom(first))
    await holds.record(holdFrom(later))
    await holds.recordAlerted('2031-06-02', first)
    await holds.recordAlerted('2031-06-02', later)

    const kept = await holds.latest(later)
    expect(kept).toEqual({
      day: '2031-06-02',
      reachedAt: first,
      heldUntil: new Date('2031-06-03T07:00:00Z'),
      alertedAt: first,
    })
  })

  it('is out of a session’s reach, like every table that belongs to no church', async () => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await expect(client.query('select 1 from daily_cap_hold')).rejects.toThrow(/permission denied/)
    } finally {
      await client.query('rollback')
      client.release()
    }
  })
})
