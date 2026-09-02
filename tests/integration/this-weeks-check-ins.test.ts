import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { concernId, personId, type IdSource, type PersonId } from '~/domain/ids'
import { readThisWeeksCheckIns } from '~/platform/supabase/check-ins-reader'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import type { ThisWeeksCheckIns } from '~/service/ports'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
} from '../support/local-supabase'

/**
 * The Check-Ins tab against the real database: this ISO week's relationship-weeks,
 * read through a signed-in Admin's session with the same clock the commands ran on.
 *
 * Every scenario gets a Ministry of its own, because the scheduled tick runs for a
 * whole Ministry at once and this week's list is the whole Ministry's.
 */

describe("this week's Check-Ins", () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))
  const minutesAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 60_000)

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name)
    await pool.query(
      `update ministry
          set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20
        where id = $1`,
      [ministry.id],
    )

    const serviceAt = (now: Date) =>
      createCommandService({
        clock: createTestClock(now),
        ids,
        store,
        appBaseUrl: 'https://discipler.test',
      })

    const congregant = async (fullName: string) =>
      personId(await addPerson(ministry, fullName, { phone: aNumber() }))

    return {
      ministry,
      serviceAt,
      tickAt: (now: Date) =>
        serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: PersonId, body: string) =>
        serviceAt(now).execute({
          type: 'sms.inbound',
          ministryId: ministry.id,
          personId: person,
          body,
        }),
      checkInsAt: async (now: Date): Promise<ThisWeeksCheckIns> =>
        readThisWeeksCheckIns(await signInAs(ministry), ministry.id, createTestClock(now)),
      /** A Leader with `count` relationships, all accepted a week before week zero. */
      leading: async (leaderName: string, count: number) => {
        const leader = await congregant(leaderName)
        const relationships: string[] = []
        for (let n = 0; n < count; n += 1) {
          const participant = await congregant(`${leaderName} Participant ${n + 1}`)
          const formedAt = new Date(firstWeek.getTime() - weeks(1) + n * 60_000)
          relationships.push(
            await pairOneToOne(ministry, leader, participant, {
              createdAt: formedAt,
              acceptedAt: formedAt,
            }),
          )
        }
        return { leader, relationships }
      },
    }
  }

  it('reads the week, no sent date and an empty list for a Ministry with nobody on the Roster', async () => {
    const church = await aMinistry('Empty Chapel')

    await expect(church.checkInsAt(at(0))).resolves.toEqual({
      week: '2026-W35',
      sentAt: null,
      checkIns: [],
    })
  })

  it("lists this week's answered relationship with its satisfaction and when it was sent", async () => {
    const church = await aMinistry('Answered Chapel')
    const { leader, relationships } = await church.leading('Answered Leader', 1)

    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'A')

    await expect(church.checkInsAt(minutesAfter(at(0), 3))).resolves.toEqual({
      week: '2026-W35',
      sentAt: at(0),
      checkIns: [
        {
          relationshipId: relationships[0],
          leaderNames: ['Answered Leader'],
          participantNames: ['Answered Leader Participant 1'],
          sentAt: at(0),
          // When the turn finished -- the rating -- not when the first reply
          // landed. The same reading the Overview's completed count uses.
          answeredAt: minutesAfter(at(0), 2),
          met: true,
          satisfaction: 'outstanding',
          concernOpen: false,
        },
      ],
    })
  })

  it("does not list last week's", async () => {
    const church = await aMinistry('Last Week Chapel')
    const { leader, relationships } = await church.leading('Last Week Leader', 1)

    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'B')

    // A week on, before the tick: a new week with nothing sent in it yet.
    await expect(church.checkInsAt(at(1))).resolves.toEqual({
      week: '2026-W36',
      sentAt: null,
      checkIns: [],
    })

    // After this week's tick: the relationship is listed once, for this week,
    // with nothing answered yet -- last week's B is not carried over.
    await church.tickAt(at(1))
    await expect(church.checkInsAt(minutesAfter(at(1), 1))).resolves.toEqual({
      week: '2026-W36',
      sentAt: at(1),
      checkIns: [
        {
          relationshipId: relationships[0],
          leaderNames: ['Last Week Leader'],
          participantNames: ['Last Week Leader Participant 1'],
          sentAt: at(1),
          answeredAt: null,
          met: null,
          satisfaction: null,
          concernOpen: false,
        },
      ],
    })
  })

  it('lists a relationship the conversation has not reached with no sent date', async () => {
    const church = await aMinistry('Unreached Chapel')
    const { relationships } = await church.leading('Unreached Leader', 2)

    await church.tickAt(at(0))

    const { checkIns, sentAt } = await church.checkInsAt(minutesAfter(at(0), 1))

    // The conversation opened, so the header has a sent date and both covered
    // relationships are listed. Only the first has been asked about.
    expect(sentAt).toEqual(at(0))
    expect(checkIns).toMatchObject([
      { relationshipId: relationships[0], sentAt: at(0), answeredAt: null },
      { relationshipId: relationships[1], sentAt: null, answeredAt: null },
    ])
  })

  it('counts a 2 as answered and not met', async () => {
    const church = await aMinistry('Not Met Chapel')
    const { leader } = await church.leading('Not Met Leader', 1)

    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '2')

    const { checkIns } = await church.checkInsAt(minutesAfter(at(0), 2))

    expect(checkIns).toMatchObject([
      { answeredAt: minutesAfter(at(0), 1), met: false, satisfaction: null },
    ])
  })

  describe('a Concern', () => {
    const raisedIn = async (name: string) => {
      const church = await aMinistry(`${name} Chapel`)
      const { leader, relationships } = await church.leading(`${name} Leader`, 1)

      await church.tickAt(at(0))
      await church.replyAt(minutesAfter(at(0), 1), leader, '1')
      await church.replyAt(minutesAfter(at(0), 2), leader, 'C')
      await church.replyAt(
        minutesAfter(at(0), 3),
        leader,
        'He has lost his job and they are barely speaking.',
      )

      const { rows } = await pool.query<{ id: string }>(
        `select id from concern where relationship_id = $1`,
        [relationships[0]],
      )

      return { church, relationship: relationships[0]!, concern: concernId(rows[0]!.id) }
    }

    it('shows as open until an Admin resolves it', async () => {
      const { church, relationship, concern } = await raisedIn('Open')

      expect((await church.checkInsAt(minutesAfter(at(0), 4))).checkIns).toMatchObject([
        {
          relationshipId: relationship,
          met: true,
          satisfaction: 'concern',
          answeredAt: minutesAfter(at(0), 3),
          concernOpen: true,
        },
      ])

      await church.serviceAt(minutesAfter(at(0), 5)).execute({
        type: 'concern.resolve',
        ministryId: church.ministry.id,
        concernId: concern,
        resolvedBy: church.ministry.adminUserId,
      })

      // Resolved: the rating stands -- the Leader said what they said -- and the
      // badge is gone.
      expect((await church.checkInsAt(minutesAfter(at(0), 6))).checkIns).toMatchObject([
        { relationshipId: relationship, satisfaction: 'concern', concernOpen: false },
      ])
    })

    it('never carries its words into the list', async () => {
      const { church } = await raisedIn('Private')

      const result = await church.checkInsAt(minutesAfter(at(0), 4))

      expect(JSON.stringify(result)).not.toContain('lost his job')
      expect(JSON.stringify(result)).not.toContain('barely speaking')
    })

    it('cannot be read through the function even by name', async () => {
      const { church } = await raisedIn('Sealed')

      // The function reads `concern.resolved_at` and nothing else of the table,
      // and the rows it returns have no column the words could travel in.
      const admin = await signInAs(church.ministry)
      const { data, error } = await admin.rpc('relationship_week_answers', {
        target_ministry_id: church.ministry.id,
      })

      expect(error).toBeNull()
      expect(JSON.stringify(data)).not.toContain('lost his job')
      expect(Object.keys((data as object[])[0] ?? {})).not.toContain('detail')
    })
  })

  it("never shows another Ministry's week", async () => {
    const mine = await aMinistry('Mine Chapel')
    const theirs = await aMinistry('Theirs Chapel')
    const { leader } = await theirs.leading('Their Leader', 1)

    await theirs.tickAt(at(0))
    await theirs.replyAt(minutesAfter(at(0), 1), leader, '1')
    await theirs.replyAt(minutesAfter(at(0), 2), leader, 'A')

    await expect(mine.checkInsAt(minutesAfter(at(0), 3))).resolves.toEqual({
      week: '2026-W35',
      sentAt: null,
      checkIns: [],
    })

    // Asking for theirs as my Admin: the policies return nothing of the Ministry,
    // so there is no zone to name a week against and nothing listed.
    const asMine = await signInAs(mine.ministry)
    const result = await readThisWeeksCheckIns(
      asMine,
      theirs.ministry.id,
      createTestClock(minutesAfter(at(0), 3)),
    )
    expect(result.checkIns).toEqual([])
    expect(result.sentAt).toBeNull()
  })
})
