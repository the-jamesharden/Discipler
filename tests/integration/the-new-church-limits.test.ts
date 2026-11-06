import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { NewChurchRosterLimitReached } from '~/domain/errors'
import type { IdSource } from '~/domain/ids'
import { NEW_CHURCH_LIMITS } from '~/domain/launch-terms'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresNewChurchLimits } from '~/platform/supabase/new-church-limits'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { watchNewChurchLimits } from '~/service/new-church-limits-watch'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport, NewChurchLimitHit } from '~/service/ports'
import { noDailyCap } from '../support/daily-cap'
import { aTestPhoneNumber, createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'
import { file, phoneNumbers } from '../support/roster'

/**
 * The limits on a new church's first weeks (Exponential launch, ticket 37), against the
 * real tables through the real import command and the real queue. Twilio and the email are
 * the fakes, at their ports. A church here is opened by the fixture at this moment, so a
 * clock of now is its first day, and a clock past `firstDays` is the same church grown up.
 *
 * The Roster and the week are filled by hand, because a test that really imported 300
 * people and really sent 1,500 texts would say nothing more and take minutes.
 */
describe('The limits on a new church', { timeout: 60_000 }, () => {
  const { peopleOnTheRoster: CAP, textsPerWeek: TEXT_CAP, firstDays } = NEW_CHURCH_LIMITS
  const AFTER_ITS_FIRST_WEEKS = () => new Date(Date.now() + days(firstDays + 1))

  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let limits: ReturnType<typeof createPostgresNewChurchLimits>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const number = phoneNumbers()

  beforeAll(() => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    limits = createPostgresNewChurchLimits(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await Promise.all([store.close(), queue.close(), limits.close(), pool.end()])
  })

  const importing = (church: MinistryFixture, rows: readonly string[], now = new Date()) =>
    createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' }).execute({
      type: 'person.import',
      ministryId: church.id,
      mode: 'people_only',
      text: file('Name,Phone', ...rows),
    })

  /** `count` people with numbers nothing in the suite will ever ask about. */
  const fillTheRoster = async (church: MinistryFixture, count: number) => {
    await pool.query(
      `insert into person (ministry_id, full_name)
       select $1, 'Filler ' || n from generate_series(1, $2::int) as n`,
      [church.id, count],
    )
  }

  const peopleIn = async (church: MinistryFixture): Promise<number> => {
    const { rows } = await pool.query<{ count: string }>(`select count(*) from person where ministry_id = $1`, [church.id])
    return Number(rows[0]?.count)
  }

  /** The Admin is one person on the Roster the moment a church opens. */
  const fillTo = async (church: MinistryFixture, people: number) => fillTheRoster(church, people - (await peopleIn(church)))

  const newRows = (count: number): readonly string[] =>
    Array.from({ length: count }, (_, index) => `Person ${index},${number()}`)

  describe('an import', () => {
    it('is refused whole when it would go past the limit, with nobody added', async () => {
      const church = await createMinistryWithAdmin('Over By One')
      await fillTo(church, CAP - 1)

      await expect(importing(church, newRows(2))).rejects.toBeInstanceOf(NewChurchRosterLimitReached)

      expect(await peopleIn(church)).toBe(CAP - 1)
    })

    it('goes through when it lands exactly on the limit', async () => {
      const church = await createMinistryWithAdmin('Exactly On It')
      await fillTo(church, CAP - 2)

      await importing(church, newRows(2))

      expect(await peopleIn(church)).toBe(CAP)
    })

    it('counts only the rows that would add somebody', async () => {
      const church = await createMinistryWithAdmin('Same People Twice')
      const rows = newRows(2)
      await importing(church, rows)
      await fillTo(church, CAP)

      // Everybody on it already, at the limit: nothing to refuse.
      await expect(importing(church, rows)).resolves.toBeDefined()
    })

    it('leaves out somebody removed from the Roster', async () => {
      const church = await createMinistryWithAdmin('Room After A Removal')
      await fillTo(church, CAP)
      const { rows } = await pool.query<{ id: string }>(
        `select id from person where ministry_id = $1 and full_name like 'Filler%' limit 1`,
        [church.id],
      )
      await pool.query(
        `insert into person_removal (ministry_id, person_id, removed_at) values ($1, $2, now())`,
        [church.id, rows[0]?.id],
      )

      await importing(church, newRows(1))

      expect(await peopleIn(church)).toBe(CAP + 1)
    })

    it('is held to nothing once its first weeks are over', async () => {
      const church = await createMinistryWithAdmin('Grown Up')
      await fillTo(church, CAP)

      await importing(church, newRows(2), AFTER_ITS_FIRST_WEEKS())

      expect(await peopleIn(church)).toBe(CAP + 2)
    })

    it('is held to nothing once the limits are lifted', async () => {
      const church = await createMinistryWithAdmin('Lifted')
      await fillTo(church, CAP)

      expect(await limits.lift(church.id, new Date())).toBe(true)
      await importing(church, newRows(2))

      expect(await peopleIn(church)).toBe(CAP + 2)
    })
  })

  describe('a lift', () => {
    it('is in the church’s history once, however many times it is asked for', async () => {
      const church = await createMinistryWithAdmin('Lifted Twice')

      expect(await limits.lift(church.id, new Date())).toBe(true)
      expect(await limits.lift(church.id, new Date())).toBe(true)

      const { rows } = await pool.query(
        `select 1 from ministry_event where ministry_id = $1 and type = 'ministry.new_church_limits_lifted'`,
        [church.id],
      )
      expect(rows).toHaveLength(1)
    })

    it('answers false for a church that does not exist', async () => {
      expect(await limits.lift(crypto.randomUUID() as MinistryFixture['id'], new Date())).toBe(false)
    })
  })

  describe('the texts', () => {
    /** Texts already out, `ago` before now. */
    const sendAlready = async (church: MinistryFixture, count: number, at = new Date()) => {
      await pool.query(
        `insert into outbound_message (ministry_id, to_phone, body, message_kind, carries_rates_line, enqueued_at, sent_at)
         select $1, $2, 'Already out', 'no_reply', false, $3, $3 from generate_series(1, $4::int)`,
        [church.id, aTestPhoneNumber(), at, count],
      )
    }

    const queueTexts = async (church: MinistryFixture, count: number) => {
      const { rows } = await pool.query<{ id: string }>(
        `insert into outbound_message (ministry_id, to_phone, body, message_kind, carries_rates_line, enqueued_at)
         select $1, $2 || n, 'Waiting', 'no_reply', false, now() - interval '1 minute' from generate_series(10, $3::int + 9) as n
         returning id`,
        [church.id, aTestPhoneNumber().slice(0, -2), count],
      )
      return rows.map((row) => row.id)
    }

    const drain = async (church: MinistryFixture, now = new Date()) => {
      const delivered: string[] = []
      const transport: MessageTransport = {
        async deliver(_from, to) {
          delivered.push(to)
        },
      }
      const outcome = await dispatchQueue({
        queue,
        transport,
        clock: createTestClock(now),
        ministryId: church.id,
        dailyCap: noDailyCap,
      })
      return { outcome, delivered }
    }

    it('go until the week is full and the rest wait on the queue, unsent and unclosed', async () => {
      const church = await createMinistryWithAdmin('A Burst')
      await sendAlready(church, TEXT_CAP - 2)
      const queued = await queueTexts(church, 5)

      const { outcome, delivered } = await drain(church)

      expect(delivered).toHaveLength(2)
      expect(outcome).toMatchObject({ sent: 2, waitingOnTheNewChurchLimit: 3, withheld: 0, failed: 0 })

      const { rows } = await pool.query(
        `select 1 from outbound_message where id = any ($1) and sent_at is null and withheld_at is null`,
        [queued],
      )
      expect(rows).toHaveLength(3)
    })

    it('go again as the week makes room', async () => {
      const church = await createMinistryWithAdmin('A Week Later')
      await sendAlready(church, TEXT_CAP, new Date(Date.now() - days(8)))
      await queueTexts(church, 2)

      const { outcome } = await drain(church)

      expect(outcome).toMatchObject({ sent: 2, waitingOnTheNewChurchLimit: 0 })
    })

    it('all go once the church’s first weeks are over', async () => {
      const church = await createMinistryWithAdmin('Past The First Weeks')
      await queueTexts(church, 2)
      const later = AFTER_ITS_FIRST_WEEKS()
      await sendAlready(church, TEXT_CAP, new Date(later.getTime() - 1000))

      const { outcome } = await drain(church, later)

      expect(outcome).toMatchObject({ sent: 2, waitingOnTheNewChurchLimit: 0 })
    })

    it('all go once the limits are lifted', async () => {
      const church = await createMinistryWithAdmin('Lifted, Texting')
      await sendAlready(church, TEXT_CAP)
      await queueTexts(church, 2)
      await limits.lift(church.id, new Date())

      const { outcome } = await drain(church)

      expect(outcome).toMatchObject({ sent: 2, waitingOnTheNewChurchLimit: 0 })
    })
  })

  describe('support@', () => {
    const watch = (now = new Date()) => {
      const told: NewChurchLimitHit[] = []
      const failing = { yes: false }
      return {
        told,
        failing,
        run: () =>
          watchNewChurchLimits({
            limits,
            clock: createTestClock(now),
            alerts: {
              async newChurchLimitHit(hit) {
                if (failing.yes) throw new Error('Resend is down')
                told.push(hit)
              },
            },
          }),
      }
    }

    /** What this church was told; other churches in other suites' runs are not this test's. */
    const toldAbout = (told: readonly NewChurchLimitHit[], church: MinistryFixture) =>
      told.filter((hit) => hit.church === church.id).map((hit) => hit.limit).sort()

    it('is told once when a church reaches a limit, and not for one short of it', async () => {
      const at = await createMinistryWithAdmin('At The Roster Limit')
      const short = await createMinistryWithAdmin('One Short')
      await fillTo(at, CAP)
      await fillTo(short, CAP - 1)

      const first = watch()
      await first.run()
      expect(toldAbout(first.told, at)).toEqual(['roster'])
      expect(toldAbout(first.told, short)).toEqual([])

      const second = watch()
      await second.run()
      expect(toldAbout(second.told, at)).toEqual([])
    })

    it('is told when a week of texts reaches the limit, and the name is the church’s', async () => {
      const church = await createMinistryWithAdmin('At The Text Limit')
      await pool.query(
        `insert into outbound_message (ministry_id, to_phone, body, message_kind, carries_rates_line, enqueued_at, sent_at)
         select $1, $2, 'Out', 'no_reply', false, now(), now() from generate_series(1, $3::int)`,
        [church.id, aTestPhoneNumber(), TEXT_CAP],
      )

      const { told, run } = watch()
      await run()

      expect(told.filter((hit) => hit.church === church.id)).toEqual([
        { church: church.id, churchName: 'At The Text Limit', limit: 'texts' },
      ])
    })

    it('hears of a refused import, which leaves the Roster short of the limit', async () => {
      const church = await createMinistryWithAdmin('Refused Import')

      await limits.recordHit(church.id, 'roster', new Date())

      const { told, run } = watch()
      await run()
      expect(toldAbout(told, church)).toEqual(['roster'])
    })

    it('is told on the next pass when the email did not go', async () => {
      const church = await createMinistryWithAdmin('Resend Was Down')
      await fillTo(church, CAP)
      const failed = watch()
      failed.failing.yes = true
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const outcome = await failed.run()
      expect(outcome.failed).toBeGreaterThan(0)
      spy.mockRestore()

      const again = watch()
      await again.run()
      expect(toldAbout(again.told, church)).toEqual(['roster'])
    })

    it('does not look at a church past its first weeks, or one lifted', async () => {
      const grown = await createMinistryWithAdmin('Grown, At The Limit')
      const lifted = await createMinistryWithAdmin('Lifted, At The Limit')
      await fillTo(grown, CAP)
      await fillTo(lifted, CAP)
      await limits.lift(lifted.id, new Date())

      const later = await limits.standings(AFTER_ITS_FIRST_WEEKS())
      expect(later.map((one) => one.church)).not.toContain(grown.id)

      const now = await limits.standings(new Date())
      expect(now.map((one) => one.church)).toContain(grown.id)
      expect(now.map((one) => one.church)).not.toContain(lifted.id)
    })
  })
})
