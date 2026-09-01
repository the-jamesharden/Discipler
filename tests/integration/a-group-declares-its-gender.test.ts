import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import type { Gender } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The missing third of the gender rule. A one-to-one matches absolutely and a mixed
 * group binds nobody; between them sits the case the schema did not constrain at all
 * -- a men's small group, which is the ordinary case in a ministry and the one where
 * the safeguarding rule earns its keep.
 *
 * A relationship declares what it is, once, at formation. Where it declared a gender
 * every member must be of it, Leader and Participant alike. The declaration is
 * enforced by the database and not by the pairing command, for the reason the
 * one-to-one rule is: an application-side check holds only until the first write path
 * that forgets it.
 */

describe('a group that declared its gender', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-09T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const form = (
    leaderIds: PersonId[],
    participantIds: PersonId[],
    declaredGender: Gender | null,
  ) =>
    service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds,
      participantIds,
      declaredGender,
    })

  const man = async (name: string) =>
    personId(await addPerson(ministry, name, { answers: { gender: 'male' } }))
  const woman = async (name: string) =>
    personId(await addPerson(ministry, name, { answers: { gender: 'female' } }))

  const refusalFrom = async (attempt: Promise<unknown>): Promise<string> => {
    try {
      await attempt
    } catch (error) {
      if (error instanceof PairingRefused) return error.refusal
      throw error
    }
    throw new Error('That pairing was expected to be refused, and was not')
  }

  it('refuses a Participant who is not of the declared gender', async () => {
    const leader = await man('Aaron Blake')
    const first = await man('Ben Chase')
    const outsider = await woman('Cara Doyle')

    expect(await refusalFrom(form([leader], [first, outsider], 'male'))).toBe(
      'relationship.gender_does_not_match_the_declaration',
    )
  })

  it('refuses a Leader who is not of the declared gender', async () => {
    // Leader and Participant alike. A rule that only checked the people being
    // discipled would leave a woman leading a men's group, which is the shape a
    // safeguarding constraint most obviously exists to say something about.
    const leader = await woman('Dawn Ellis')
    const first = await man('Eli Frost')
    const second = await man('Gil Hart')

    expect(await refusalFrom(form([leader], [first, second], 'male'))).toBe(
      'relationship.gender_does_not_match_the_declaration',
    )
  })

  it('forms a men’s group of three men, several Leaders included', async () => {
    // The case scoping the trigger by kind answered wrongly: a men's small group with
    // two Leaders is not a shape with no pair to match.
    const first = await man('Hugo Ives')
    const second = await man('Ivan Jones')
    const participant = await man('Jonah Keele')

    const outcome = await form([first, second], [participant], 'male')

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
    const { rows } = await pool.query(
      `select declared_gender from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1`,
      [participant],
    )
    expect(rows[0].declared_gender).toBe('male')
  })

  it('lets a group that declared mixed hold men and women together', async () => {
    const leader = await man('Karl Lowe')
    const first = await woman('Lena Marsh')
    const second = await man('Milo North')

    const outcome = await form([leader], [first, second], null)

    expect(outcome.effects.map((effect) => effect.kind)).toContain('relationship.create')
  })

  it('leaves no relationship and no history behind when it refuses', async () => {
    const leader = await woman('Nora Oakes')
    const first = await woman('Opal Pryce')
    const outsider = await man('Piers Quill')

    await refusalFrom(form([leader], [first, outsider], 'female'))

    // Membership rows are written before the history event, so a refusal that rolled
    // back badly would leave either a half-built relationship or history claiming a
    // pairing that never happened.
    const { rows: members } = await pool.query(
      `select 1 from relationship_member where person_id = any($1)`,
      [[leader, first, outsider]],
    )
    expect(members).toEqual([])

    const { rows: events } = await pool.query(
      `select 1 from ministry_event
        where ministry_id = $1 and type = 'relationship.created'
          and payload->'leaderIds' ? $2`,
      [ministry.id, leader],
    )
    expect(events).toEqual([])
  })

  it('refuses a member written straight into the table, because the rule is not the command’s', async () => {
    // The whole reason this lives in the database. A backfill, an import, or an admin
    // tool reaching past the pairing command finds the same refusal.
    const leader = await woman('Rita Sands')
    const first = await woman('Sara Tate')
    const second = await woman('Tess Unwin')
    await form([leader], [first, second], 'female')

    const { rows } = await pool.query(
      `select relationship_id from relationship_member where person_id = $1`,
      [first],
    )
    const intruder = await man('Theo Usher')

    await expect(
      pool.query(
        `insert into relationship_member
           (ministry_id, relationship_id, kind, person_id, role, started_at)
         select $1, $2, kind, $3, 'participant', now()
           from relationship where id = $2`,
        [ministry.id, rows[0].relationship_id, intruder],
      ),
    ).rejects.toThrow(/declared/i)
  })

  it('refuses a reopened membership that no longer matches the declaration', async () => {
    // Nothing in Discipler reopens a membership -- readmission is a second row. The
    // guarantee is written against the database rather than against the write paths
    // that exist today, so it has to hold for the update as well as the insert.
    const leader = await woman('Ursula Vane')
    const first = await woman('Vera Wills')
    const second = await woman('Wren Yates')
    await form([leader], [first, second], 'female')

    await pool.query(`update relationship_member set ended_at = now() where person_id = $1`, [
      second,
    ])

    // Her Intake is corrected, and she is no longer of the gender the group declared.
    await pool.query(`update intake_submission set gender = 'male' where person_id = $1`, [
      second,
    ])

    await expect(
      pool.query(`update relationship_member set ended_at = null where person_id = $1`, [
        second,
      ]),
    ).rejects.toThrow(/declared/i)
  })

  it('is immutable, because a constraint that can be switched off is not a constraint', async () => {
    const leader = await man('Xander Ames')
    const first = await man('Yusuf Bell')
    const second = await man('Zach Crowe')
    await form([leader], [first, second], 'male')

    const { rows } = await pool.query(
      `select relationship_id from relationship_member where person_id = $1`,
      [second],
    )

    await expect(
      pool.query(`update relationship set declared_gender = null where id = $1`, [
        rows[0].relationship_id,
      ]),
    ).rejects.toThrow(/immutable/i)
  })

  it('binds even where the Ministry turned the automatic gender rule off', async () => {
    // `suggest_gender_match` is the deliberate disable for the rule Discipler applies
    // on a Ministry's behalf -- the automatic match between two people. A declaration
    // is a statement an Admin made about one relationship, on purpose, and a Ministry
    // that permitted mixed one-to-ones has not asked for its own women's group to
    // quietly admit a man.
    const permissive = await createMinistryWithAdmin('Open Door Fellowship')
    await pool.query(`update ministry set suggest_gender_match = false where id = $1`, [
      permissive.id,
    ])

    const her = personId(
      await addPerson(permissive, 'Amara Blythe', { answers: { gender: 'female' } }),
    )
    const him = personId(
      await addPerson(permissive, 'Bruno Clay', { answers: { gender: 'male' } }),
    )
    const other = personId(
      await addPerson(permissive, 'Cleo Dane', { answers: { gender: 'female' } }),
    )

    // The one-to-one the setting does permit, so the fixture is not merely quiet.
    const mixed = await service().execute({
      type: 'relationship.create',
      ministryId: permissive.id,
      leaderIds: [her],
      participantIds: [him],
    })
    expect(mixed.effects.map((effect) => effect.kind)).toContain('relationship.create')

    await expect(
      service().execute({
        type: 'relationship.create',
        ministryId: permissive.id,
        leaderIds: [her],
        participantIds: [other, await personId(
          await addPerson(permissive, 'Dane Ellery', { answers: { gender: 'male' } }),
        )],
        declaredGender: 'female',
      }),
    ).rejects.toThrow(PairingRefused)
  })
})
