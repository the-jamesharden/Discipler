import type { SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMembership,
  addPerson,
  addPersonForAdmin,
  addPersonWithAccount,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A Leader reaches the relationships they lead and nothing else, and that is enforced
 * where Ministry isolation already is rather than by the application remembering to
 * filter. Two properties are load-bearing here and neither is obvious from the
 * policies alone:
 *
 *   - Access follows *membership*, never `ministry_member.tier`. An Admin who leads
 *     holds one row and it says `admin`, so a surface gated on tier = 'leader' would
 *     hide their own relationships from them.
 *   - Being discipled grants nothing. A Participant with an account reads none of the
 *     relationship they are a Participant in, and leading elsewhere does not change
 *     that by a single row.
 */

describe('what a Leader can reach', () => {
  let riverside: MinistryFixture
  let northgate: MinistryFixture
  let pool: pg.Pool

  // An Admin who leads two relationships and is discipled in a third.
  let greaves: AccountFixture
  let greavesLeads: [string, string]
  let greavesIsDiscipledIn: string

  // A Leader-tier account: leads a group and a one-to-one.
  let karen: AccountFixture
  let karensGroup: string

  // A Leader-tier account who is also a Participant in Karen's group.
  let mo: AccountFixture
  let mosGroup: string

  let ada: string

  let asGreaves: SupabaseClient
  let asKaren: SupabaseClient
  let asMo: SupabaseClient

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    northgate = await createMinistryWithAdmin('Northgate Community Church')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    greaves = await addPersonForAdmin(riverside, 'James Greaves')
    karen = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader')
    mo = await addPersonWithAccount(riverside, 'Mo Farah', 'leader')
    ada = await addPerson(riverside, 'Ada Rowe')
    const ben = await addPerson(riverside, 'Ben Okafor')

    const lead = async (personId: string, kind: 'one_to_one' | 'group', participants: string[]) => {
      const relationshipId = await createRelationship(riverside, kind)
      await addMembership({ ministry: riverside, relationshipId, kind, personId, role: 'leader' })
      for (const participant of participants) {
        await addMembership({
          ministry: riverside,
          relationshipId,
          kind,
          personId: participant,
          role: 'participant',
        })
      }
      return relationshipId
    }

    greavesLeads = [
      await lead(greaves.personId, 'one_to_one', [ada]),
      await lead(greaves.personId, 'one_to_one', [ben]),
    ]
    greavesIsDiscipledIn = await lead(karen.personId, 'one_to_one', [greaves.personId])
    karensGroup = await lead(karen.personId, 'group', [mo.personId, ada])
    mosGroup = await lead(mo.personId, 'group', [ben])

    asGreaves = await signInAs(riverside)
    asKaren = await signInWith(karen)
    asMo = await signInWith(mo)
  })

  afterAll(async () => {
    await pool.end()
  })

  /** The Leader Dashboard's own query: relationships this account holds an open leader membership on. */
  const leaderSurfaceFor = async (account: AccountFixture): Promise<string[]> => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role authenticated')
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: account.userId, role: 'authenticated' }),
      ])
      const { rows } = await client.query<{ id: string }>(
        `select id from relationship where app.leads_relationship(id) order by created_at`,
      )
      return rows.map((row) => row.id)
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  const idsOf = (result: { data: { id: string }[] | null }) =>
    (result.data ?? []).map((row) => row.id).sort()

  it('shows an Admin who leads both surfaces in one session', async () => {
    // The Admin half: the whole Roster, because Admin is ministry-wide.
    const roster = await asGreaves.from('person').select('id')
    expect(idsOf(roster)).toContain(ada)

    // The Leader half: exactly the two he leads, from the same session and the same
    // single `ministry_member` row -- which says `admin`, not `leader`.
    expect((await leaderSurfaceFor(greaves)).sort()).toEqual([...greavesLeads].sort())
  })

  it('does not put the relationship an Admin is discipled in on their Leader surface', async () => {
    expect(await leaderSurfaceFor(greaves)).not.toContain(greavesIsDiscipledIn)
  })

  it('lets a Leader read only the relationships they lead', async () => {
    const relationships = await asKaren.from('relationship').select('id')

    expect(idsOf(relationships)).toEqual([greavesIsDiscipledIn, karensGroup].sort())
  })

  it('no longer hands a Leader the whole Roster', async () => {
    const people = await asKaren.from('person').select('id, full_name')

    // Herself, and the people in the relationships she leads. Nobody else.
    expect(idsOf(people)).toEqual([karen.personId, greaves.personId, mo.personId, ada].sort())
  })

  it('grants a Participant with an account nothing in the relationship discipling them', async () => {
    const relationships = await asMo.from('relationship').select('id')

    // Mo is a Participant in Karen's group. Leading his own group grants him nothing
    // there: not the relationship, not its members, not the other Participants.
    expect(idsOf(relationships)).toEqual([mosGroup])

    const members = await asMo.from('relationship_member').select('id, relationship_id')
    expect((members.data ?? []).map((row) => row.relationship_id)).toEqual([mosGroup, mosGroup])

    const people = await asMo.from('person').select('id')
    expect(idsOf(people)).not.toContain(ada)
    expect(idsOf(people)).not.toContain(karen.personId)
  })

  it('grants a Leader in one Ministry nothing in another', async () => {
    const theirs = await addPerson(northgate, 'Jonah Park')

    const people = await asKaren.from('person').select('id')
    const relationships = await asKaren.from('relationship').select('id, ministry_id')

    expect(idsOf(people)).not.toContain(theirs)
    expect(
      (relationships.data ?? []).filter((row) => row.ministry_id === northgate.id),
    ).toEqual([])
  })

  it('keeps ministry-wide records to the Admin', async () => {
    const leadersHistory = await asKaren.from('ministry_event').select('id')
    const leadersOutbox = await asKaren.from('outbound_message').select('id')

    // The Leader Dashboard carries no message history by design, and a Leader has no
    // view onto the Ministry's outbound queue.
    expect(leadersHistory.data).toEqual([])
    expect(leadersOutbox.data).toEqual([])
  })

  it('stops showing the Leader surface when the last leader membership closes', async () => {
    const before = await leaderSurfaceFor(mo)
    expect(before).toEqual([mosGroup])

    await pool.query(
      `update relationship_member set ended_at = now()
        where person_id = $1 and role = 'leader' and ended_at is null`,
      [mo.personId],
    )

    // Nothing was revoked: the query simply stops matching, which is the point of
    // deriving the surface instead of storing who is a Leader.
    expect(await leaderSurfaceFor(mo)).toEqual([])

    const relationships = await asMo.from('relationship').select('id')
    expect(relationships.data).toEqual([])
  })
})
