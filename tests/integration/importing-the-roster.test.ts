import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { personId, type IdSource } from '~/domain/ids'
import { RosterFileUnreadable } from '~/domain/errors'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'
import { file, phoneNumbers } from '../support/roster'

/**
 * An Admin uploads a spreadsheet instead of typing their congregation in by hand.
 * Driven through the real command boundary against the real database, because the
 * three claims worth proving are all about what the database will and will not do:
 * nobody is texted, nobody can be paired, and nobody is imported twice.
 */

describe('importing a Roster', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  // Real identifiers: these rows outlive the test file, so a second run of the suite
  // against the same stack would collide with the first on a deterministic id.
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () => createCommandService({ clock, ids, store })

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

  const personByPhone = async (phone: string) => {
    const { rows } = await pool.query(
      `select id, full_name, email, participation_status(person) as status
         from person where ministry_id = $1 and phone = $2`,
      [ministry.id, `+1${phone}`],
    )
    return rows[0]
  }

  it('puts the people in the file onto the Roster', async () => {
    const emily = number()
    const david = number()

    await importing(
      file(
        'Name,Phone,Email',
        `Emily Johnson,${emily},emily@example.test`,
        `David Ellis,${david},`,
      ),
    )

    expect(await personByPhone(emily)).toMatchObject({
      full_name: 'Emily Johnson',
      email: 'emily@example.test',
    })
    expect(await personByPhone(david)).toMatchObject({ full_name: 'David Ellis', email: null })
  })

  it('leaves them reading No Intake Submitted, because a Roster row is not consent', async () => {
    const phone = number()

    await importing(file('Name,Phone', `Grace Lin,${phone}`))

    expect(await personByPhone(phone)).toMatchObject({ status: 'no_intake_submitted' })
  })

  it('enqueues no outbound message to anyone', async () => {
    const before = await pool.query(
      `select count(*)::int as sent from outbound_message where ministry_id = $1`,
      [ministry.id],
    )

    await importing(file('Name,Phone', `Quiet Import,${number()}`))

    const after = await pool.query(
      `select count(*)::int as sent from outbound_message where ministry_id = $1`,
      [ministry.id],
    )
    expect(after.rows[0].sent).toBe(before.rows[0].sent)
  })

  it('records each import in history', async () => {
    const phone = number()

    await importing(file('Name,Phone', `Recorded Import,${phone}`))
    const person = await personByPhone(phone)

    const { rows } = await pool.query(
      `select type, subject_type, payload from ministry_event where subject_id = $1`,
      [person.id],
    )
    expect(rows[0]).toMatchObject({ type: 'person.imported', subject_type: 'person' })
  })

  it('reports the rows it could not read rather than dropping them', async () => {
    const good = number()

    const outcome = await importing(
      file('Name,Phone', `,${number()}`, `No Number Given,`, `Readable,${good}`),
    )

    expect(outcome.rejections).toEqual([
      { line: 2, problem: 'no_name' },
      { line: 3, problem: 'no_phone' },
    ])
    expect(await personByPhone(good)).toBeDefined()
  })

  it('imports nobody twice when the same spreadsheet is uploaded again', async () => {
    const phone = number()
    const twice = file('Name,Phone', `Uploaded Twice,${phone}`)

    await importing(twice)
    const second = await importing(twice)

    expect(second.rejections).toEqual([{ line: 2, problem: 'already_on_the_roster' }])

    const { rows } = await pool.query(
      `select count(*)::int as people from person where ministry_id = $1 and phone = $2`,
      [ministry.id, `+1${phone}`],
    )
    expect(rows[0].people).toBe(1)
  })

  it('imports both people on a shared phone, because a couple is not a duplicate', async () => {
    // See docs/adr/0005-a-person-is-a-name-and-a-number.md. Under an identity keyed
    // on the number alone the wife is silently not imported.
    const shared = number()

    const outcome = await importing(
      file('Name,Phone', `Emily Johnson,${shared}`, `David Johnson,${shared}`),
    )

    expect(outcome.rejections).toEqual([])
    const { rows } = await pool.query(
      `select full_name from person where ministry_id = $1 and phone = $2 order by full_name`,
      [ministry.id, `+1${shared}`],
    )
    expect(rows.map((row) => row.full_name)).toEqual(['David Johnson', 'Emily Johnson'])
  })

  it('leaves the Person already on the Roster exactly as they were', async () => {
    const phone = number()

    await importing(file('Name,Phone,Email', `Original Name,${phone},original@example.test`))
    await importing(file('Name,Phone,Email', `Stale Export,${phone},stale@example.test`))

    expect(await personByPhone(phone)).toMatchObject({
      full_name: 'Original Name',
      email: 'original@example.test',
    })
  })

  it('refuses a file it cannot read at all, and imports none of it', async () => {
    const before = await pool.query(
      `select count(*)::int as people from person where ministry_id = $1`,
      [ministry.id],
    )

    await expect(importing(file('Nickname,Number', 'Em,5550179999'))).rejects.toThrow(
      RosterFileUnreadable,
    )

    const after = await pool.query(
      `select count(*)::int as people from person where ministry_id = $1`,
      [ministry.id],
    )
    expect(after.rows[0].people).toBe(before.rows[0].people)
  })

  it('cannot pair an imported Person, in words an Admin can act on', async () => {
    const phone = number()
    await importing(file('Name,Phone', `Not Yet Asked,${phone}`))
    const imported = await personByPhone(phone)

    const leader = await addPerson(ministry, 'Willing Leader')

    await expect(
      service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderId: personId(leader),
        participantIds: [personId(imported.id)],
      }),
    ).rejects.toThrow(new PairingRefused('relationship.participant_has_not_completed_intake'))
  })

  it('cannot send an imported Person a check-in, or anything else', async () => {
    const phone = number()
    await importing(file('Name,Phone', `Never Texted,${phone}`))
    const imported = await personByPhone(phone)

    const { error } = await serviceRoleClient()
      .from('outbound_message')
      .insert({
        ministry_id: ministry.id,
        person_id: imported.id,
        to_phone: `+1${phone}`,
        body: 'Riverside Chapel: did you meet this week?',
        enqueued_at: new Date().toISOString(),
      })

    expect(error?.message).toMatch(/has not consented/)
  })

  it('imports into one Ministry and no other, even for the same number', async () => {
    const shared = number()
    const northgate = await createMinistryWithAdmin('Northgate Community Church')

    await importing(file('Name,Phone', `Two Congregations,${shared}`))
    await createCommandService({ clock, ids, store }).execute({
      type: 'person.import',
      ministryId: northgate.id,
      csv: file('Name,Phone', `Two Congregations,${shared}`),
    })

    // One human, two Ministries, two Person rows that share nothing.
    const { rows } = await pool.query(
      `select ministry_id from person
        where phone = $1 and ministry_id = any($2::uuid[]) order by ministry_id`,
      [`+1${shared}`, [ministry.id, northgate.id]],
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.ministry_id))).toEqual(
      new Set([ministry.id, northgate.id]),
    )
  })
})
