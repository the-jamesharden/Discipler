import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { followUpItemId, personId, type IdSource, type PersonId } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The tick against the real database: a relationship nobody accepts, the reminder
 * its Leader gets at two days, the item an Admin gets at five, and the fact that
 * running the tick every day after that changes neither.
 *
 * Nothing here waits. The clock is the injected one and every "day later" is a
 * call to `advanceTo`, which is the whole reason this seam exists.
 */

describe('the scheduled tick', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const createdAt = new Date('2026-03-02T09:00:00Z')
  // One clock *and one Ministry* per test rather than one for the file. A clock
  // does not run backwards, so a test that has already advanced a week cannot be
  // followed by one that starts on the day the relationship was formed -- and
  // rewinding it beside state a later instant wrote is the same mistake at the
  // other end. The tick reaches every live relationship in its Ministry, so a
  // conversation one test opened in week four is one the next test's tick would
  // find already open on day two, and abandon before it started.
  let clock = createTestClock(createdAt)
  const restart = async () => {
    clock = createTestClock(createdAt)
    ministry = await createMinistryWithAdmin('Riverside Chapel')
  }
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  const on = (elapsed: number) => clock.advanceTo(new Date(createdAt.getTime() + elapsed))
  const tick = () => service().execute({ type: 'scheduled.tick', ministryId: ministry.id })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
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

  const roster = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aNumber() }))

  const pair = async (leader: PersonId, participant: PersonId) => {
    await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [leader],
      participantIds: [participant],
    })
    const { rows } = await pool.query<{ id: string }>(
      `select r.id from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1 and m.role = 'leader' and r.ministry_id = $2`,
      [leader, ministry.id],
    )
    const id = rows[0]?.id
    if (!id) throw new Error('no relationship was created')
    return id
  }

  const remindersTo = async (person: PersonId) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message
        where person_id = $1 and body like '%still someone waiting%'`,
      [person],
    )
    return rows
  }

  const openItemsOn = async (relationship: string) => {
    const { rows } = await pool.query<{ kind: string; payload: unknown }>(
      `select kind, payload from follow_up_item
        where relationship_id = $1 and resolved_at is null`,
      [relationship],
    )
    return rows
  }

  const openItemRowsOn = async (relationship: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from follow_up_item
        where relationship_id = $1 and resolved_at is null`,
      [relationship],
    )
    return rows
  }

  const eventsOn = async (relationship: string, type: string) => {
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event where subject_id = $1 and type = $2`,
      [relationship, type],
    )
    return rows
  }

  it('reminds a Leader at two days and raises an item at five, each exactly once', async () => {
    await restart()
    const leader = await roster('David Ellis')
    const participant = await roster('Emily Johnson')
    const relationship = await pair(leader, participant)

    // A day in: too early for either.
    on(days(1))
    await tick()
    expect(await remindersTo(leader)).toHaveLength(0)
    expect(await openItemsOn(relationship)).toHaveLength(0)

    // Two days: the Leader is reminded, with a link they can actually tap.
    on(days(2))
    await tick()
    const [reminder] = await remindersTo(leader)
    expect(reminder?.body).toContain('https://discipler.test/invitation/')

    // Three and four: still their week to answer, and no second text.
    on(days(3))
    await tick()
    on(days(4))
    await tick()
    expect(await remindersTo(leader)).toHaveLength(1)
    expect(await openItemsOn(relationship)).toHaveLength(0)

    // Five: it stops being theirs to solve.
    on(days(5))
    await tick()
    expect(await openItemsOn(relationship)).toEqual([
      { kind: 'relationship_unaccepted', payload: {} },
    ])

    // Six and seven: the condition is still true, and the Admin still has exactly
    // one thing to act on -- and one history event, not one a day.
    on(days(6))
    await tick()
    on(days(7))
    await tick()
    expect(await openItemsOn(relationship)).toHaveLength(1)
    expect(await remindersTo(leader)).toHaveLength(1)

    const raisings = await eventsOn(relationship, 'follow_up.relationship_unaccepted')
    expect(raisings).toEqual([{ payload: { waitedDays: 5 } }])
  })

  it('raises again after an Admin resolves the item and nobody has accepted', async () => {
    // Deduping is *while the item stands open*, which is the rule the partial
    // unique index holds. Resolving records that an Admin acted on the condition;
    // it does not make a Leader agree -- so a relationship that could never be
    // raised a second time would be one nobody is told about again, which is the
    // invisibility this whole ticket exists to end.
    await restart()
    const leader = await roster('Priya Raman')
    const relationship = await pair(leader, await roster('Quinn Barrett'))

    on(days(5))
    await tick()
    const [item] = await openItemRowsOn(relationship)
    expect(item).toBeDefined()

    await service().execute({
      type: 'follow_up.resolve',
      ministryId: ministry.id,
      itemId: followUpItemId(item!.id),
      resolvedBy: ministry.adminUserId,
    })
    expect(await openItemsOn(relationship)).toHaveLength(0)

    on(days(6))
    await tick()

    expect(await openItemsOn(relationship)).toEqual([
      { kind: 'relationship_unaccepted', payload: {} },
    ])
    // Two raisings in the record, and the Admin has one thing to act on. The
    // history accumulates; the Care Needed list does not.
    expect(await eventsOn(relationship, 'follow_up.relationship_unaccepted')).toEqual([
      { payload: { waitedDays: 5 } },
      { payload: { waitedDays: 6 } },
    ])
  })

  it('sends nothing and raises nothing when the Leader accepts in time', async () => {
    await restart()
    const leader = await roster('Grace Miller')
    const participant = await roster('Hannah Reed')
    const relationship = await pair(leader, participant)

    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [leader],
    )
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      email: `leader-${crypto.randomUUID()}@example.test`,
      password: 'a-long-enough-password',
      email_confirm: true,
    })
    if (error) throw new Error(error.message)

    on(days(1))
    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: invitationToken(rows[0]!.token),
      fullName: 'Grace Miller',
      userId: data.user.id,
    })

    // A month of ticks against a relationship that is under way.
    on(days(30))
    await tick()

    expect(await remindersTo(leader)).toHaveLength(0)
    expect(await openItemsOn(relationship)).toHaveLength(0)
  })

  it('is not brought down for a whole Ministry by one Leader who opted out', async () => {
    await restart()
    const silent = await roster('Kofi Mensah')
    const reachable = await roster('Leah Osei')
    const withSilent = await pair(silent, await roster('Marcus Webb'))
    const withReachable = await pair(reachable, await roster('Nora Vance'))

    // After being invited, and without ending their membership -- which is exactly
    // what texting STOP does. The outbound queue refuses a message to them, and the
    // tick is one transaction, so composing one would roll back every reminder and
    // every escalation in this Ministry on this run and on every run after it.
    await optOut(ministry, silent)

    on(days(2))
    await tick()

    expect(await remindersTo(silent)).toHaveLength(0)
    expect(await remindersTo(reachable)).toHaveLength(1)

    // And the escalation still reaches the Admin for the relationship Discipler
    // can no longer text into, which is the right remedy for it.
    on(days(5))
    await tick()

    expect(await openItemsOn(withSilent)).toHaveLength(1)
    expect(await openItemsOn(withReachable)).toHaveLength(1)
  })
})
