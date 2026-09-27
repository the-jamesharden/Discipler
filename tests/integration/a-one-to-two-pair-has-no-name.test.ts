import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, relationshipId, type IdSource, type PersonId, type RelationshipId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The data migration that clears the name the Pair popup used to build for a 1:2
 * pair (Roles per pairing, ticket 05; James, 2026-09-27).
 *
 * The popup posted `{First} with {First} & {First}` as the ordinary name, and
 * nothing marked it as generated, so the migration matches the name against that
 * formula applied to the people the relationship was formed with: one Discipler
 * and two Disciples, read from its `relationship.created` history, in either
 * order. Anything else an Admin typed is left alone, a name on a Group of the
 * same three people included.
 *
 * The relationships are formed through the command, exactly as the old popup
 * formed them, and the migration's own file is run over them inside a
 * transaction that is rolled back, so no other test's rows are touched.
 */

const MIGRATION = fileURLToPath(
  new URL('../../supabase/migrations/20261013000500_a_one_to_two_pair_has_no_name.sql', import.meta.url),
)

describe('clearing the name a 1:2 pair was given', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-09T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('ABC Church')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const woman = async (fullName: string): Promise<PersonId> =>
    personId(await addPerson(ministry, fullName, { answers: { gender: 'female' } }))

  /** Formed as the popup formed it before this ticket: the name posted, no shape. */
  const formed = async (
    leaders: readonly string[],
    participants: readonly string[],
    name: string,
  ): Promise<RelationshipId> => {
    const leaderIds = await Promise.all(leaders.map(woman))
    const participantIds = await Promise.all(participants.map(woman))
    const { effects } = await createCommandService({
      clock,
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    }).execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds,
      participantIds,
      declaredGender: 'female',
      name,
    })
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was formed')
    return relationshipId(created.relationship.id)
  }

  /**
   * What these relationships are called once the migration has run, and what their
   * `relationship.created` history says they were called, read before it is undone.
   */
  const afterTheMigration = async (
    relationships: readonly RelationshipId[],
  ): Promise<{ readonly names: ReadonlyMap<string, string | null>; readonly recorded: ReadonlyMap<string, string | null> }> => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(readFileSync(MIGRATION, 'utf8'))
      const names = await client.query<{ id: string; name: string | null }>(
        `select id, name from relationship where id = any($1::uuid[]) order by id`,
        [relationships],
      )
      const recorded = await client.query<{ id: string; name: string | null }>(
        `select subject_id as id, payload ->> 'name' as name from ministry_event
          where subject_id = any($1::uuid[]) and type = 'relationship.created' order by subject_id`,
        [relationships],
      )
      return {
        names: new Map(names.rows.map(({ id, name }) => [id, name])),
        recorded: new Map(recorded.rows.map(({ id, name }) => [id, name])),
      }
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  it('clears the generated name, in either order of the two Disciples, and keeps every typed one', async () => {
    const claire = await formed(['Claire Lee'], ['Ana Diaz', 'Sam Park'], 'Claire with Ana & Sam')
    // The popup named the Disciples in the order the Roster listed them, which
    // need not be the order they were posted in.
    const mary = await formed(['  Mary   Jo Smith '], ['Pia  Quinn', 'Rae Stone'], 'Mary with Rae & Pia')
    // Typed by an Admin for a Group of one Discipler and two Disciples.
    const tess = await formed(['Tess Hart'], ['Uma Vale', 'Vi West'], 'Tuesday Women’s')
    // The formula, but over somebody who is not in it.
    const abby = await formed(['Abby Nash'], ['Bea Ortiz', 'Cam Price'], 'Abby with Bea & Dee')
    // The formula, on a Group formed with three Disciples.
    const wren = await formed(['Wren Cole'], ['Xena Ford', 'Yara Gill', 'Zoe Hunt'], 'Wren with Xena & Yara')
    // The formula, on a Group formed with two Disciplers and one Disciple.
    const dana = await formed(['Dana Moss', 'Eve Nolan'], ['Fay Reid'], 'Dana with Eve & Fay')

    const { names } = await afterTheMigration([claire, mary, tess, abby, wren, dana])

    expect(names.get(claire)).toBeNull()
    expect(names.get(mary)).toBeNull()
    expect(names.get(tess)).toBe('Tuesday Women’s')
    expect(names.get(abby)).toBe('Abby with Bea & Dee')
    expect(names.get(wren)).toBe('Wren with Xena & Yara')
    expect(names.get(dana)).toBe('Dana with Eve & Fay')
  })

  it('leaves the name in history, where it was recorded', async () => {
    const hana = await formed(['Hana Ito'], ['Iris Jay', 'Jo Kent'], 'Hana with Iris & Jo')

    const { names, recorded } = await afterTheMigration([hana])

    expect(names.get(hana)).toBeNull()
    expect(recorded.get(hana)).toBe('Hana with Iris & Jo')
  })
})
