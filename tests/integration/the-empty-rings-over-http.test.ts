import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { personId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { isoWeekOf, weekAfter, weekOpensAt } from '~/domain/week'
import { createCommandService } from '~/service/command-service'
import { addPerson, completeIntake, createMinistryWithAdmin, localSupabase, pairOneToOne } from '../support/local-supabase'
import { getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Overview's two rings, each empty in its own words (James, 2026-10-14,
 * follow-up to PR #27), as the page an Admin loads says them. A week whose
 * check-ins went out and were never answered is not a week with no check-ins:
 * Meeting Completion says nothing was answered and Check-In Ratings that
 * nothing was rated. Which ring says what is driven case by case in
 * `tests/app/the-empty-rings.test.ts`; this is the rule reaching the markup.
 *
 * The server reads the real clock, so the week is last week by the calendar.
 */

describe.skipIf(skipUnlessAppIsRunning)('the empty rings', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const zone = 'Europe/London'

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () => `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  it('says nothing answered and nothing rated of a week asked and never answered', async () => {
    const ministry = await createMinistryWithAdmin('Silent Chapel')
    await pool.query(
      `update ministry set timezone = $2, checkin_day = 1, checkin_hour = 20 where id = $1`,
      [ministry.id, zone],
    )
    const { cookie } = await signIn(ministry)

    const congregant = async (fullName: string) => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
      await completeIntake(ministry, id)
      return id
    }
    const tickAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' }).execute({
        type: 'scheduled.tick',
        ministryId: ministry.id,
      })

    // Last Monday at 8pm in London, the cadence, by the calendar.
    const lastWeek = weekAfter(isoWeekOf(new Date(), zone), -1)
    const cadence = new Date(weekOpensAt(lastWeek, zone).getTime() + 20 * 3_600_000)
    const formedAt = new Date(cadence.getTime() - weeks(1))
    await pairOneToOne(ministry, await congregant('Sam Silent'), await congregant('Sid Quiet'), {
      createdAt: formedAt,
      acceptedAt: formedAt,
      joinedAt: formedAt,
    })

    // Asked, reminded a day later and given up on the day after, at half past
    // eight in the evening, inside the hours the tick texts in: a closed
    // conversation with nothing answered, and a finished week.
    const minutesAfter = (n: number) => new Date(cadence.getTime() + n * 60_000)
    await tickAt(minutesAfter(1))
    await tickAt(minutesAfter(24 * 60 + 30))
    await tickAt(minutesAfter(48 * 60 + 30))

    const { response, html } = await getPage('/overview', cookie)
    expect(response.status).toBe(200)

    expect(html).toContain('Nothing answered last week')
    expect(html).toContain('Nothing rated last week')
    expect(html).not.toContain('No check-ins last week')
  })
})
