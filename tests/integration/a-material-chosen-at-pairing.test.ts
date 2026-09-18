import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import {
  materialId,
  personId,
  type IdSource,
  type MaterialId,
  type PersonId,
  type RelationshipId,
} from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import { createCommandService } from '~/service/command-service'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import {
  aTestPhoneNumber,
  addMaterial,
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Material an Admin picks while forming a relationship, against the real
 * database: held on the relationship until every Leader has agreed, and written
 * into its Material history at that instant. What only the database can say is
 * that two periods sharing one instant is a history it accepts, and that the
 * intention does not outlive the acceptance that spends it.
 */

describe('a Material chosen at pairing', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-03-02T09:00:00Z')
  const clock = createTestClock(at)
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    other = await createMinistryWithAdmin('Northgate Church')
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

  const pair = async (
    leaderIds: PersonId[],
    participantIds: PersonId[],
    material?: MaterialId,
  ): Promise<RelationshipId> => {
    const { effects } = await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds,
      participantIds,
      name: 'The Tuesday Group',
      declaredGender: null,
      ...(material ? { materialId: material } : {}),
    })
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was formed')
    return created.relationship.id
  }

  const anAccount = async () => {
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      phone: aTestPhoneNumber(),
      password: 'a-long-enough-password',
      phone_confirm: true,
    })
    if (error) throw new Error(error.message)
    return data.user.id
  }

  const accept = async (leader: PersonId) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [leader],
    )
    const token = rows[0]?.token
    if (!token) throw new Error('no live invitation was issued')
    return service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: invitationToken(token),
      fullName: 'As Given',
      userId: await anAccount(),
    })
  }

  const intendedOn = async (relationship: RelationshipId) => {
    const { rows } = await pool.query<{ intended_material_id: string | null }>(
      `select intended_material_id from relationship where id = $1`,
      [relationship],
    )
    return rows[0]?.intended_material_id
  }

  /** In the order the Material history itself reads them. */
  const periodsOf = async (relationship: RelationshipId) => {
    const { rows } = await pool.query<{
      material_id: string | null
      started_at: Date
      ended_at: Date | null
      assigned_by: string | null
    }>(
      `select material_id, started_at, ended_at, assigned_by
         from material_assignment
        where relationship_id = $1
        order by started_at, ended_at nulls last, (material_id is not null)`,
      [relationship],
    )
    return rows
  }

  const activationsOf = async (relationship: RelationshipId) => {
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'relationship.activated'`,
      [relationship],
    )
    return rows.map((row) => row.payload)
  }

  it('waits on the relationship, and is written into its history when the Leader accepts', async () => {
    const romans = materialId(await addMaterial(ministry, 'Romans, chosen at pairing'))
    const david = await roster('David Chose')
    const group = await pair([david], [await roster('Emily Chose'), await roster('Ada Chose')], romans)

    // Held, and nothing assigned: no period may sit on a relationship nobody has
    // accepted.
    expect(await intendedOn(group)).toBe(romans)
    expect(await periodsOf(group)).toEqual([])

    await accept(david)

    // Two periods at one instant, which commits -- so the deferred check on the
    // Material history accepts it. The opening period covers nothing and sorts
    // first; the chosen Material is the one running, and no Admin performed it.
    expect(await periodsOf(group)).toEqual([
      { material_id: null, started_at: at, ended_at: at, assigned_by: null },
      { material_id: romans, started_at: at, ended_at: null, assigned_by: null },
    ])
    // Spent, so nothing re-reading this relationship finds a stale intention.
    expect(await intendedOn(group)).toBeNull()
    // And the activation says what it was spent on, which outlives the column.
    expect(await activationsOf(group)).toEqual([
      { participantCount: 2, intendedMaterial: { materialId: romans, outcome: 'assigned' } },
    ])
  })

  it('binds a one-to-one exactly as it binds a group', async () => {
    const romans = materialId(await addMaterial(ministry, 'Romans, for two'))
    const david = await roster('David Pair')
    const pairOfTwo = await pair([david], [await roster('Emily Pair')], romans)

    await accept(david)

    expect((await periodsOf(pairOfTwo)).map((period) => period.material_id)).toEqual([null, romans])
  })

  it('waits for the last Leader, and is spent by the acceptance that activates', async () => {
    const romans = materialId(await addMaterial(ministry, 'Romans, co-led'))
    const david = await roster('David Co-leads')
    const sarah = await roster('Sarah Co-leads')
    const group = await pair([david, sarah], [await roster('Emily Co-led')], romans)

    await accept(david)
    expect(await intendedOn(group)).toBe(romans)
    expect(await periodsOf(group)).toEqual([])

    await accept(sarah)
    expect((await periodsOf(group)).map((period) => period.material_id)).toEqual([null, romans])
    expect(await intendedOn(group)).toBeNull()
  })

  it('activates with the opening period alone where the Material was removed in between', async () => {
    const leviticus = materialId(await addMaterial(ministry, 'Leviticus, soon removed'))
    const david = await roster('David Stale')
    const group = await pair([david], [await roster('Emily Stale'), await roster('Ada Stale')], leviticus)

    // Nobody is working through it -- an intention is not a period -- so the
    // removal is not refused as in use.
    await service().execute({
      type: 'material.remove',
      ministryId: ministry.id,
      materialId: leviticus,
      removedBy: ministry.adminUserId,
    })

    // A Leader's act, which never fails on an Admin's stale choice.
    await accept(david)

    expect(await periodsOf(group)).toEqual([
      { material_id: null, started_at: at, ended_at: null, assigned_by: null },
    ])
    expect(await intendedOn(group)).toBeNull()
    // The skip is silent to the Leader and not to history.
    expect(await activationsOf(group)).toEqual([
      { participantCount: 2, intendedMaterial: { materialId: leviticus, outcome: 'skipped_as_removed' } },
    ])
  })

  it('opens the one period, exactly as before, where no Material was chosen', async () => {
    const david = await roster('David Plain')
    const group = await pair([david], [await roster('Emily Plain'), await roster('Ada Plain')])

    expect(await intendedOn(group)).toBeNull()
    await accept(david)

    expect((await periodsOf(group)).map((period) => period.material_id)).toEqual([null])
    expect(await activationsOf(group)).toEqual([{ participantCount: 2 }])
  })

  it('refuses a Material that is removed, or another Ministry’s, and forms nothing', async () => {
    const gone = materialId(await addMaterial(ministry, 'Numbers, already removed'))
    await service().execute({
      type: 'material.remove',
      ministryId: ministry.id,
      materialId: gone,
      removedBy: ministry.adminUserId,
    })
    const theirs = materialId(await addMaterial(other, 'Northgate’s own'))

    const david = await roster('David Refused')
    const emily = await roster('Emily Refused')

    for (const material of [gone, theirs]) {
      await expect(pair([david], [emily], material)).rejects.toMatchObject({
        refusal: 'relationship.material_is_not_on_the_list',
      })
    }

    const { rows } = await pool.query(
      `select 1 from relationship_member where person_id = any($1::uuid[])`,
      [[david, emily]],
    )
    expect(rows).toEqual([])
  })

  it('takes the Ministry’s lock before the relationship’s row, the order the tick takes them in', async () => {
    // The scheduled tick takes the Ministry lock and then writes against
    // relationship rows. An acceptance that held the row and then asked for the
    // Ministry lock would deadlock against it, and Postgres would abort one of
    // them -- so a Leader's acceptance could fail on nothing but timing.
    const romans = materialId(await addMaterial(ministry, 'Romans, under a lock'))
    const david = await roster('David Waits')
    const group = await pair([david], [await roster('Emily Waits'), await roster('Ada Waits')], romans)

    const tick = await pool.connect()
    const onlooker = await pool.connect()
    try {
      // Standing in for a tick that is part-way through.
      await tick.query('begin')
      await tick.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [ministry.id])

      const accepting = accept(david)

      // Until the acceptance is waiting on that lock.
      for (let waited = 0; ; waited += 1) {
        const { rows } = await onlooker.query(
          `select 1 from pg_locks where locktype = 'advisory' and not granted`,
        )
        if (rows.length > 0) break
        if (waited > 200) throw new Error('the acceptance never asked for the Ministry lock')
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      // The row is still free, so whatever the tick does to it next goes through.
      await onlooker.query('begin')
      await expect(
        onlooker.query(`select id from relationship where id = $1 for update nowait`, [group]),
      ).resolves.toBeDefined()
      await onlooker.query('rollback')

      await tick.query('commit')
      await accepting
    } finally {
      await tick.query('rollback').catch(() => undefined)
      await onlooker.query('rollback').catch(() => undefined)
      tick.release()
      onlooker.release()
    }

    expect((await periodsOf(group)).map((period) => period.material_id)).toEqual([null, romans])
  })

  describe('what the table itself holds to', () => {
    it('keeps the relationship and drops the intention when its Material is deleted outright', async () => {
      const shortLived = materialId(await addMaterial(ministry, 'Deleted outright'))
      const david = await roster('David Deleted')
      const group = await pair([david], [await roster('Emily Deleted'), await roster('Ada Deleted')], shortLived)

      await pool.query(`delete from material where id = $1`, [shortLived])

      // Set null, of that one column: the Ministry half of the key is untouched
      // and the relationship stands.
      const { rows } = await pool.query<{ ministry_id: string; intended_material_id: string | null }>(
        `select ministry_id, intended_material_id from relationship where id = $1`,
        [group],
      )
      expect(rows).toEqual([{ ministry_id: ministry.id, intended_material_id: null }])
    })

    it('refuses an intention naming another Ministry’s Material, whatever wrote it', async () => {
      const theirs = await addMaterial(other, 'Northgate’s, by hand')
      const david = await roster('David By Hand')
      const group = await pair([david], [await roster('Emily By Hand'), await roster('Ada By Hand')])

      await expect(
        pool.query(`update relationship set intended_material_id = $2 where id = $1`, [group, theirs]),
      ).rejects.toMatchObject({ constraint: 'relationship_intended_material_fk' })
    })

    it('refuses an accepted relationship an intention, so spent always means cleared', async () => {
      const romans = await addMaterial(ministry, 'Romans, after the fact')
      const david = await roster('David After')
      const group = await pair([david], [await roster('Emily After'), await roster('Ada After')])
      await accept(david)

      await expect(
        pool.query(`update relationship set intended_material_id = $2 where id = $1`, [group, romans]),
      ).rejects.toMatchObject({ constraint: 'relationship_intention_is_spent_at_acceptance' })
    })
  })
})
