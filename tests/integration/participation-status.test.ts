import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMembership,
  addPerson,
  addPersonForAdmin,
  addPersonWithAccount,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  optOut,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Participation Status answers one question -- *is this person being discipled* --
 * and it is derived, never stored. One SQL function over Intake, consent and open
 * participant memberships, so there is no second copy of the rule to disagree with
 * the first and no flag an importer could set by accident.
 *
 * The case that matters most is the one that looks like a bug: a man leading two
 * relationships and discipled by nobody reads `Ready to Pair`, because leading is
 * not being discipled and never was.
 */

describe('Participation Status', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  /** Read on a trusted connection, the way the derivation's own tests should read it. */
  const statusOf = async (personId: string): Promise<string | null> => {
    const { rows } = await pool.query(
      `select participation_status(p) as status from person p where p.id = $1`,
      [personId],
    )
    return rows[0]?.status ?? null
  }

  /**
   * Read as a signed-in account, with the Person row forged rather than fetched.
   * Fetching it would be filtered by row-level security and would prove nothing
   * about the function's own guard -- which is the thing standing between a Leader
   * and the status of anybody they have no business seeing.
   */
  const statusAsSignedIn = async (userId: string, personId: string): Promise<string | null> => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows: source } = await client.query(`select to_jsonb(p) as row from person p where p.id = $1`, [
        personId,
      ])
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
      await client.query('set local role authenticated')

      const { rows } = await client.query(
        `select participation_status(jsonb_populate_record(null::person, $1::jsonb)) as status`,
        [source[0].row],
      )
      return rows[0]?.status ?? null
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  it('reads No Intake Submitted for someone who is only on the Roster', async () => {
    const imported = await addPerson(ministry, 'Only Imported', { intake: false })

    expect(await statusOf(imported)).toBe('no_intake_submitted')
  })

  it('reads Ready to Pair once Intake and SMS consent are both on file', async () => {
    const asked = await addPerson(ministry, 'Completed Intake')

    expect(await statusOf(asked)).toBe('ready_to_pair')
  })

  it('reads No Intake Submitted for a submission carrying no SMS consent', async () => {
    // Discipler sends nothing to anyone whose record lacks it, so a submission on
    // its own does not make somebody pairable.
    const partial = await addPerson(ministry, 'Half Way', { intake: false })
    await completeIntake(ministry, partial, ['contact_sharing'])

    expect(await statusOf(partial)).toBe('no_intake_submitted')
  })

  it('reads Paired for an open participant membership', async () => {
    const leader = await addPerson(ministry, 'Their Leader')
    const participant = await addPerson(ministry, 'Being Discipled')
    const relationship = await createRelationship(ministry, 'one_to_one')

    await addMembership({ ministry, relationshipId: relationship, kind: 'one_to_one', personId: leader, role: 'leader' })
    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: participant,
      role: 'participant',
    })

    expect(await statusOf(participant)).toBe('paired')
  })

  it('never sets it from leading: two relationships led, and still Ready to Pair', async () => {
    // The case an Admin will read as a bug unless the screen explains it. The
    // Roster is answering whether *he* is being discipled, and he is not.
    const leader = await addPerson(ministry, 'Leads Two')

    for (const name of ['Led One', 'Led Two']) {
      const participant = await addPerson(ministry, name)
      const relationship = await createRelationship(ministry, 'one_to_one')
      await addMembership({ ministry, relationshipId: relationship, kind: 'one_to_one', personId: leader, role: 'leader' })
      await addMembership({
        ministry,
        relationshipId: relationship,
        kind: 'one_to_one',
        personId: participant,
        role: 'participant',
      })
    }

    expect(await statusOf(leader)).toBe('ready_to_pair')
  })

  it('returns to Ready to Pair when the last participant membership closes', async () => {
    const leader = await addPerson(ministry, 'Finished Leading')
    const participant = await addPerson(ministry, 'Finished Being Discipled')
    const relationship = await createRelationship(ministry, 'one_to_one')

    await addMembership({ ministry, relationshipId: relationship, kind: 'one_to_one', personId: leader, role: 'leader' })
    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: participant,
      role: 'participant',
      startedAt: new Date('2026-01-05T09:00:00Z'),
      endedAt: new Date('2026-06-05T09:00:00Z'),
    })

    expect(await statusOf(participant)).toBe('ready_to_pair')
  })

  it('reads Opted Out ahead of everything else, without ending the relationship', async () => {
    const leader = await addPerson(ministry, 'Still Their Leader')
    const participant = await addPerson(ministry, 'Said Stop')
    const relationship = await createRelationship(ministry, 'one_to_one')

    await addMembership({ ministry, relationshipId: relationship, kind: 'one_to_one', personId: leader, role: 'leader' })
    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: participant,
      role: 'participant',
    })
    await optOut(ministry, participant)

    expect(await statusOf(participant)).toBe('opted_out')

    // Opting out does not silently end what they are in.
    const { rows } = await pool.query(
      `select count(*)::int as open from relationship_member
        where person_id = $1 and ended_at is null`,
      [participant],
    )
    expect(rows[0].open).toBe(1)
  })

  it('tells an Admin the status of anyone in their Ministry', async () => {
    const imported = await addPerson(ministry, 'Admin Can See', { intake: false })

    expect(await statusAsSignedIn(ministry.adminUserId, imported)).toBe('no_intake_submitted')
  })

  it('tells a Leader the status of the people they lead', async () => {
    const leader = await addPersonWithAccount(ministry, 'Reading Leader', 'leader')
    const participant = await addPerson(ministry, 'Their Participant')
    const relationship = await createRelationship(ministry, 'one_to_one')

    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: leader.personId,
      role: 'leader',
    })
    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: participant,
      role: 'participant',
    })

    expect(await statusAsSignedIn(leader.userId, participant)).toBe('paired')
  })

  it('tells a Leader nothing about a Person they do not lead', async () => {
    const leader = await addPersonWithAccount(ministry, 'Unrelated Leader', 'leader')
    const stranger = await addPerson(ministry, 'Somebody Else', { intake: false })

    // Not merely filtered out of a query -- the derivation itself declines, so a
    // forged row is no better than an honest one.
    expect(await statusAsSignedIn(leader.userId, stranger)).toBeNull()
  })

  it('tells another Ministry nothing at all', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')
    const ours = await addPerson(ministry, 'Ours Alone', { intake: false })

    expect(await statusAsSignedIn(northgate.adminUserId, ours)).toBeNull()
  })

  it('reads Ready to Pair for an Admin who leads and is discipled by nobody', async () => {
    // The dual-role case: one Person row, one `admin` access tier, two relationships
    // led. Being discipled is a separate fact and it is absent.
    const pastor = await addPersonForAdmin(ministry, 'Pastor Who Leads')
    const participant = await addPerson(ministry, 'The Pastor Disciples Them')
    const relationship = await createRelationship(ministry, 'one_to_one')

    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: pastor.personId,
      role: 'leader',
    })
    await addMembership({
      ministry,
      relationshipId: relationship,
      kind: 'one_to_one',
      personId: participant,
      role: 'participant',
    })

    expect(await statusOf(pastor.personId)).toBe('ready_to_pair')
  })
})
