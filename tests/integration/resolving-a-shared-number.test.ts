import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { ImportRowResolutionRefused } from '~/domain/errors'
import { importRowId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'
import { file, phoneNumbers } from '../support/roster'

/**
 * The Admin-facing half of `same_number_different_name`, against the real database.
 *
 * Three of the claims worth proving are only true in Postgres: the row outlives the
 * report that pointed at it, a rename moves no `person.id`, and a second person on
 * a shared phone is a row the identity index actually accepts. The fourth is what
 * an Admin can see -- the read is behind RLS and a Leader must not reach it.
 */

describe('resolving a number the Roster already holds', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  // Real identifiers: these rows outlive the test file, so a second run against the
  // same stack would collide with the first on a deterministic id.
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  const number = phoneNumbers()

  const importing = (csv: string) =>
    service().execute({ type: 'person.import', ministryId: ministry.id, csv })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  /** The people on one number, oldest first, as the database actually holds them. */
  const peopleOn = async (phone: string) => {
    const { rows } = await pool.query<{ id: string; full_name: string; email: string | null }>(
      `select id, full_name, email from person
        where ministry_id = $1 and phone = $2 order by created_at, full_name`,
      [ministry.id, `+1${phone}`],
    )
    return rows
  }

  const heldRowsOn = async (phone: string) => {
    const { rows } = await pool.query<{
      id: string
      line: number
      full_name: string
      answer: string | null
      person_id: string | null
      resolved_by: string | null
    }>(
      `select id, line, full_name, answer, person_id, resolved_by
         from held_import_row where ministry_id = $1 and phone = $2 order by created_at`,
      [ministry.id, `+1${phone}`],
    )
    return rows
  }

  /** A number the Roster holds, and a second file naming it under another name. */
  const collide = async (existing: string, incoming: string) => {
    const phone = number()
    await importing(file('Name,Phone', `${existing},${phone}`))
    await importing(file('Name,Phone,Email', `${incoming},${phone},${'new@example.test'}`))
    return phone
  }

  const answer = (
    row: string,
    given: { kind: 'same_person'; personId: string } | { kind: 'someone_else' },
  ) =>
    service().execute({
      type: 'import_row.resolve',
      ministryId: ministry.id,
      rowId: importRowId(row),
      resolvedBy: ministry.adminUserId,
      answer:
        given.kind === 'same_person'
          ? { kind: 'same_person', personId: given.personId as never }
          : { kind: 'someone_else' },
    })

  it('keeps the refused row, so the question outlives the report that carried it', async () => {
    const phone = await collide('Emily Johnson', 'Em Johnson')

    expect(await heldRowsOn(phone)).toMatchObject([
      { line: 2, full_name: 'Em Johnson', answer: null, person_id: null },
    ])
  })

  it('asks once however many times the same file is uploaded', async () => {
    // An Admin who re-uploads before answering has asked one question, not two. Two
    // rows would put the same choice on the Roster twice -- and answering one would
    // leave the other pointing at a name that is now on the number.
    const phone = await collide('Grace Lin', 'Gracie Lin')
    await importing(file('Name,Phone', `Gracie Lin,${phone}`))

    const held = await heldRowsOn(phone)
    expect(held).toHaveLength(1)
    // And it points at the file in front of them now, not the one from last week.
    expect(held[0]).toMatchObject({ line: 2 })
  })

  describe('same person', () => {
    it('renames the Person without moving their id, and creates nobody', async () => {
      const phone = await collide('David Ellis', 'Dave Ellis')
      const [before] = await peopleOn(phone)
      const [row] = await heldRowsOn(phone)

      await answer(row!.id, { kind: 'same_person', personId: before!.id })

      const after = await peopleOn(phone)
      expect(after).toHaveLength(1)
      // The whole of *this is a rename, not a merge*: one row throughout, and the
      // identifier every relationship, message and history event points at is
      // exactly the one it pointed at before.
      expect(after[0]!.id).toBe(before!.id)
      expect(after[0]!.full_name).toBe('Dave Ellis')
    })

    it('leaves the email the Roster already held', async () => {
      // A stale export must not overwrite an address a Person gave at Intake. The
      // Admin answered which Person this row is, not *replace what they told us*.
      const phone = number()
      await importing(file('Name,Phone,Email', `Ada Miles,${phone},ada@example.test`))
      await importing(file('Name,Phone,Email', `A Miles,${phone},typo@example.test`))

      const [before] = await peopleOn(phone)
      const [row] = await heldRowsOn(phone)
      await answer(row!.id, { kind: 'same_person', personId: before!.id })

      expect((await peopleOn(phone))[0]!.email).toBe('ada@example.test')
    })

    it('records who answered, and what they answered', async () => {
      const phone = await collide('Ruth Oyelaran', 'Ruth O')
      const [before] = await peopleOn(phone)
      const [row] = await heldRowsOn(phone)

      await answer(row!.id, { kind: 'same_person', personId: before!.id })

      expect(await heldRowsOn(phone)).toMatchObject([
        {
          answer: 'same_person',
          person_id: before!.id,
          resolved_by: ministry.adminUserId,
        },
      ])
    })
  })

  describe('someone else on this number', () => {
    it('files a second Person on the shared phone', async () => {
      // The couple case ADR-0005 has always protected: the identity index is keyed
      // on the name as well as the number precisely so this is representable.
      const phone = await collide('Sam Okafor', 'Rita Okafor')
      const [row] = await heldRowsOn(phone)

      await answer(row!.id, { kind: 'someone_else' })

      const after = await peopleOn(phone)
      expect(after.map((person) => person.full_name).sort()).toEqual([
        'Rita Okafor',
        'Sam Okafor',
      ])
      // The row carried the email, and the Person created from it keeps it.
      expect(after.find((person) => person.full_name === 'Rita Okafor')!.email).toBe(
        'new@example.test',
      )
    })

    it('records that they were imported, like every other imported Person', async () => {
      const phone = await collide('Nia Brooks', 'Tom Brooks')
      const [row] = await heldRowsOn(phone)

      await answer(row!.id, { kind: 'someone_else' })

      const created = (await peopleOn(phone)).find((person) => person.full_name === 'Tom Brooks')
      const { rows } = await pool.query(
        `select type, subject_type from ministry_event where subject_id = $1`,
        [created!.id],
      )
      expect(rows).toMatchObject([{ type: 'person.imported', subject_type: 'person' }])
    })
  })

  describe('once it has been answered', () => {
    it('refuses a second answer rather than acting on a closed question', async () => {
      // Two Admins on the same report. The second must not rename somebody on the
      // strength of a question the first one already closed.
      const phone = await collide('Peter Adeyemi', 'Pete Adeyemi')
      const [before] = await peopleOn(phone)
      const [row] = await heldRowsOn(phone)

      await answer(row!.id, { kind: 'same_person', personId: before!.id })

      await expect(answer(row!.id, { kind: 'someone_else' })).rejects.toThrow(
        ImportRowResolutionRefused,
      )
      expect(await peopleOn(phone)).toHaveLength(1)
    })

    it('drops out of what the Roster shows, without deleting what was decided', async () => {
      const phone = await collide('Hannah Reid', 'Hana Reid')
      const [before] = await peopleOn(phone)
      const [row] = await heldRowsOn(phone)

      await answer(row!.id, { kind: 'same_person', personId: before!.id })

      const admin = await signInAs(ministry)
      const { data } = await admin.rpc('held_import_rows', {
        target_ministry_id: ministry.id,
      })

      expect(((data ?? []) as { row_id: string }[]).map((held) => held.row_id)).not.toContain(
        row!.id,
      )
      // Kept, not deleted: what a Ministry decided about a congregant's identity is
      // a fact about the Ministry.
      expect(await heldRowsOn(phone)).toHaveLength(1)
    })
  })

  describe('what an Admin sees', () => {
    it('offers one answer per name the number already reaches', async () => {
      // A number may already hold two people, and *the same person* is a different
      // question about each. The read is what the screen builds its buttons from,
      // so it has to name both rather than picking one.
      const phone = await collide('Chris Miller', 'Christopher Miller')
      const [firstRow] = await heldRowsOn(phone)
      await answer(firstRow!.id, { kind: 'someone_else' })

      // Now two people share the number, and a third name arrives on it.
      await importing(file('Name,Phone', `C Miller,${phone}`))

      const admin = await signInAs(ministry)
      const { data, error } = await admin.rpc('held_import_rows', {
        target_ministry_id: ministry.id,
      })
      if (error) throw new Error(error.message)

      const offered = ((data ?? []) as { full_name: string; person_name: string }[]).filter(
        (held) => held.full_name === 'C Miller',
      )
      expect(offered.map((held) => held.person_name).sort()).toEqual([
        'Chris Miller',
        'Christopher Miller',
      ])
    })

    it('never carries a phone number out of the database', async () => {
      // The Roster shows no contact details -- a number is reached through
      // `public.contact_to_share` and nowhere else -- and this read is on the same
      // page under the same rule.
      const phone = await collide('Joy Mensah', 'J Mensah')

      const admin = await signInAs(ministry)
      const { data } = await admin.rpc('held_import_rows', {
        target_ministry_id: ministry.id,
      })

      expect(JSON.stringify(data)).not.toContain(phone)
    })

    it('shows another Ministry nothing', async () => {
      const other = await createMinistryWithAdmin('Southbank Chapel')
      await collide('Ada Southbank', 'A Southbank')

      const stranger = await signInAs(other)
      const { data } = await stranger.rpc('held_import_rows', {
        target_ministry_id: ministry.id,
      })

      expect(data ?? []).toEqual([])
    })
  })
})
