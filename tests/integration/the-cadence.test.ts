import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The cadence against the real database: the constraint that refuses a 6:30am
 * prompt however it is written, the dispatcher query that resolves a cadence
 * through the override columns nothing has filled in, and an edit mid-week that
 * leaves the row already sent exactly where it was.
 */

describe('the check-in cadence', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const mondayEightPm = new Date('2026-08-24T19:00:00Z')
  let clock = createTestClock(mondayEightPm)
  const ids: IdSource = { next: () => crypto.randomUUID() }

  const tickAt = (at: Date) => {
    clock = createTestClock(at)
    return createCommandService({
      clock,
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    }).execute({ type: 'scheduled.tick', ministryId: ministry.id })
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('ABC Church')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    // London on British Summer Time, asking on Monday evenings.
    await pool.query(
      `update ministry
          set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20
        where id = $1`,
      [ministry.id],
    )
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const congregant = async (fullName: string) => {
    const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
    await completeIntake(ministry, id)
    return id
  }

  /** Every message queued for this Person, with the cadence that produced it. */
  const inbox = async (person: PersonId) => {
    const { rows } = await pool.query<{
      body: string
      enqueued_at: Date
      scheduled_for: Date | null
    }>(
      `select body, enqueued_at, scheduled_for from outbound_message
        where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows
  }

  describe('the quiet-hours clamp', () => {
    // Written by SQL, not through the form. Pilot settings will be written this
    // way, so a form-only rule would not be a rule at all.
    const setHour = (hour: number) =>
      pool.query(`update ministry set checkin_hour = $1 where id = $2`, [hour, ministry.id])

    it('refuses an hour before 8am', async () => {
      await expect(setHour(6)).rejects.toThrow(
        /ministry_checkin_hour_is_within_quiet_hours/,
      )
    })

    it('refuses an hour after 9pm', async () => {
      await expect(setHour(22)).rejects.toThrow(
        /ministry_checkin_hour_is_within_quiet_hours/,
      )
    })

    it('accepts the edges of the window', async () => {
      await expect(setHour(8)).resolves.toBeDefined()
      await expect(setHour(21)).resolves.toBeDefined()
      // Back to the cadence the rest of this suite runs on.
      await setHour(20)
    })

    it('refuses a day that is not a day of the week', async () => {
      await expect(
        pool.query(`update ministry set checkin_day = 7 where id = $1`, [ministry.id]),
      ).rejects.toThrow(/ministry_checkin_day_is_a_day_of_the_week/)
    })

    // The same clamp on the override columns. An override is a cadence, and one
    // set at 6:30am here would be exactly the compliance problem the Ministry
    // level constraint exists to refuse.
    it('holds on a per-relationship override too', async () => {
      const leader = await congregant('Constraint Leader')
      const participant = await congregant('Constraint Participant')
      const relationship = await pairOneToOne(ministry, leader, participant)

      await expect(
        pool.query(`update relationship set checkin_hour = 6 where id = $1`, [
          relationship,
        ]),
      ).rejects.toThrow(/relationship_checkin_hour_is_within_quiet_hours/)
    })

    it('refuses a timezone the platform does not know', async () => {
      await expect(
        pool.query(`update ministry set timezone = 'Mars/Olympus' where id = $1`, [
          ministry.id,
        ]),
      ).rejects.toThrow(/not a known timezone/)
    })

    /**
     * The database and the dispatcher have to agree on what a timezone *is*.
     *
     * `now() at time zone 'CEST'` is perfectly legal Postgres -- abbreviations
     * and POSIX specs like `GMT+5` both resolve -- and both are rejected outright
     * by the zone database the dispatcher reads them with. A Ministry saved as
     * `CEST` by SQL would satisfy a laxer check here and then throw on every
     * tick, for everybody in it.
     */
    it('refuses an abbreviation Postgres would accept but the dispatcher cannot', async () => {
      for (const abbreviation of ['CEST', 'GMT+5']) {
        // Postgres itself is happy to resolve it, which is the trap.
        await expect(
          pool.query(`select now() at time zone $1`, [abbreviation]),
        ).resolves.toBeDefined()
        // The dispatcher is not.
        expect(() => new Intl.DateTimeFormat('en-US', { timeZone: abbreviation })).toThrow()
        // So the Ministry may not be saved with it.
        await expect(
          pool.query(`update ministry set timezone = $1 where id = $2`, [
            abbreviation,
            ministry.id,
          ]),
        ).rejects.toThrow(/not a known timezone/)
      }
    })
  })

  describe('the dispatcher', () => {
    it('reads the override columns, which are null on every row', async () => {
      const { rows } = await pool.query<{ overridden: string }>(
        `select count(*) as overridden from relationship
          where checkin_day is not null or checkin_hour is not null`,
      )
      expect(rows[0]!.overridden).toBe('0')

      // And the query still resolves a cadence, through the coalesce.
      const leader = await congregant('Grace Adeyemi')
      const participant = await congregant('Tom Fletcher')
      await pairOneToOne(ministry, leader, participant)

      const snapshot = await store.transact(ministry.id, (unit) =>
        unit.checkInFor(leader),
      )
      expect(snapshot?.timeZone).toBe('Europe/London')
      expect(snapshot?.leads[0]?.cadence).toEqual({ day: 1, hour: 20 })
    })

    it('asks nobody before the hour, and one Leader once it arrives', async () => {
      const leader = await congregant('Ruth Nakamura')
      const participant = await congregant('Sam Doyle')
      await pairOneToOne(ministry, leader, participant)

      // Monday lunchtime: the cadence has not come round.
      await tickAt(new Date('2026-08-24T12:00:00Z'))
      expect(await inbox(leader)).toHaveLength(0)

      await tickAt(mondayEightPm)
      const sent = await inbox(leader)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.body).toContain('Did you meet with Sam Doyle this week?')
      // The cadence, stamped at enqueue time.
      expect(sent[0]!.scheduled_for).toEqual(mondayEightPm)

      // However often the tick runs, one ISO week is one conversation.
      await tickAt(new Date('2026-08-25T09:00:00Z'))
      await tickAt(new Date('2026-08-27T20:00:00Z'))
      expect(await inbox(leader)).toHaveLength(1)
    })
  })

  describe('an edit mid-week', () => {
    it('neither cancels nor reschedules the row already enqueued', async () => {
      const leader = await congregant('Chidi Okonkwo')
      const participant = await congregant('Priya Raman')
      await pairOneToOne(ministry, leader, participant)

      await tickAt(mondayEightPm)
      const [asSent] = await inbox(leader)
      expect(asSent!.scheduled_for).toEqual(mondayEightPm)

      // Tuesday: the coordinator moves Monday 8pm to Wednesday 7pm.
      await pool.query(
        `update ministry set checkin_day = 3, checkin_hour = 19 where id = $1`,
        [ministry.id],
      )

      // Wednesday evening, under the new cadence. This ISO week has had its
      // conversation, so nothing is sent -- and nothing touched the row that was.
      await tickAt(new Date('2026-08-26T18:00:00Z'))
      const afterEdit = await inbox(leader)
      expect(afterEdit).toHaveLength(1)
      expect(afterEdit[0]!.scheduled_for).toEqual(mondayEightPm)
      expect(afterEdit[0]!.enqueued_at).toEqual(asSent!.enqueued_at)

      // The following ISO week fires on the new cadence and not the old one.
      const nextMonday = new Date('2026-08-31T19:00:00Z')
      await tickAt(nextMonday)
      expect(await inbox(leader)).toHaveLength(1)

      const nextWednesday = new Date('2026-09-02T18:00:00Z')
      await tickAt(nextWednesday)
      const nextWeek = await inbox(leader)
      expect(nextWeek).toHaveLength(2)
      expect(nextWeek[1]!.scheduled_for).toEqual(nextWednesday)

      // Restore, so the ordering of this suite does not leak into another file.
      await pool.query(
        `update ministry set checkin_day = 1, checkin_hour = 20 where id = $1`,
        [ministry.id],
      )
    })
  })
})
