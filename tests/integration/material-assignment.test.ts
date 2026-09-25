import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { MaterialAssignmentRefused } from '~/domain/errors'
import {
  materialId,
  personId,
  relationshipId,
  type IdSource,
  type MaterialId,
  type PersonId,
  type RelationshipId,
} from '~/domain/ids'
import { materialForWeek, type MaterialPeriod } from '~/domain/materials'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { invitationToken } from '~/domain/invitations'
import {
  addMaterial,
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  serviceRoleClient,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Material Assignment against the real database. The assertions that matter are
 * the ones no unit test can make: that the periods a Ministry accumulates over a
 * semester never overlap and never leave a gap, and that the database refuses to
 * hold a set that does.
 *
 * The screens came later (Materials, ticket 03); the rules are proven here
 * because the history has to be complete from the first week of the pilot, and
 * nothing can reconstruct it afterwards.
 */

describe('the Material a relationship is working through', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const acceptedAt = new Date('2026-03-02T09:00:00Z')
  let clock = createTestClock(acceptedAt)
  const at = (moment: Date) => {
    clock = createTestClock(moment)
  }
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

  /** One Leader and one Participant, accepted and running. */
  const aRelationship = async (options: { acceptedAt?: Date | null } = {}) => {
    const opened = options.acceptedAt === undefined ? acceptedAt : options.acceptedAt
    const id = await createRelationship(ministry, 'one_to_one', { acceptedAt: opened })
    await addMembership({
      ministry,
      relationshipId: id,
      kind: 'one_to_one',
      personId: await roster('Leader ' + ++numbered),
      role: 'leader',
      startedAt: opened ?? acceptedAt,
    })
    await addMembership({
      ministry,
      relationshipId: id,
      kind: 'one_to_one',
      personId: await roster('Participant ' + ++numbered),
      role: 'participant',
      startedAt: opened ?? acceptedAt,
    })
    return relationshipId(id)
  }

  const assign = (
    relationship: RelationshipId,
    material: MaterialId | null,
    by: string = ministry.adminUserId,
  ) =>
    service().execute({
      type: 'relationship.assign_material',
      ministryId: ministry.id,
      relationshipId: relationship,
      materialId: material,
      assignedBy: by,
    })

  /**
   * A close and an open written by hand, in one transaction, on the privileged
   * connection. The point of writing them this way is that the constraint trigger
   * is deferred: both statements succeed, and the invariant is judged at commit,
   * which is the only moment the question means anything.
   */
  const rewritePeriods = async (
    relationship: RelationshipId,
    closedAt: Date,
    material: MaterialId | null,
    startedAt: Date,
  ) => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `update material_assignment set ended_at = $2
          where relationship_id = $1 and ended_at is null`,
        [relationship, closedAt],
      )
      await client.query(
        `insert into material_assignment
           (ministry_id, relationship_id, material_id, started_at)
         values ($1, $2, $3, $4)`,
        [ministry.id, relationship, material, startedAt],
      )
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  /** The periods as a report reads them back, through the function that emits them. */
  const readPeriods = async (relationship: RelationshipId): Promise<MaterialPeriod[]> => {
    const { rows } = await pool.query<{
      material_id: string | null
      title: string | null
      started_at: Date
      ended_at: Date | null
    }>(
      `select material_id, title, started_at, ended_at
         from public.material_periods($1)
        where relationship_id = $2`,
      [ministry.id, relationship],
    )

    return rows.map((row) => ({
      materialId: row.material_id === null ? null : materialId(row.material_id),
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }))
  }

  /**
   * Every period on one relationship, oldest first, as the database holds them.
   * Ties broken by the opening period, exactly as the contiguity trigger breaks
   * them: two periods can share a start and an end, and *oldest first* has to mean
   * something on a relationship assigned a Material at the instant of acceptance.
   */
  const periodsOf = async (relationship: string) =>
    (
      await pool.query<{
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
    ).rows

  describe('acceptance, through the path a real Leader takes', () => {
    const tokenFor = async (person: PersonId) => {
      const { rows } = await pool.query<{ token: string }>(
        `select token from invitation where person_id = $1 and consumed_at is null`,
        [person],
      )
      const token = rows[0]?.token
      if (!token) throw new Error('no live invitation was issued')
      return invitationToken(token)
    }

    /** A real auth account, because `person.user_id` is a foreign key onto one. */
    const anAccount = async () => {
      const { data, error } = await serviceRoleClient().auth.admin.createUser({
        email: `leader-${crypto.randomUUID()}@example.test`,
        password: 'a-long-enough-password',
        email_confirm: true,
      })
      if (error) throw new Error(error.message)
      return data.user.id
    }

    it('opens the Material history when the relationship activates', async () => {
      const acceptedNow = new Date('2026-03-09T09:00:00Z')
      at(acceptedNow)

      const david = await roster('David Material')
      const emily = await roster('Emily Material')
      const { effects } = await service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [david],
        participantIds: [emily],
        name: 'The Tuesday Group',
      })
      const created = effects.find((effect) => effect.kind === 'relationship.create')
      if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

      // Nothing yet. A relationship nobody has accepted has no week to attribute,
      // and a period covering time no meeting could be reported in is noise.
      expect(await periodsOf(created.relationship.id)).toEqual([])

      await service().execute({
        type: 'relationship.accept',
        ministryId: ministry.id,
        token: await tokenFor(david),
        fullName: 'David Material',
        userId: await anAccount(),
      })

      // And now it exists, dated to the acceptance, with no Material in it -- the
      // first row of a history nothing could reconstruct later.
      expect(await periodsOf(created.relationship.id)).toEqual([
        { material_id: null, started_at: acceptedNow, ended_at: null, assigned_by: null },
      ])
    })

    it('opens nothing until the last co-leader has agreed', async () => {
      const acceptedNow = new Date('2026-03-10T09:00:00Z')
      at(acceptedNow)

      const david = await roster('David CoLead')
      const sarah = await roster('Sarah CoLead')
      const emily = await roster('Emily CoLead')
      const { effects } = await service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [david, sarah],
        participantIds: [emily],
        name: 'The Tuesday Group',
        // Two Leaders makes this a group, and a group says what it is. Mixed: the
        // subject here is co-leader acceptance.
        declaredGender: null,
      })
      const created = effects.find((effect) => effect.kind === 'relationship.create')
      if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

      await service().execute({
        type: 'relationship.accept',
        ministryId: ministry.id,
        token: await tokenFor(david),
        fullName: 'David CoLead',
        userId: await anAccount(),
      })

      // Nobody co-leads something they did not agree to, so nothing has started --
      // and a period opened by each acceptance in turn would overlap the last.
      expect(await periodsOf(created.relationship.id)).toEqual([])

      const agreedAt = new Date('2026-03-11T09:00:00Z')
      at(agreedAt)
      await service().execute({
        type: 'relationship.accept',
        ministryId: ministry.id,
        token: await tokenFor(sarah),
        fullName: 'Sarah CoLead',
        userId: await anAccount(),
      })

      expect(await periodsOf(created.relationship.id)).toEqual([
        { material_id: null, started_at: agreedAt, ended_at: null, assigned_by: null },
      ])
    })
  })

  describe('the period a relationship opens with', () => {
    it('runs from acceptance, with no Material in it and no Admin behind it', async () => {
      const relationship = await aRelationship()

      // A row saying "none", not the absence of a row. A report asking what was in
      // use in the first week gets a fact rather than a silence indistinguishable
      // from a defect.
      expect(await periodsOf(relationship)).toEqual([
        {
          material_id: null,
          started_at: acceptedAt,
          ended_at: null,
          assigned_by: null,
        },
      ])
    })

    it('is closed by the first assignment rather than replaced by it', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      const changedAt = new Date('2026-04-06T09:00:00Z')
      at(changedAt)
      await assign(relationship, romans)

      expect(await periodsOf(relationship)).toEqual([
        {
          material_id: null,
          started_at: acceptedAt,
          ended_at: changedAt,
          assigned_by: null,
        },
        {
          material_id: romans,
          started_at: changedAt,
          ended_at: null,
          assigned_by: ministry.adminUserId,
        },
      ])
    })

    it('is a zero-length period when a Material is assigned at the instant of acceptance', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      // The one case that looks like it ought to be an error and is not: the
      // opening period closes at its own start, covers no instant, and leaves
      // neither an overlap nor a gap.
      at(acceptedAt)
      await assign(relationship, romans)

      const [opening, first] = await periodsOf(relationship)
      expect(opening).toMatchObject({ started_at: acceptedAt, ended_at: acceptedAt })
      expect(first).toMatchObject({ material_id: romans, ended_at: null })
    })
  })

  describe('one Material at a time', () => {
    it('closes each period at the instant the next one starts, over a whole semester', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      const john = materialId(await addMaterial(ministry, "John's Gospel " + ++numbered))
      const manual = materialId(await addMaterial(ministry, 'The Manual ' + ++numbered))

      const first = new Date(acceptedAt.getTime() + days(14))
      const second = new Date(acceptedAt.getTime() + days(63))
      const third = new Date(acceptedAt.getTime() + days(120))

      for (const [moment, material] of [
        [first, romans],
        [second, john],
        [third, manual],
      ] as const) {
        at(moment)
        await assign(relationship, material)
      }

      const periods = await periodsOf(relationship)

      // Four periods, and every seam is one instant rather than two.
      expect(periods.map((period) => period.material_id)).toEqual([
        null,
        romans,
        john,
        manual,
      ])
      expect(periods.map((period) => period.started_at)).toEqual([
        acceptedAt,
        first,
        second,
        third,
      ])
      expect(periods.map((period) => period.ended_at)).toEqual([first, second, third, null])
    })

    it('leaves exactly one period open, however many times the Material changes', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      const john = materialId(await addMaterial(ministry, "John's Gospel " + ++numbered))

      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(relationship, romans)
      at(new Date(acceptedAt.getTime() + days(21)))
      await assign(relationship, john)

      const open = (await periodsOf(relationship)).filter((period) => period.ended_at === null)
      expect(open).toHaveLength(1)
      expect(open[0]?.material_id).toBe(john)
    })
  })

  describe('what the database refuses', () => {
    it('refuses a second open period, however it is written', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      // By SQL, on the privileged connection, which is the point: the invariant is
      // held by the schema rather than by the write path being careful.
      await expect(
        pool.query(
          `insert into material_assignment
             (ministry_id, relationship_id, material_id, started_at)
           values ($1, $2, $3, $4)`,
          [ministry.id, relationship, romans, new Date(acceptedAt.getTime() + days(7))],
        ),
      ).rejects.toThrow(/material_assignment_one_open_period/)
    })

    it('refuses a gap between two periods', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      const closedAt = new Date(acceptedAt.getTime() + days(7))
      const startedLate = new Date(acceptedAt.getTime() + days(9))

      await expect(
        rewritePeriods(relationship, closedAt, romans, startedLate),
      ).rejects.toThrow(/gap, an overlap, or an opening period/)
    })

    it('refuses two periods that overlap', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      const closedAt = new Date(acceptedAt.getTime() + days(7))
      const startedEarly = new Date(acceptedAt.getTime() + days(3))

      await expect(
        rewritePeriods(relationship, closedAt, romans, startedEarly),
      ).rejects.toThrow(/gap, an overlap, or an opening period/)
    })

    it('refuses a history that starts with a Material instead of with the opening period', async () => {
      const relationship = await aRelationship({ acceptedAt: null })
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      // Nothing opened this one's history, so this row would be the first -- and a
      // history beginning with a Material has no row at all for the weeks before it.
      await expect(
        pool.query(
          `insert into material_assignment
             (ministry_id, relationship_id, material_id, started_at)
           values ($1, $2, $3, $4)`,
          [ministry.id, relationship, romans, acceptedAt],
        ),
      ).rejects.toThrow(/gap, an overlap, or an opening period/)
    })

    it('refuses a history that opens later than the relationship it belongs to', async () => {
      const relationship = await aRelationship()

      // One period, contiguous with itself, no overlap and no gap *between* rows --
      // and the first fortnight after acceptance covered by nothing at all, which is
      // the same hole the opening period exists to close. Relative contiguity cannot
      // see this one; the first period being anchored to `accepted_at` is what does.
      await expect(
        pool.query(
          `update material_assignment set started_at = $2 where relationship_id = $1`,
          [relationship, new Date(acceptedAt.getTime() + days(14))],
        ),
      ).rejects.toThrow(/gap, an overlap, or an opening period/)
    })

    it('refuses an assignment dated before the period it would close began', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      const john = materialId(await addMaterial(ministry, "John's Gospel " + ++numbered))

      at(new Date(acceptedAt.getTime() + days(21)))
      await assign(relationship, romans)

      // After acceptance, and still before the period it would have to close. The
      // close would write `ended_at` earlier than that period's own `started_at`,
      // which the check constraint raises as a bare Postgres error no refusal code
      // could carry back -- so `app.assign_material` answers this one itself.
      at(new Date(acceptedAt.getTime() + days(7)))
      await expect(assign(relationship, john)).rejects.toThrow(
        /assignment_precedes_running_period/,
      )
    })

    it('holds a later period with no Material, which is an un-assignment', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(relationship, romans)

      // Refused until Materials, ticket 03, by an index saying there is only ever
      // one period with no Material. The grill asked for an un-assign, so the
      // index went; contiguity and the opening period are still the trigger's.
      const unassignedAt = new Date(acceptedAt.getTime() + days(21))
      await rewritePeriods(relationship, unassignedAt, null, unassignedAt)

      expect((await periodsOf(relationship)).map((period) => period.material_id)).toEqual([
        null,
        romans,
        null,
      ])
    })

    it('accepts two Materials assigned at the instant of acceptance, however the ties sort', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      const john = materialId(await addMaterial(ministry, "John's Gospel " + ++numbered))

      // Three periods sharing a start, two of them zero-length. Nothing distinguishes
      // the first two by date, so a check that asked which row sorted first would
      // refuse this legal history on a coin toss.
      at(acceptedAt)
      await assign(relationship, romans)
      await assign(relationship, john)

      const periods = await periodsOf(relationship)
      expect(periods.map((period) => period.ended_at)).toEqual([
        acceptedAt,
        acceptedAt,
        null,
      ])
      expect(
        materialForWeek(await readPeriods(relationship), {
          openedAt: new Date(acceptedAt.getTime() + days(7)),
          firstAnsweredAt: null,
        })?.materialId,
      ).toBe(john)

      // The same three periods again, written Material first. Assigning through the
      // command can only ever lay them down opening-period first, so on its own the
      // test above proves nothing about *however the ties sort* -- it exercises one
      // physical order and leaves the other to the planner. Written by hand, the row
      // a scan reaches first is the zero-length Material period, which is the order
      // that refused this history on a coin toss.
      const twin = await aRelationship()
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query(`delete from material_assignment where relationship_id = $1`, [
          twin,
        ])
        for (const [material, endedAt] of [
          [romans, acceptedAt],
          [john, null],
          [null, acceptedAt],
        ] as const) {
          await client.query(
            `insert into material_assignment
               (ministry_id, relationship_id, material_id, started_at, ended_at)
             values ($1, $2, $3, $4, $5)`,
            [ministry.id, twin, material, acceptedAt, endedAt],
          )
        }
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }

      // And it reads back opening period first whichever way it went in, because
      // *oldest first* has to name one order for a history whose first two periods
      // share both their dates.
      expect((await periodsOf(twin)).map((period) => period.material_id)).toEqual([
        null,
        romans,
        john,
      ])
    })

    it('refuses a Material belonging to another Ministry', async () => {
      const relationship = await aRelationship()
      const theirs = materialId(await addMaterial(other, 'Their Manual ' + ++numbered))

      // Indistinguishable from one that does not exist, because the composite key
      // is what refuses both -- and telling the two apart would confirm the other
      // Ministry holds it.
      await expect(assign(relationship, theirs)).rejects.toThrow(
        new MaterialAssignmentRefused('material.not_found'),
      )
    })

    it('refuses an Admin who merely holds an account', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      await expect(assign(relationship, romans, other.adminUserId)).rejects.toThrow(
        new MaterialAssignmentRefused('material.assigner_is_not_in_this_ministry'),
      )
    })

    it('refuses an assignment on a relationship nobody has accepted', async () => {
      const relationship = await aRelationship({ acceptedAt: null })
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      await expect(assign(relationship, romans)).rejects.toThrow(
        new MaterialAssignmentRefused('material.relationship_not_accepted', relationship),
      )
    })

    it('refuses to delete a Material a relationship has worked through', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(relationship, romans)

      // Blanking it would turn a recorded period into the one shape that means *no
      // Material was in use*, which is the history this ticket exists to keep.
      await expect(
        pool.query(`delete from material where id = $1`, [romans]),
      ).rejects.toThrow(/material_assignment_material_fk/)
    })

    it('refuses a Material that is a title pointing at nothing', async () => {
      await expect(
        pool.query(
          `insert into material (ministry_id, title) values ($1, $2)`,
          [ministry.id, 'Empty ' + ++numbered],
        ),
      ).rejects.toThrow(/material_carries_something/)
    })

    it('refuses half an upload', async () => {
      await expect(
        pool.query(
          `insert into material (ministry_id, title, pdf_path) values ($1, $2, $3)`,
          [ministry.id, 'Half ' + ++numbered, `${ministry.id}/a-file.pdf`],
        ),
      ).rejects.toThrow(/material_pdf_is_whole/)
    })
  })

  describe('taking a relationship off its Material, and the one already running (Materials, ticket 03)', () => {
    it('un-assigns as a later period with no Material, closed and opened at one instant', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      const assignedAt = new Date(acceptedAt.getTime() + days(7))
      const unassignedAt = new Date(acceptedAt.getTime() + days(28))
      at(assignedAt)
      await assign(relationship, romans)
      at(unassignedAt)
      await assign(relationship, null)

      const periods = await periodsOf(relationship)
      expect(periods.map((period) => period.material_id)).toEqual([null, romans, null])
      expect(periods.map((period) => period.ended_at)).toEqual([assignedAt, unassignedAt, null])
      expect(periods[2]?.assigned_by).toBe(ministry.adminUserId)

      // And a week after it reads as none, which is now a fact about those weeks.
      expect(
        materialForWeek(await readPeriods(relationship), {
          openedAt: new Date(acceptedAt.getTime() + days(35)),
          firstAnsweredAt: null,
        })?.materialId,
      ).toBeNull()
    })

    it('refuses the Material already running and writes no period', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(relationship, romans)
      at(new Date(acceptedAt.getTime() + days(14)))
      await expect(assign(relationship, romans)).rejects.toThrow(
        new MaterialAssignmentRefused('material.already_running', relationship),
      )

      expect(await periodsOf(relationship)).toHaveLength(2)
    })

    it('refuses no Material on a relationship already on none', async () => {
      const relationship = await aRelationship()

      at(new Date(acceptedAt.getTime() + days(7)))
      await expect(assign(relationship, null)).rejects.toThrow(
        new MaterialAssignmentRefused('material.already_running', relationship),
      )
      expect(await periodsOf(relationship)).toHaveLength(1)
    })

    it('still answers an opening period asked for twice as the defect it is', async () => {
      const relationship = await aRelationship()

      // No Admin behind it, which is acceptance's shape: an un-assignment always
      // names the Admin who made it.
      const { rows } = await pool.query<{ refusal: string | null }>(
        `select app.assign_material($1, null, $2, null) as refusal`,
        [relationship, new Date(acceptedAt.getTime() + days(7))],
      )
      expect(rows[0]?.refusal).toBe('material_history_already_open')
    })

    it('answers an Admin un-assigning a history nobody opened as the defect it is', async () => {
      const relationship = await aRelationship()
      await pool.query(`delete from material_assignment where relationship_id = $1`, [relationship])

      const { rows } = await pool.query<{ refusal: string | null }>(
        `select app.assign_material($1, null, $2, $3) as refusal`,
        [relationship, new Date(acceptedAt.getTime() + days(7)), ministry.adminUserId],
      )
      expect(rows[0]?.refusal).toBe('material_history_not_open')
    })

    it('refuses a Material the Ministry has removed', async () => {
      const relationship = await aRelationship()
      const gone = materialId(await addMaterial(ministry, 'Gone ' + ++numbered))
      await pool.query(`update material set removed = now() where id = $1`, [gone])

      at(new Date(acceptedAt.getTime() + days(7)))
      await expect(assign(relationship, gone)).rejects.toThrow(
        new MaterialAssignmentRefused('material.not_found'),
      )
      expect(await periodsOf(relationship)).toHaveLength(1)
    })

    it('names the running Material on the group form, and nothing once it is off it', async () => {
      const group = relationshipId(await createRelationship(ministry, 'group', { acceptedAt }))
      await pool.query(`update relationship set name = $2 where id = $1`, [group, 'Group ' + ++numbered])
      await addMembership({
        ministry,
        relationshipId: group,
        kind: 'group',
        personId: await roster('Leader ' + ++numbered),
        role: 'leader',
        startedAt: acceptedAt,
      })
      const title = 'Romans ' + ++numbered
      const romans = materialId(await addMaterial(ministry, title))

      const offered = async () => {
        const { rows } = await pool.query<{ relationship_id: string; material_title: string | null }>(
          `select relationship_id, material_title from public.groups_open_to_join($1)`,
          [ministry.id],
        )
        return rows.find((row) => row.relationship_id === group)?.material_title
      }

      expect(await offered()).toBeNull()
      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(group, romans)
      expect(await offered()).toBe(title)
      at(new Date(acceptedAt.getTime() + days(14)))
      await assign(group, null)
      expect(await offered()).toBeNull()
    })
  })

  describe('what a Material carries', () => {
    it('holds typed text, files and links, or both', async () => {
      const typed = await addMaterial(ministry, 'Typed ' + ++numbered, {
        body: 'Week one: read Romans 1.',
      })
      const uploaded = await addMaterial(ministry, 'Uploaded ' + ++numbered, {
        body: null,
        pdfPath: `${ministry.id}/${crypto.randomUUID()}.pdf`,
        pdfFilename: 'discipleship-manual.pdf',
      })
      const both = await addMaterial(ministry, 'Both ' + ++numbered, {
        body: 'Notes to read alongside the manual.',
        pdfPath: `${ministry.id}/${crypto.randomUUID()}.pdf`,
        pdfFilename: 'manual.pdf',
        links: [{ url: 'https://example.org/notes' }],
      })

      const { rows } = await pool.query<{ body: string | null; items: string[] | null }>(
        `select m.body,
                (select array_agg(coalesce(i.filename, i.url) order by i.position)
                   from material_item i where i.material_id = m.id) as items
           from material m where m.id = any($1) order by m.title`,
        [[typed, uploaded, both]],
      )

      expect(rows).toEqual([
        { body: 'Notes to read alongside the manual.', items: ['manual.pdf', 'https://example.org/notes'] },
        { body: 'Week one: read Romans 1.', items: null },
        { body: null, items: ['discipleship-manual.pdf'] },
      ])
    })

    it('is another Ministry’s to see, never this one’s', async () => {
      // One title on each list, so the assertions below can fail in both
      // directions. Asserting only the absence passes just as well on a read that
      // returned nothing at all, which is a different defect wearing this test's
      // green tick.
      const mine = 'Riverside Only ' + ++numbered
      const theirTitle = 'Northgate Only ' + ++numbered
      await addMaterial(ministry, mine)
      await addMaterial(other, theirTitle)
      const client = await signInAs(ministry)

      const { data, error } = await client.from('material').select('title')
      if (error) throw new Error(error.message)

      // Compared as titles, not through `expect.stringContaining`: `toContain`
      // tests membership with `includes`, which no asymmetric matcher is ever
      // equal under, so the negated form passed whatever the list held.
      const titles = (data as { title: string }[]).map((row) => row.title)
      expect(titles).toContain(mine)
      expect(titles).not.toContain(theirTitle)

      const { data: theirs } = await client
        .from('material')
        .select('title')
        .eq('ministry_id', other.id)
      expect(theirs).toEqual([])
    })
  })

  describe('attributing a week', () => {
    it('gives a week the Material assigned when the check-in was answered', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      // The conversation opened Monday. The Material changed Tuesday lunchtime.
      // The Leader answered Tuesday evening.
      const openedAt = new Date(acceptedAt.getTime() + days(7))
      const changedAt = new Date(openedAt.getTime() + 30 * 60 * 60 * 1000)
      const answeredAt = new Date(openedAt.getTime() + 36 * 60 * 60 * 1000)

      at(changedAt)
      await assign(relationship, romans)

      const week = materialForWeek(await readPeriods(relationship), {
        openedAt,
        firstAnsweredAt: answeredAt,
      })
      expect(week?.materialId).toBe(romans)
      expect(week?.title).toContain('Romans')
    })

    it('never splits a week, whichever side of the change the answer fell', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      const openedAt = new Date(acceptedAt.getTime() + days(7))
      const changedAt = new Date(openedAt.getTime() + 30 * 60 * 60 * 1000)

      at(changedAt)
      await assign(relationship, romans)

      const periods = await readPeriods(relationship)
      const early = materialForWeek(periods, {
        openedAt,
        firstAnsweredAt: new Date(openedAt.getTime() + 6 * 60 * 60 * 1000),
      })
      const late = materialForWeek(periods, {
        openedAt,
        firstAnsweredAt: new Date(openedAt.getTime() + 36 * 60 * 60 * 1000),
      })

      // One week, one Material -- and the two answers differ, which is what makes
      // the moment of the answer the thing that decides rather than a tie-break.
      expect(early?.materialId).toBeNull()
      expect(late?.materialId).toBe(romans)
    })

    it('answers "none" for a week before anything was assigned', async () => {
      const relationship = await aRelationship()

      const week = materialForWeek(await readPeriods(relationship), {
        openedAt: new Date(acceptedAt.getTime() + days(7)),
        firstAnsweredAt: null,
      })

      // Not null. The whole reason the opening period is a row.
      expect(week).not.toBeNull()
      expect(week?.materialId).toBeNull()
      expect(week?.title).toBeNull()
    })

    it('attributes a real answered check-in to the Material in use when the reply landed', async () => {
      // The whole chain, end to end: a conversation opened, a Material changed
      // mid-week, a Leader who replied afterwards, and the week that reply names.
      const leader = await roster('Leader Reply ' + ++numbered)
      const participant = await roster('Participant Reply ' + ++numbered)
      const openedAt = new Date('2026-06-01T09:00:00Z')
      const relationship = relationshipId(
        await createRelationship(ministry, 'one_to_one', { acceptedAt: acceptedAt }),
      )
      await addMembership({
        ministry,
        relationshipId: relationship,
        kind: 'one_to_one',
        personId: leader,
        role: 'leader',
        startedAt: acceptedAt,
      })
      await addMembership({
        ministry,
        relationshipId: relationship,
        kind: 'one_to_one',
        personId: participant,
        role: 'participant',
        startedAt: acceptedAt,
      })

      at(openedAt)
      await service().execute({
        type: 'checkin.start',
        ministryId: ministry.id,
        personId: leader,
      })

      // Tuesday: the Ministry moves them onto Romans, mid-conversation.
      const changedAt = new Date(openedAt.getTime() + 30 * 60 * 60 * 1000)
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      at(changedAt)
      await assign(relationship, romans)

      // Tuesday evening: the Leader answers.
      const answeredAt = new Date(openedAt.getTime() + 36 * 60 * 60 * 1000)
      at(answeredAt)
      await service().execute({
        type: 'sms.inbound',
        ministryId: ministry.id,
        personId: leader,
        body: '1',
      })

      const { rows } = await pool.query<{
        opened_at: Date
        first_answered_at: Date | null
      }>(
        `select opened_at, first_answered_at
           from public.relationship_weeks($1)
          where relationship_id = $2`,
        [ministry.id, relationship],
      )
      const week = rows[0]
      if (!week) throw new Error('the conversation covered no week')
      expect(week.first_answered_at).toEqual(answeredAt)

      expect(
        materialForWeek(await readPeriods(relationship), {
          openedAt: week.opened_at,
          firstAnsweredAt: week.first_answered_at,
        })?.materialId,
      ).toBe(romans)
    })

    it('reads back every week of a relationship that changed Material twice', async () => {
      const relationship = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      const john = materialId(await addMaterial(ministry, "John's Gospel " + ++numbered))

      at(new Date(acceptedAt.getTime() + days(14)))
      await assign(relationship, romans)
      at(new Date(acceptedAt.getTime() + days(63)))
      await assign(relationship, john)

      const periods = await readPeriods(relationship)
      const weekly = [0, 7, 14, 21, 56, 63, 70].map(
        (day) =>
          materialForWeek(periods, {
            openedAt: new Date(acceptedAt.getTime() + days(day)),
            firstAnsweredAt: null,
          })?.materialId ?? 'none',
      )

      // Every week of the semester has an answer, and no week has two.
      expect(weekly).toEqual(['none', 'none', romans, romans, romans, john, john])
    })
  })

  describe('assigning one Material to many at once (Richer materials, ticket 02)', () => {
    const assignMany = (relationships: readonly RelationshipId[], material: MaterialId) =>
      service().execute({
        type: 'material.assign_to_relationships',
        ministryId: ministry.id,
        materialId: material,
        relationshipIds: relationships,
        assignedBy: ministry.adminUserId,
      })

    /** Each assignment event written about a relationship, oldest first. */
    const assignedEventsOf = async (relationship: RelationshipId) =>
      (
        await pool.query<{ payload: { materialId: string | null; assignedBy: string } }>(
          `select payload from ministry_event
            where subject_id = $1 and type = 'relationship.material_assigned'
            order by occurred_at, id`,
          [relationship],
        )
      ).rows.map((row) => row.payload)

    it('starts every one on it at the same instant, each with its own period and event', async () => {
      const first = await aRelationship()
      const second = await aRelationship()
      const third = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      // One already on another Material: it is moved, as a card would move it.
      const mark = materialId(await addMaterial(ministry, 'Mark ' + ++numbered))
      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(third, mark)

      const pressedAt = new Date(acceptedAt.getTime() + days(14))
      at(pressedAt)
      await assignMany([first, second, third], romans)

      for (const relationship of [first, second]) {
        const periods = await periodsOf(relationship)
        expect(periods.map((period) => period.material_id)).toEqual([null, romans])
        expect(periods[1]).toMatchObject({ started_at: pressedAt, assigned_by: ministry.adminUserId })
        expect(await assignedEventsOf(relationship)).toEqual([
          { materialId: romans, assignedBy: ministry.adminUserId },
        ])
      }
      expect((await periodsOf(third)).map((period) => period.material_id)).toEqual([null, mark, romans])
      expect(await assignedEventsOf(third)).toEqual([
        { materialId: mark, assignedBy: ministry.adminUserId },
        { materialId: romans, assignedBy: ministry.adminUserId },
      ])
    })

    it('refuses the lot when one has ended, writing nothing for any, and names it', async () => {
      const first = await aRelationship()
      const ended = await aRelationship()
      const last = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      // Ended through the product's own act, as an Admin in another tab would.
      at(new Date(acceptedAt.getTime() + days(3)))
      await service().execute({
        type: 'relationship.end',
        ministryId: ministry.id,
        relationshipId: ended,
        reason: 'Moved away',
        outcome: 'discontinued',
        endedBy: ministry.adminUserId,
      })

      at(new Date(acceptedAt.getTime() + days(7)))
      await expect(assignMany([first, ended, last], romans)).rejects.toThrow(
        new MaterialAssignmentRefused('material.relationship_ended', ended),
      )

      for (const relationship of [first, ended, last]) {
        expect(await periodsOf(relationship)).toHaveLength(1)
        expect(await assignedEventsOf(relationship)).toEqual([])
      }
    })

    it('refuses the lot over the Material one is already on, which only the database can see, and names it', async () => {
      const first = await aRelationship()
      const already = await aRelationship()
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))
      at(new Date(acceptedAt.getTime() + days(7)))
      await assign(already, romans)

      at(new Date(acceptedAt.getTime() + days(14)))
      await expect(assignMany([first, already], romans)).rejects.toThrow(
        new MaterialAssignmentRefused('material.already_running', already),
      )

      // The first was written by the database before the second was refused, and
      // rolled back with it.
      expect(await periodsOf(first)).toHaveLength(1)
      expect(await assignedEventsOf(first)).toEqual([])
      expect(await periodsOf(already)).toHaveLength(2)
    })

    it("refuses the lot over another Ministry's relationship, as not found, and names it", async () => {
      const ours = await aRelationship()
      const theirs = relationshipId(await createRelationship(other, 'one_to_one', { acceptedAt }))
      const romans = materialId(await addMaterial(ministry, 'Romans ' + ++numbered))

      at(new Date(acceptedAt.getTime() + days(7)))
      await expect(assignMany([ours, theirs], romans)).rejects.toThrow(
        new MaterialAssignmentRefused('material.relationship_not_found', theirs),
      )
      expect(await periodsOf(ours)).toHaveLength(1)
    })
  })
})
