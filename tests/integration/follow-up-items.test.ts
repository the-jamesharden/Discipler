import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { FollowUpRefused } from '~/domain/errors'
import { followUpItemId, personId, relationshipId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Follow-Up Item table itself: what may be in it, what each kind must carry,
 * and the one-open-item-per-condition rule that makes Care Needed a list of things
 * to do rather than a log of how often something was true.
 */

describe('the Follow-Up Item table', () => {
  let ministry: MinistryFixture
  let elsewhere: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-03-02T09:00:00Z')
  const clock = createTestClock(at)
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    elsewhere = await createMinistryWithAdmin('Northgate Fellowship')
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

  const roster = async (fixture: MinistryFixture, fullName: string) =>
    personId(await addPerson(fixture, fullName, { phone: aNumber() }))

  const aRelationship = async () => {
    const leader = await roster(ministry, 'David Ellis')
    const participant = await roster(ministry, 'Emily Johnson')
    return { id: await pairOneToOne(ministry, leader, participant), leader, participant }
  }

  const openItems = async (relationship: string) => {
    const { rows } = await pool.query<{ kind: string; payload: unknown }>(
      `select kind, payload from follow_up_item
        where relationship_id = $1 and resolved_at is null`,
      [relationship],
    )
    return rows
  }

  it('holds six kinds, and nothing derived is among them', async () => {
    const { rows } = await pool.query<{ label: string }>(
      `select e.enumlabel as label
         from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'follow_up_kind'
        order by e.enumlabel`,
    )

    expect(rows.map((row) => row.label)).toEqual([
      'group_join_requested',
      'invitation_number_disputed',
      'match_declined',
      'participant_keyword',
      'pause_expired',
      'relationship_unaccepted',
      'swap_requested',
    ])
  })

  it('has no kind for a derived state or for a Concern', async () => {
    // `Stalled` clears on an answered check-in, so it could never satisfy *never
    // clears itself*. A Concern is cleared by default on resolution and its text
    // is audited on viewing -- four properties this table has no room for -- so it
    // gets a table of its own in ticket 10.
    const { rows } = await pool.query<{ label: string }>(
      `select e.enumlabel as label
         from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'follow_up_kind'`,
    )
    const labels = rows.map((row) => row.label)

    for (const derived of ['stalled', 'needs_care', 'healthy', 'paused', 'concern']) {
      expect(labels).not.toContain(derived)
    }

    const { rows: columns } = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'follow_up_item'`,
    )
    // Nowhere to put a Concern's text even if somebody wanted to.
    expect(columns.map((row) => row.column_name)).not.toContain('note')
  })

  it('refuses an item that is about nothing', async () => {
    await expect(
      pool.query(
        `insert into follow_up_item (ministry_id, kind, raised_at) values ($1, 'swap_requested', $2)`,
        [ministry.id, at],
      ),
    ).rejects.toThrow(/follow_up_item_has_a_subject/)
  })

  it('refuses an item pointing across a Ministry boundary', async () => {
    const stranger = await roster(elsewhere, 'Someone Else')

    await expect(
      pool.query(
        `insert into follow_up_item (ministry_id, kind, person_id, raised_at)
         values ($1, 'match_declined', $2, $3)`,
        [ministry.id, stranger, at],
      ),
    ).rejects.toThrow(/follow_up_item_person_fk/)
  })

  it('refuses a pause_expired with no period and a participant_keyword with no keyword', async () => {
    const { id } = await aRelationship()

    await expect(
      pool.query(
        `insert into follow_up_item (ministry_id, kind, relationship_id, raised_at)
         values ($1, 'pause_expired', $2, $3)`,
        [ministry.id, id, at],
      ),
    ).rejects.toThrow(/follow_up_item_payload_matches_kind/)

    // A number is not enough: `3` is not a period anybody can select, and a row
    // carrying one is a payload the domain refuses to read back -- a failed Care
    // Needed screen rather than a refused write.
    await expect(
      pool.query(
        `insert into follow_up_item (ministry_id, kind, relationship_id, raised_at, payload)
         values ($1, 'pause_expired', $2, $3, '{"periodWeeks": 3}'::jsonb)`,
        [ministry.id, id, at],
      ),
    ).rejects.toThrow(/follow_up_item_payload_matches_kind/)

    const person = await roster(ministry, 'Nora Vance')
    await expect(
      pool.query(
        `insert into follow_up_item (ministry_id, kind, person_id, raised_at, payload)
         values ($1, 'participant_keyword', $2, $3, '{"keyword": "  "}'::jsonb)`,
        [ministry.id, person, at],
      ),
    ).rejects.toThrow(/follow_up_item_payload_matches_kind/)
  })

  it('files one open item however often the same condition is raised', async () => {
    const { id } = await aRelationship()

    // A pause expiring is re-evaluated by the tick every run. Its subject is the
    // relationship and its `person_id` is null, so this is the case a unique index
    // treating nulls as distinct would silently file once a day.
    for (const run of [1, 2, 3]) {
      await store.transact(ministry.id, (unit) =>
        unit.raiseFollowUp({
          ministryId: ministry.id,
          kind: 'pause_expired',
          periodWeeks: 4,
          relationshipId: relationshipId(id),
          personId: null,
          raisedAt: new Date(at.getTime() + run),
        }),
      )
    }

    expect(await openItems(id)).toEqual([
      { kind: 'pause_expired', payload: { periodWeeks: 4 } },
    ])
  })

  it('files one open item for a second SWAP, and keeps the count in history', async () => {
    // Settled 2026-08-29: every kind dedupes while it stands open and the history
    // accumulates. A Leader asking twice is saying something, and it survives -- in
    // the Week-by-Week History, not as a second row an Admin has to close twice.
    const { id, leader } = await aRelationship()

    for (const run of [1, 2]) {
      await store.transact(ministry.id, async (unit) => {
        await unit.raiseFollowUp({
          ministryId: ministry.id,
          kind: 'swap_requested',
          relationshipId: relationshipId(id),
          personId: leader,
          requestedBy: 'leader',
          raisedAt: new Date(at.getTime() + run),
        })
        await unit.appendHistory([
          {
            ministryId: ministry.id,
            occurredAt: new Date(at.getTime() + run),
            type: 'follow_up.swap_requested',
            subjectType: 'relationship',
            subjectId: id,
            payload: { personId: leader },
          },
        ])
      })
    }

    expect(await openItems(id)).toEqual([
      { kind: 'swap_requested', payload: { requestedBy: 'leader' } },
    ])

    const { rows } = await pool.query(
      `select 1 from ministry_event where subject_id = $1 and type = 'follow_up.swap_requested'`,
      [id],
    )
    expect(rows).toHaveLength(2)
  })

  it('records the acting Admin and the time when one is resolved, and appends an event', async () => {
    const { id, leader } = await aRelationship()

    await store.transact(ministry.id, (unit) =>
      unit.raiseFollowUp({
        ministryId: ministry.id,
        kind: 'invitation_number_disputed',
        relationshipId: relationshipId(id),
        personId: leader,
        raisedAt: at,
      }),
    )

    const { rows: raised } = await pool.query<{ id: string }>(
      `select id from follow_up_item where relationship_id = $1 and resolved_at is null`,
      [id],
    )

    await service().execute({
      type: 'follow_up.resolve',
      ministryId: ministry.id,
      itemId: followUpItemId(raised[0]!.id),
      resolvedBy: ministry.adminUserId,
    })

    const { rows: closed } = await pool.query<{
      resolved_at: Date
      resolved_by: string
    }>(`select resolved_at, resolved_by from follow_up_item where id = $1`, [raised[0]!.id])

    expect(closed[0]?.resolved_at).toEqual(at)
    expect(closed[0]?.resolved_by).toBe(ministry.adminUserId)

    const { rows: events } = await pool.query(
      `select 1 from ministry_event where subject_id = $1 and type = 'follow_up.resolved'`,
      [raised[0]!.id],
    )
    expect(events).toHaveLength(1)
  })

  it('refuses a resolver who is not in the Ministry', async () => {
    const { id, leader } = await aRelationship()

    await store.transact(ministry.id, (unit) =>
      unit.raiseFollowUp({
        ministryId: ministry.id,
        kind: 'invitation_number_disputed',
        relationshipId: relationshipId(id),
        personId: leader,
        raisedAt: at,
      }),
    )
    const { rows } = await pool.query<{ id: string }>(
      `select id from follow_up_item where relationship_id = $1 and resolved_at is null`,
      [id],
    )

    // An Admin of another Ministry holds a real account, and the composite key is
    // what says the account is not enough.
    await expect(
      service().execute({
        type: 'follow_up.resolve',
        ministryId: ministry.id,
        itemId: followUpItemId(rows[0]!.id),
        resolvedBy: elsewhere.adminUserId,
      }),
    ).rejects.toThrow(
      expect.objectContaining({ refusal: 'follow_up.resolver_is_not_in_this_ministry' }),
    )
  })

  it('refuses a second resolution, and records nothing for it', async () => {
    const { id, leader } = await aRelationship()

    await store.transact(ministry.id, (unit) =>
      unit.raiseFollowUp({
        ministryId: ministry.id,
        kind: 'match_declined',
        relationshipId: relationshipId(id),
        personId: leader,
        raisedAt: at,
      }),
    )
    const { rows } = await pool.query<{ id: string }>(
      `select id from follow_up_item where relationship_id = $1 and resolved_at is null`,
      [id],
    )
    const item = followUpItemId(rows[0]!.id)

    const resolve = () =>
      service().execute({
        type: 'follow_up.resolve',
        ministryId: ministry.id,
        itemId: item,
        resolvedBy: ministry.adminUserId,
      })

    await resolve()
    await expect(resolve()).rejects.toThrow(FollowUpRefused)

    // The refused attempt left no trace: the whole command is one transaction, so
    // history cannot claim a resolution that did not land.
    const { rows: events } = await pool.query(
      `select 1 from ministry_event where subject_id = $1 and type = 'follow_up.resolved'`,
      [item],
    )
    expect(events).toHaveLength(1)
  })
})
