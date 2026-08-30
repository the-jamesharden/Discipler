import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import {
  concernId,
  personId,
  relationshipId,
  type IdSource,
  type PersonId,
} from '~/domain/ids'
import { readCareNeeded } from '~/platform/supabase/care-needed-reader'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import type { CareNeededItem } from '~/service/ports'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Relationship State and Care Needed against the real database.
 *
 * The property the whole ticket rests on: a Leader who says nothing surfaces, and
 * so does one who answers faithfully every week to say no meeting happened. The
 * second is the one a naive implementation misses; the first is the one a
 * sent-only counter misses on exactly the Leader who most needs catching.
 *
 * Every scenario below gets a Ministry of its own. The scheduled tick runs for a
 * whole Ministry at once, so two scenarios sharing one would have each other's
 * conversations opened and abandoned by the other's clock -- which is a coupling
 * between tests and not a fact about the product.
 */

describe('Relationship State and the Care Needed view', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))

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

  /**
   * One Ministry, asking on Monday evenings in London, with the handful of verbs a
   * scenario needs: run the tick, answer a text, read Care Needed.
   */
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

    const congregant = async (fullName: string) => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
      await completeIntake(ministry, id)
      return id
    }

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
      careAt: async (now: Date): Promise<readonly CareNeededItem[]> =>
        readCareNeeded(await signInAs(ministry), ministry.id, createTestClock(now)),
      /** A Leader with `count` relationships, all accepted a week before week zero. */
      leading: async (leaderName: string, count: number) => {
        const leader = await congregant(leaderName)
        const relationships: string[] = []
        for (let n = 0; n < count; n += 1) {
          const participant = await congregant(`${leaderName} Participant ${n + 1}`)
          relationships.push(
            await pairOneToOne(ministry, leader, participant, {
              createdAt: new Date(firstWeek.getTime() - weeks(1)),
              acceptedAt: new Date(firstWeek.getTime() - weeks(1)),
            }),
          )
        }
        return { leader, relationships }
      },
    }
  }

  /** Everything Care Needed says about one relationship, from either derived source. */
  const about = (items: readonly CareNeededItem[], relationship: string) =>
    items.filter((item) => item.source !== 'follow_up' && item.relationshipId === relationship)

  it('surfaces a Leader who has said nothing for two weeks, and counts it in days', async () => {
    const church = await aMinistry('Quiet Chapel')
    const { relationships } = await church.leading('Quiet Leader', 1)

    await church.tickAt(at(0))
    await church.tickAt(at(1))

    expect(about(await church.careAt(at(1)), relationships[0]!)).toMatchObject([
      {
        source: 'relationship',
        state: 'stalled',
        // Fourteen days: the Leader has never answered anything, so the silence is
        // measured from the moment they agreed to lead -- a week before week zero,
        // and a week before the week being read.
        reasons: [{ kind: 'gone_silent', days: 14 }],
        leaderNames: ['Quiet Leader'],
        participantNames: ['Quiet Leader Participant 1'],
      },
    ])
  })

  it('is not stalled after a single week of silence', async () => {
    const church = await aMinistry('Patient Chapel')
    const { relationships } = await church.leading('Patient Leader', 1)

    await church.tickAt(at(0))

    expect(about(await church.careAt(at(0)), relationships[0]!)).toEqual([])
  })

  /**
   * The hole a sent-only counter leaves, and the reason ticket 10 counts coverage
   * rather than questions actually sent.
   *
   * A question waits twenty-four hours, is re-sent once, and waits twenty-four
   * more before the sequence advances. A fully silent Leader with four
   * relationships therefore needs eight days to work through one conversation --
   * and a new week arrives first and abandons it. Under sent-only counting their
   * third and fourth relationships would never be asked, never accrue a counter,
   * and stay Healthy indefinitely: the invisible failure this ticket exists to
   * catch, arriving on the Leader most in need of catching.
   */
  it('counts every relationship a sequence covered, including ones it never reached', async () => {
    const church = await aMinistry('Silent Chapel')
    const { relationships } = await church.leading('Silent Leader', 4)

    // Two abandoned conversations, each displaced by the week that followed it.
    await church.tickAt(at(0))
    await church.tickAt(at(1))
    await church.tickAt(at(2))

    const { rows: sequences } = await pool.query<{ outcome: string | null }>(
      `select s.outcome from checkin_sequence s
        where s.ministry_id = $1 order by s.started_at`,
      [church.ministry.id],
    )
    expect(sequences.map((row) => row.outcome)).toEqual(['abandoned', 'abandoned', null])

    // Only the first relationship was ever asked about: no conversation got past
    // it before the next week displaced it.
    const { rows: asked } = await pool.query<{ relationship_id: string }>(
      `select distinct relationship_id from checkin_prompt where ministry_id = $1`,
      [church.ministry.id],
    )
    expect(asked.map((row) => row.relationship_id)).toEqual([relationships[0]])

    // And all four are Stalled regardless, which is the whole point.
    const items = await church.careAt(at(2))
    for (const relationship of relationships) {
      expect(about(items, relationship)).toMatchObject([
        { source: 'relationship', state: 'stalled', reasons: [{ kind: 'gone_silent' }] },
      ])
    }
  })

  it('surfaces a Leader who answers every week to say they did not meet, in weeks', async () => {
    const church = await aMinistry('Faithful Chapel')
    const { leader, relationships } = await church.leading('Faithful Leader', 1)

    for (const week of [0, 1, 2]) {
      await church.tickAt(at(week))
      // `2` is *we did not meet*, which finishes that relationship's turn.
      await church.replyAt(new Date(at(week).getTime() + 60_000), leader, '2')
    }

    const items = about(await church.careAt(at(2)), relationships[0]!)
    expect(items).toMatchObject([
      { source: 'relationship', state: 'stalled', reasons: [{ kind: 'not_meeting', weeks: 3 }] },
    ])

    // The unit follows the reason. A not-meeting run reports weeks and carries no
    // day count at all, so a caller cannot read one out of it.
    const [reason] = (items[0] as { reasons: readonly object[] }).reasons
    expect(reason).not.toHaveProperty('days')
  })

  it('is not stalled after two weeks of not meeting', async () => {
    const church = await aMinistry('Twice Chapel')
    const { leader, relationships } = await church.leading('Twice Leader', 1)

    for (const week of [0, 1]) {
      await church.tickAt(at(week))
      await church.replyAt(new Date(at(week).getTime() + 60_000), leader, '2')
    }

    expect(about(await church.careAt(at(1)), relationships[0]!)).toEqual([])
  })

  it('does not stall a Leader who is meeting', async () => {
    const church = await aMinistry('Steady Chapel')
    const { leader, relationships } = await church.leading('Steady Leader', 1)

    for (const week of [0, 1, 2]) {
      await church.tickAt(at(week))
      const answering = new Date(at(week).getTime() + 60_000)
      await church.replyAt(answering, leader, '1')
      await church.replyAt(new Date(answering.getTime() + 60_000), leader, 'B')
    }

    expect(about(await church.careAt(at(2)), relationships[0]!)).toEqual([])
  })

  it('clears a stall the moment the Leader answers again', async () => {
    const church = await aMinistry('Returning Chapel')
    const { leader, relationships } = await church.leading('Returning Leader', 1)

    await church.tickAt(at(0))
    await church.tickAt(at(1))
    expect(about(await church.careAt(at(1)), relationships[0]!)).toHaveLength(1)

    await church.tickAt(at(2))
    const answering = new Date(at(2).getTime() + 60_000)
    await church.replyAt(answering, leader, '1')
    await church.replyAt(new Date(answering.getTime() + 60_000), leader, 'A')

    expect(about(await church.careAt(at(2)), relationships[0]!)).toEqual([])
  })

  it('leaves a week already recorded alone when the cadence moves', async () => {
    const church = await aMinistry('Unmoved Chapel')
    const { relationships } = await church.leading('Unmoved Leader', 1)

    await church.tickAt(at(0))
    await church.tickAt(at(1))
    const before = about(await church.careAt(at(1)), relationships[0]!)

    // The coordinator moves the prompt from Monday 8pm to Thursday 9am. Every
    // week already recorded keeps the ISO week it was recorded in, because the
    // counters are anchored to the ISO week and never to the interval between
    // prompts. See docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md.
    await pool.query(`update ministry set checkin_day = 4, checkin_hour = 9 where id = $1`, [
      church.ministry.id,
    ])

    expect(about(await church.careAt(at(1)), relationships[0]!)).toEqual(before)
  })

  it('says nothing about a relationship nobody has accepted', async () => {
    const church = await aMinistry('Awaiting Chapel')
    const leader = personId(
      await addPerson(church.ministry, 'Awaiting Leader', { phone: aNumber() }),
    )
    await completeIntake(church.ministry, leader)
    const participant = personId(
      await addPerson(church.ministry, 'Awaiting Participant', { phone: aNumber() }),
    )
    await completeIntake(church.ministry, participant)

    const relationship = await pairOneToOne(church.ministry, leader, participant, {
      createdAt: new Date(firstWeek.getTime() - weeks(1)),
      acceptedAt: null,
    })

    await church.tickAt(at(0))
    await church.tickAt(at(1))

    // No sequence covers it, so no week is unanswered -- absent, not silent.
    expect(about(await church.careAt(at(1)), relationship)).toEqual([])
  })

  describe('a Concern', () => {
    const raisedIn = async (name: string) => {
      const church = await aMinistry(`${name} Chapel`)
      const { leader, relationships } = await church.leading(`${name} Leader`, 1)

      await church.tickAt(at(0))
      const answering = new Date(at(0).getTime() + 60_000)
      await church.replyAt(answering, leader, '1')
      await church.replyAt(new Date(answering.getTime() + 60_000), leader, 'C')
      await church.replyAt(
        new Date(answering.getTime() + 120_000),
        leader,
        'He has lost his job and they are barely speaking.',
      )

      const { rows } = await pool.query<{ id: string }>(
        `select id from concern where relationship_id = $1`,
        [relationships[0]],
      )

      return {
        church,
        leader,
        relationship: relationships[0]!,
        concern: concernId(rows[0]!.id),
      }
    }

    it('sets Needs Care the week it is raised and stands beside the relationship after', async () => {
      const { church, relationship } = await raisedIn('Concerned')

      expect(about(await church.careAt(at(0)), relationship)).toMatchObject([
        { source: 'relationship', state: 'needs_care', openConcerns: 1 },
        { source: 'concern', concerns: [{ raisedByName: 'Concerned Leader' }] },
      ])

      // The following week the state returns to Healthy and the badge remains.
      expect(about(await church.careAt(at(1)), relationship)).toMatchObject([
        { source: 'concern', concerns: [{}] },
      ])
    })

    it('is counted rather than repeated when there is more than one', async () => {
      const { church, leader, relationship } = await raisedIn('Twofold')

      await church.tickAt(at(1))
      const answering = new Date(at(1).getTime() + 60_000)
      await church.replyAt(answering, leader, '1')
      await church.replyAt(new Date(answering.getTime() + 60_000), leader, 'C')
      await church.replyAt(new Date(answering.getTime() + 120_000), leader, 'It has got worse.')

      expect(
        about(await church.careAt(at(1)), relationship).find((item) => item.source === 'concern'),
      ).toMatchObject({ concerns: [{}, {}] })
    })

    it('never carries its words into the list', async () => {
      const { church, relationship } = await raisedIn('Private')

      expect(JSON.stringify(about(await church.careAt(at(0)), relationship))).not.toContain(
        'lost his job',
      )
    })

    it('refuses its words to a signed-in Admin selecting the column', async () => {
      const { church } = await raisedIn('Ungranted')

      // The audit is a grant and not a convention. There is no path to the text
      // from the authenticated role at all, so an Admin cannot read one without
      // the command that records that they did.
      const admin = await signInAs(church.ministry)
      const { error } = await admin.from('concern').select('detail').limit(1)

      expect(error).not.toBeNull()
    })

    it('hands its words over only through the command that records who read them', async () => {
      const { church, concern } = await raisedIn('Opened')

      const detail = await church.serviceAt(at(1)).openConcern({
        type: 'concern.view',
        ministryId: church.ministry.id,
        concernId: concern,
        viewedBy: church.ministry.adminUserId,
      })

      expect(detail).toBe('He has lost his job and they are barely speaking.')

      const { rows: viewings } = await pool.query<{ viewed_by: string }>(
        `select viewed_by from concern_viewing where concern_id = $1`,
        [concern],
      )
      expect(viewings).toMatchObject([{ viewed_by: church.ministry.adminUserId }])

      // Reading it a second time is a second fact, not the same one again.
      await church.serviceAt(at(2)).openConcern({
        type: 'concern.view',
        ministryId: church.ministry.id,
        concernId: concern,
        viewedBy: church.ministry.adminUserId,
      })
      const { rows: again } = await pool.query(
        `select 1 from concern_viewing where concern_id = $1`,
        [concern],
      )
      expect(again).toHaveLength(2)
    })

    it('clears its words when it is resolved, and keeps the row', async () => {
      const { church, concern, relationship } = await raisedIn('Cleared')

      await church.serviceAt(at(1)).execute({
        type: 'concern.resolve',
        ministryId: church.ministry.id,
        concernId: concern,
        resolvedBy: church.ministry.adminUserId,
      })

      const { rows: after } = await pool.query<{
        detail: string | null
        detail_kept: boolean
        resolved_by: string
      }>(`select detail, detail_kept, resolved_by from concern where id = $1`, [concern])

      expect(after).toMatchObject([
        { detail: null, detail_kept: false, resolved_by: church.ministry.adminUserId },
      ])

      // Gone from the badge, still in the table: how many a Ministry raised and
      // how fast it closed them is a question it can still ask.
      expect(
        about(await church.careAt(at(1)), relationship).filter(
          (item) => item.source === 'concern',
        ),
      ).toEqual([])
    })

    it('keeps its words only when an Admin deliberately says so', async () => {
      const { church, concern } = await raisedIn('Kept')

      await church.serviceAt(at(1)).execute({
        type: 'concern.resolve',
        ministryId: church.ministry.id,
        concernId: concern,
        resolvedBy: church.ministry.adminUserId,
        keepDetail: true,
      })

      const { rows } = await pool.query<{ detail: string | null; detail_kept: boolean }>(
        `select detail, detail_kept from concern where id = $1`,
        [concern],
      )
      expect(rows[0]).toMatchObject({ detail_kept: true })
      expect(rows[0]?.detail).toContain('lost his job')
    })

    it('does not clear itself the way a stall does', async () => {
      const { church, leader, relationship } = await raisedIn('Persistent')

      // Two good weeks after the Concern. The state is Healthy again and the
      // badge is still there, because only an Admin closes one.
      for (const week of [1, 2]) {
        await church.tickAt(at(week))
        const answering = new Date(at(week).getTime() + 60_000)
        await church.replyAt(answering, leader, '1')
        await church.replyAt(new Date(answering.getTime() + 60_000), leader, 'A')
      }

      expect(about(await church.careAt(at(2)), relationship)).toMatchObject([
        { source: 'concern', concerns: [{}] },
      ])
    })

    it('is stored apart from Follow-Up Items, and Care Needed shows both', async () => {
      const { church, relationship } = await raisedIn('Unioned')

      const { rows: notAnItem } = await pool.query(
        `select 1 from follow_up_item where relationship_id = $1`,
        [relationship],
      )
      expect(notAnItem).toEqual([])

      // A Follow-Up Item raised on the same relationship, so the two sources have
      // to be unioned rather than one standing in for the other.
      await store.transact(church.ministry.id, (unit) =>
        unit.raiseFollowUp({
          ministryId: church.ministry.id,
          kind: 'swap_requested',
          relationshipId: relationshipId(relationship),
          personId: null,
          raisedAt: at(1),
        }),
      )

      const items = await church.careAt(at(1))
      expect(new Set(items.map((item) => item.source))).toEqual(
        new Set(['follow_up', 'concern']),
      )
      expect(
        items.filter((item) => item.source === 'follow_up').map((item) => item.payload.kind),
      ).toEqual(['swap_requested'])
    })
  })
})
