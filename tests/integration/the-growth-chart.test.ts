import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { GrowthChoice } from '~/domain/growth'
import { personId, relationshipId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { readGrowth } from '~/platform/supabase/overview-reader'
import { createCommandService } from '~/service/command-service'
import { asDocument } from '../support/page-document'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  pairOneToOne,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The growth chart on Overview against the real database (Pastor feedback,
 * ticket 05): a Ministry whose history grows, shrinks and pauses, written by the
 * product's own commands where there is one, and read back through a signed-in
 * Admin's session.
 *
 * Every date is in the past and stays there, so the suite cannot go off when
 * the calendar catches up with it.
 */

describe('the growth chart', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const ids: IdSource = { next: () => crypto.randomUUID() }

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

  const at = (iso: string) => new Date(iso)
  // Wednesday 30 September 2026, noon in Chicago: ISO week 2026-W40.
  const now = at('2026-09-30T17:00:00Z')

  /**
   * One Ministry in Chicago, and a history:
   *
   * - Ana and Eve each in a one-to-one from 8 July.
   * - Ben in a one-to-one from 5 August, ended on 2 September.
   * - The Thursday Table from 19 August: Ana, Cal and Dee; Dee left on 9 September.
   * - Eve's one-to-one paused on 26 August and resumed on 16 September.
   */
  const aGrowingMinistry = async () => {
    const ministry = await createMinistryWithAdmin('Growing Chapel')
    await pool.query(`update ministry set timezone = 'America/Chicago' where id = $1`, [ministry.id])

    const serviceAt = (when: Date) =>
      createCommandService({ clock: createTestClock(when), ids, store, appBaseUrl: 'https://discipler.test' })
    const person = async (fullName: string) => personId(await addPerson(ministry, fullName, { phone: aNumber() }))
    const pairFrom = async (disciple: string, from: string) => {
      const when = at(from)
      return relationshipId(
        await pairOneToOne(ministry, await person(`Discipler of ${disciple}`), await person(disciple), {
          createdAt: when,
          acceptedAt: when,
          joinedAt: when,
        }),
      )
    }

    const ana = await pairFrom('Ana Ruiz', '2026-07-08T17:00:00Z')
    const eve = await pairFrom('Eve Hart', '2026-07-08T17:00:00Z')
    const ben = await pairFrom('Ben Ode', '2026-08-05T17:00:00Z')

    // A named Group, seeded as formation leaves one, with each membership dated.
    const formed = at('2026-08-19T17:00:00Z')
    const table = await createRelationship(ministry, 'group', { createdAt: formed, acceptedAt: formed })
    await pool.query(`update relationship set name = 'Thursday Table' where id = $1`, [table])
    await addMembership({
      ministry,
      relationshipId: table,
      kind: 'group',
      personId: await person('Ruth Lead'),
      role: 'leader',
      startedAt: formed,
      acceptedAt: formed,
    })
    const anaPerson = (await pool.query<{ person_id: string }>(
      `select person_id from relationship_member where relationship_id = $1 and role = 'participant'`,
      [ana],
    )).rows[0]!.person_id
    const dee = await person('Dee Lane')
    for (const disciple of [anaPerson, await person('Cal West'), dee]) {
      await addMembership({ ministry, relationshipId: table, kind: 'group', personId: disciple, role: 'participant', startedAt: formed })
    }

    const admin = ministry.adminUserId
    await serviceAt(at('2026-08-26T17:00:00Z')).execute({
      type: 'relationship.pause',
      ministryId: ministry.id,
      relationshipId: eve,
      periodWeeks: 2,
      pausedBy: admin,
    })
    await serviceAt(at('2026-09-02T17:00:00Z')).execute({
      type: 'relationship.end',
      ministryId: ministry.id,
      relationshipId: ben,
      reason: 'He moved away.',
      outcome: 'discontinued',
      endedBy: admin,
    })
    await serviceAt(at('2026-09-09T17:00:00Z')).execute({
      type: 'relationship.depart',
      ministryId: ministry.id,
      relationshipId: relationshipId(table),
      personId: dee,
      departedBy: admin,
    })
    await serviceAt(at('2026-09-16T17:00:00Z')).execute({
      type: 'relationship.resume',
      ministryId: ministry.id,
      relationshipId: eve,
      resumedBy: admin,
    })

    return ministry
  }

  let ministry: MinistryFixture
  beforeAll(async () => {
    ministry = await aGrowingMinistry()
  })

  const chart = async (choice: GrowthChoice) => {
    const growth = await readGrowth(await signInAs(ministry), ministry.id, choice, createTestClock(now))
    if (!growth) throw new Error('The Admin could not read their own growth chart')
    return growth
  }

  /** Each point as the Monday or first of the month it opens on in Chicago, and its count. */
  const byDay = async (choice: GrowthChoice) =>
    (await chart(choice)).series.points.map((point) => [
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(point.opensAt),
      point.count,
    ])

  it('counts everybody being discipled at the end of each of the last twelve weeks, and now', async () => {
    expect(await byDay({ measure: 'total', scale: 'weeks' })).toEqual([
      ['2026-07-13', 2],
      ['2026-07-20', 2],
      ['2026-07-27', 2],
      ['2026-08-03', 3],
      ['2026-08-10', 3],
      // The Thursday Table: Cal and Dee, and Ana, who is counted once.
      ['2026-08-17', 5],
      // Eve's pair paused.
      ['2026-08-24', 4],
      // Ben's pair ended.
      ['2026-08-31', 3],
      // Dee left the Group.
      ['2026-09-07', 2],
      // Eve's pair resumed.
      ['2026-09-14', 3],
      ['2026-09-21', 3],
      ['2026-09-28', 3],
    ])
  })

  it('counts the people in mentorship and the people in groups apart', async () => {
    const mentorship = await byDay({ measure: 'mentorship', scale: 'weeks' })
    expect(mentorship.map(([, count]) => count)).toEqual([2, 2, 2, 3, 3, 3, 2, 1, 1, 2, 2, 2])

    const groups = await byDay({ measure: 'groups', scale: 'weeks' })
    expect(groups.map(([, count]) => count)).toEqual([0, 0, 0, 0, 0, 3, 3, 3, 2, 2, 2, 2])
  })

  it('counts every month since the first relationship, the last one now', async () => {
    // Opened here today, by the fixture's clock, with a history from July: the
    // chart starts at the history.
    expect(await byDay({ measure: 'total', scale: 'months' })).toEqual([
      ['2026-07-01', 2],
      // Eve's pair was paused at the end of August.
      ['2026-08-01', 4],
      ['2026-09-01', 3],
    ])
  })

  it('says what it counted the last point at, and in which zone', async () => {
    const growth = await chart({ measure: 'total', scale: 'weeks' })
    expect(growth.timeZone).toBe('America/Chicago')
    expect(growth.series.points.at(-1)!.countedAt).toEqual(now)
    expect(growth.series.slots).toBe(12)
  })

  it('is carried by the Overview’s document and not by the Check-Ins tab’s', async () => {
    const admin = await signInAs(ministry)
    const overview = asDocument((await admin.rpc('overview_page')).data)
    const checkIns = asDocument((await admin.rpc('check_ins_page')).data)

    expect(asDocument(overview.growth).opened_at).toBeTruthy()
    expect(checkIns.growth).toBeUndefined()
    expect(checkIns.history).toEqual(overview.history)
    expect(checkIns.relationship_names).toEqual(overview.relationship_names)
  })

  it('shows another Ministry’s Admin nothing of this one', async () => {
    const neighbour = await createMinistryWithAdmin('Neighbouring Chapel')
    const growth = await readGrowth(
      await signInAs(neighbour),
      ministry.id,
      { measure: 'total', scale: 'weeks' },
      createTestClock(now),
    )
    expect(growth).toBeNull()

    // And their own reads as theirs: nobody in it.
    const own = await readGrowth(await signInAs(neighbour), neighbour.id, { measure: 'total', scale: 'weeks' }, createTestClock(now))
    expect(own!.series.points.every((point) => point.count === 0)).toBe(true)
  })
})
