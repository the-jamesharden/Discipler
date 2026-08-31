import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { DepartureRefused, EndingRefused } from '~/domain/errors'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  optOut,
  pairOneToOne,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Ending a relationship and one Participant leaving one, against the real
 * database. The assertions that matter are what the Roster says afterwards and
 * what the history still holds: a relationship that ran and finished is an
 * outcome, and nothing about it is deleted by its ending.
 */

describe('ending a relationship, and a Participant leaving one', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const acceptedAt = new Date('2026-03-02T09:00:00Z')
  let clock = createTestClock(acceptedAt)
  const restart = () => {
    clock = createTestClock(new Date(acceptedAt.getTime() + days(150)))
  }
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

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const roster = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aNumber() }))

  /** One Leader and however many Participants, accepted and running. */
  const aGroup = async (leader: PersonId, participants: readonly PersonId[]) => {
    const id = await createRelationship(ministry, 'group', { acceptedAt })
    await addMembership({
      ministry,
      relationshipId: id,
      kind: 'group',
      personId: leader,
      role: 'leader',
      startedAt: acceptedAt,
    })
    for (const participant of participants) {
      await addMembership({
        ministry,
        relationshipId: id,
        kind: 'group',
        personId: participant,
        role: 'participant',
        startedAt: acceptedAt,
      })
    }
    return relationshipId(id)
  }

  const end = (
    relationship: ReturnType<typeof relationshipId>,
    over: { reason?: string; outcome?: 'completed' | 'discontinued'; endedBy?: string } = {},
  ) =>
    service().execute({
      type: 'relationship.end',
      ministryId: ministry.id,
      relationshipId: relationship,
      reason: over.reason ?? 'They finished the material together.',
      outcome: over.outcome ?? 'completed',
      endedBy: over.endedBy ?? ministry.adminUserId,
    })

  const depart = (
    relationship: ReturnType<typeof relationshipId>,
    person: PersonId,
    by: string = ministry.adminUserId,
  ) =>
    service().execute({
      type: 'relationship.depart',
      ministryId: ministry.id,
      relationshipId: relationship,
      personId: person,
      departedBy: by,
    })

  /**
   * As the Roster shows it, derived rather than stored -- and read the way the
   * Roster reads it, through `public.roster`. Since ticket 15 no browser session
   * holds SELECT on every column of `person`, so the derivation cannot be asked for
   * as a computed column on the row.
   */
  const statusOf = async (person: PersonId) => {
    const client = await signInAs(ministry)
    const { data, error } = await client.rpc('roster', { target_ministry_id: ministry.id })
    if (error) throw new Error(error.message)
    const row = (data as { person_id: string; participation_status: string }[]).find(
      (entry) => entry.person_id === person,
    )
    if (!row) throw new Error(`${person} is not on the Roster`)
    return row.participation_status
  }

  const membershipsOf = async (relationship: string) =>
    (
      await pool.query<{
        person_id: string
        role: string
        ended_at: Date | null
        departed_by: string | null
      }>(
        `select person_id, role, ended_at, departed_by from relationship_member
          where relationship_id = $1 order by role, started_at`,
        [relationship],
      )
    ).rows

  it('closes every open membership and returns the Participants to the pool', async () => {
    restart()
    const leader = await roster('David Ellis')
    const emily = await roster('Emily Johnson')
    const fiona = await roster('Fiona Grant')
    const relationship = await aGroup(leader, [emily, fiona])

    expect(await statusOf(emily)).toBe('paired')

    await end(relationship)

    // Pairable again, which is the whole of what ending returns them to.
    expect(await statusOf(emily)).toBe('ready_to_pair')
    expect(await statusOf(fiona)).toBe('ready_to_pair')

    // And no open membership is left behind on a relationship that has ended --
    // the invariant the one ending function exists to hold.
    const open = (await membershipsOf(relationship)).filter((row) => row.ended_at === null)
    expect(open).toEqual([])
  })

  it('leaves the Leader where they were, because leading never set their status', async () => {
    restart()
    const leader = await roster('Grace Miller')
    const participant = await roster('Hannah Reed')
    const relationship = await aGroup(leader, [participant])

    // Not `Paired` while they lead it, and not changed by the ending either.
    expect(await statusOf(leader)).toBe('ready_to_pair')
    await end(relationship)
    expect(await statusOf(leader)).toBe('ready_to_pair')
  })

  it('returns nobody who is opted out, or who is still in another relationship', async () => {
    restart()
    const leader = await roster('Isaac Prince')
    const julia = await roster('Julia North')
    const kofi = await roster('Kofi Mensah')
    const relationship = await aGroup(leader, [julia, kofi])

    // Julia is also being discipled elsewhere; Kofi has texted STOP.
    await pairOneToOne(ministry, await roster('Liam Walsh'), julia)
    await optOut(ministry, kofi)

    await end(relationship)

    // Both fall out of the derivation with no special case in the ending: one
    // still holds an open participant membership, and the other has said no.
    expect(await statusOf(julia)).toBe('paired')
    expect(await statusOf(kofi)).toBe('opted_out')
  })

  it('records the outcome, the reason and the acting Admin', async () => {
    restart()
    const relationship = await aGroup(await roster('Maya Silva'), [await roster('Noah Pike')])

    await end(relationship, { reason: 'They stopped meeting.', outcome: 'discontinued' })

    const { rows } = await pool.query<{
      ended_at: Date
      ended_reason: string
      ended_outcome: string
      ended_by: string
    }>(
      `select ended_at, ended_reason, ended_outcome, ended_by
         from relationship where id = $1`,
      [relationship],
    )
    expect(rows[0]).toMatchObject({
      ended_reason: 'They stopped meeting.',
      ended_outcome: 'discontinued',
      ended_by: ministry.adminUserId,
    })

    // And in history, which is append-only and outlives the membership -- the
    // column is nulled if the Admin later leaves the Ministry; this is not.
    const { rows: events } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'relationship.ended'`,
      [relationship],
    )
    expect(events[0]?.payload).toMatchObject({
      reason: 'They stopped meeting.',
      outcome: 'discontinued',
      endedBy: ministry.adminUserId,
    })
  })

  it('is terminal: a second ending is refused and the first record stands', async () => {
    restart()
    const relationship = await aGroup(await roster('Omar Haddad'), [await roster('Petra Lang')])
    await end(relationship, { reason: 'The first reason.', outcome: 'completed' })

    await expect(
      end(relationship, { reason: 'A second reason.', outcome: 'discontinued' }),
    ).rejects.toThrow(expect.objectContaining({ refusal: 'ending.already_ended' }))

    const { rows } = await pool.query<{ ended_reason: string; ended_outcome: string }>(
      `select ended_reason, ended_outcome from relationship where id = $1`,
      [relationship],
    )
    expect(rows[0]).toMatchObject({
      ended_reason: 'The first reason.',
      ended_outcome: 'completed',
    })
  })

  it('refuses an Admin who is not in this Ministry', async () => {
    restart()
    const relationship = await aGroup(await roster('Quinn Doyle'), [await roster('Rosa Neri')])
    const elsewhere = await createMinistryWithAdmin('Northside Fellowship')

    await expect(end(relationship, { endedBy: elsewhere.adminUserId })).rejects.toThrow(
      expect.objectContaining({ refusal: 'ending.ender_is_not_in_this_ministry' }),
    )

    // Nothing was half-done: the relationship stands and everyone is still in it.
    const open = (await membershipsOf(relationship)).filter((row) => row.ended_at === null)
    expect(open).toHaveLength(2)
  })

  it('refuses a relationship nobody has accepted, which is a cancellation', async () => {
    restart()
    const leader = await roster('Sam Whitfield')
    const participant = await roster('Tara Oduya')
    const relationship = relationshipId(
      await pairOneToOne(ministry, leader, participant, { acceptedAt: null }),
    )

    await expect(end(relationship)).rejects.toThrow(
      expect.objectContaining({ refusal: 'ending.relationship_not_accepted' }),
    )
  })

  it('refuses a relationship this Ministry does not hold', async () => {
    restart()
    await expect(
      end(relationshipId('00000000-0000-4000-8000-0000000000ff')),
    ).rejects.toThrow(expect.objectContaining({ refusal: 'ending.relationship_not_found' }))
  })

  it('preserves the ended relationship\'s history exactly as it was recorded', async () => {
    restart()
    const leader = await roster('Uma Blake')
    const participant = await roster('Victor Sands')
    const relationship = await aGroup(leader, [participant])

    await service().execute({
      type: 'checkin.start',
      ministryId: ministry.id,
      personId: leader,
    })
    await service().execute({
      type: 'sms.inbound',
      ministryId: ministry.id,
      personId: leader,
      body: '1',
    })

    const before = await pool.query(
      `select id, relationship_id, question, asked_at, answered_at, met
         from checkin_prompt where relationship_id = $1 order by step`,
      [relationship],
    )
    const historyBefore = await pool.query(
      `select id, type, occurred_at, payload from ministry_event
        where subject_id = $1 order by recorded_at`,
      [relationship],
    )
    expect(before.rows.length).toBeGreaterThan(0)

    await end(relationship)

    // The weeks and the events are exactly what they were. Ending appends a fact;
    // it rewrites none.
    const after = await pool.query(
      `select id, relationship_id, question, asked_at, answered_at, met
         from checkin_prompt where relationship_id = $1 order by step`,
      [relationship],
    )
    expect(after.rows).toEqual(before.rows)

    const historyAfter = await pool.query(
      `select id, type, occurred_at, payload from ministry_event
        where subject_id = $1 order by recorded_at`,
      [relationship],
    )
    expect(historyAfter.rows.slice(0, historyBefore.rows.length)).toEqual(historyBefore.rows)
    expect(historyAfter.rows.at(-1)).toMatchObject({ type: 'relationship.ended' })
  })

  it('refuses an ending with no outcome, as it already refuses one with no reason', async () => {
    restart()
    const relationship = await aGroup(await roster('Wendy Cole'), [await roster('Xavier Bright')])

    await expect(
      pool.query(
        `update relationship set ended_at = now(), ended_reason = 'by hand' where id = $1`,
        [relationship],
      ),
    ).rejects.toThrow(/relationship_ended_carries_an_outcome/)
  })

  it('refuses an open membership left standing on a relationship that has ended', async () => {
    restart()
    const relationship = await aGroup(await roster('Yara Nasser'), [await roster('Zach Rowley')])

    // The one write path that ends a relationship closes the memberships with it.
    // This is what happens to anything that tries to do half of that: the deferred
    // constraint refuses the transaction at commit, whoever wrote it and however.
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `update relationship
            set ended_at = now(), ended_reason = 'by hand', ended_outcome = 'completed'
          where id = $1`,
        [relationship],
      )
      await expect(client.query('commit')).rejects.toThrow(
        /relationship_has_no_open_membership_after_it_ends|has ended and cannot hold an open membership/,
      )
    } finally {
      await client.query('rollback').catch(() => undefined)
      client.release()
    }

    // And the ending never landed, so the relationship is still running.
    const { rows } = await pool.query<{ ended_at: Date | null }>(
      `select ended_at from relationship where id = $1`,
      [relationship],
    )
    expect(rows[0]?.ended_at).toBeNull()
  })

  it('refuses readmitting anyone to a relationship that has ended', async () => {
    restart()
    const leader = await roster('Aaron Vale')
    const participant = await roster('Bea Lindqvist')
    const relationship = await aGroup(leader, [participant])
    await end(relationship)

    await expect(
      addMembership({
        ministry,
        relationshipId: relationship,
        kind: 'group',
        personId: await roster('Cara Bishop'),
        role: 'participant',
      }),
    ).rejects.toThrow(/has ended and cannot hold an open membership/)
  })

  describe('one Participant leaving', () => {
    it('dates their membership and leaves the relationship running', async () => {
      restart()
      const leader = await roster('Dan Ferreira')
      const eve = await roster('Eve Marchetti')
      const finn = await roster('Finn O\'Leary')
      const relationship = await aGroup(leader, [eve, finn])

      await depart(relationship, eve)

      // The relationship is untouched. One Participant leaving does not end it for
      // everyone else.
      const { rows } = await pool.query<{ ended_at: Date | null }>(
        `select ended_at from relationship where id = $1`,
        [relationship],
      )
      expect(rows[0]?.ended_at).toBeNull()

      // Their membership carries an end date rather than being deleted, and
      // nobody else's moved.
      const memberships = await membershipsOf(relationship)
      expect(memberships).toHaveLength(3)
      expect(memberships.find((row) => row.person_id === eve)?.ended_at).not.toBeNull()
      expect(memberships.find((row) => row.person_id === finn)?.ended_at).toBeNull()
      expect(memberships.find((row) => row.person_id === leader)?.ended_at).toBeNull()

      // And they are pairable again, while the Participant who stayed is not.
      expect(await statusOf(eve)).toBe('ready_to_pair')
      expect(await statusOf(finn)).toBe('paired')

      const { rows: events } = await pool.query<{ payload: Record<string, unknown> }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'relationship.participant_departed'`,
        [relationship],
      )
      expect(events[0]?.payload).toMatchObject({
        personId: eve,
        departedBy: ministry.adminUserId,
      })
    })

    it('leaves their past weeks attached to the relationship', async () => {
      restart()
      const leader = await roster('Gita Raman')
      const hugo = await roster('Hugo Lindberg')
      const ines = await roster('Ines Kovac')
      const relationship = await aGroup(leader, [hugo, ines])

      await service().execute({
        type: 'checkin.start',
        ministryId: ministry.id,
        personId: leader,
      })
      await service().execute({
        type: 'sms.inbound',
        ministryId: ministry.id,
        personId: leader,
        body: '1',
      })

      const weeksBefore = await pool.query(
        `select relationship_id, opened_at, answered_at
           from relationship_weeks($1) where relationship_id = $2`,
        [ministry.id, relationship],
      )
      expect(weeksBefore.rows).toHaveLength(1)

      await depart(relationship, hugo)

      // History is not rewritten by somebody leaving: the week they were present
      // for is still the relationship's week, answered when it was answered.
      const weeksAfter = await pool.query(
        `select relationship_id, opened_at, answered_at
           from relationship_weeks($1) where relationship_id = $2`,
        [ministry.id, relationship],
      )
      expect(weeksAfter.rows).toEqual(weeksBefore.rows)
    })

    it('gives a readmitted Participant a second membership, and keeps the first closed', async () => {
      restart()
      const leader = await roster('Jonah Pierce')
      const kira = await roster('Kira Nowak')
      const lena = await roster('Lena Fischer')
      const relationship = await aGroup(leader, [kira, lena])

      await depart(relationship, kira)
      await addMembership({
        ministry,
        relationshipId: relationship,
        kind: 'group',
        personId: kira,
        role: 'participant',
        startedAt: new Date(acceptedAt.getTime() + days(200)),
      })

      const hers = (await membershipsOf(relationship)).filter((row) => row.person_id === kira)

      // Two rows, and the first is intact rather than reopened -- reopening would
      // rewrite the months they were away as months they were present.
      expect(hers).toHaveLength(2)
      expect(hers.filter((row) => row.ended_at === null)).toHaveLength(1)
      expect(hers.filter((row) => row.ended_at !== null)).toHaveLength(1)
    })

    it('takes the departed Participant out of the check-in question', async () => {
      restart()
      const leader = await roster('Mira Solberg')
      const nils = await roster('Nils Aune')
      const orla = await roster('Orla Byrne')
      const relationship = await aGroup(leader, [nils, orla])

      await service().execute({
        type: 'checkin.start',
        ministryId: ministry.id,
        personId: leader,
      })

      const asked = async () => {
        const { rows } = await pool.query<{ body: string }>(
          `select body from outbound_message where person_id = $1
            order by enqueued_at desc, created_at desc limit 1`,
          [leader],
        )
        return rows[0]?.body ?? ''
      }

      expect(await asked()).toContain('Nils Aune and Orla Byrne')

      await depart(relationship, nils)
      await service().execute({
        type: 'checkin.start',
        ministryId: ministry.id,
        personId: leader,
      })

      // The copy follows the Participants who remain, with no group-versus-one-to-one
      // branch anywhere: a group of two that becomes a group of one is asked about by
      // name, exactly as a one-to-one is.
      expect(await asked()).toContain('Did you meet with Orla Byrne this week?')
    })

    it('refuses the last Participant leaving, and the Leader leaving', async () => {
      restart()
      const leader = await roster('Pia Grimaldi')
      const quentin = await roster('Quentin Ashby')
      const relationship = await aGroup(leader, [quentin])

      await expect(depart(relationship, quentin)).rejects.toThrow(
        expect.objectContaining({ refusal: 'departure.would_leave_no_participants' }),
      )
      await expect(depart(relationship, leader)).rejects.toThrow(
        expect.objectContaining({ refusal: 'departure.person_is_a_leader' }),
      )

      // Both refused, and nobody left: the relationship is exactly as it was.
      const open = (await membershipsOf(relationship)).filter((row) => row.ended_at === null)
      expect(open).toHaveLength(2)
    })

    it('refuses somebody who is not in the relationship, and one that has ended', async () => {
      restart()
      const leader = await roster('Rafe Donnelly')
      const sara = await roster('Sara Villalobos')
      const tomas = await roster('Tomas Ruiz')
      const stranger = await roster('Ursula Klein')
      const relationship = await aGroup(leader, [sara, tomas])

      await expect(depart(relationship, stranger)).rejects.toThrow(
        expect.objectContaining({
          refusal: 'departure.person_is_not_in_this_relationship',
        }),
      )

      await end(relationship)
      await expect(depart(relationship, sara)).rejects.toThrow(
        expect.objectContaining({ refusal: 'departure.relationship_ended' }),
      )
    })

    it('refuses a departure from a relationship nobody has accepted', async () => {
      restart()
      const leader = await roster('Wren Adeyemi')
      const first = await roster('Xan Petrov')
      const second = await roster('Yusuf Demir')
      const relationship = await createRelationship(ministry, 'group', { acceptedAt: null })
      for (const [person, role] of [
        [leader, 'leader'],
        [first, 'participant'],
        [second, 'participant'],
      ] as const) {
        await addMembership({
          ministry,
          relationshipId: relationship,
          kind: 'group',
          personId: person,
          role,
        })
      }

      await expect(depart(relationshipId(relationship), first)).rejects.toThrow(
        expect.objectContaining({ refusal: 'departure.relationship_not_accepted' }),
      )
    })

    it('records the Admin who removed them, and refuses one from another Ministry', async () => {
      restart()
      const leader = await roster('Ada Lindqvist')
      const bruno = await roster('Bruno Sarti')
      const cleo = await roster('Cleo Nakamura')
      const relationship = await aGroup(leader, [bruno, cleo])
      const elsewhere = await createMinistryWithAdmin('Northside Fellowship')

      // Removing somebody from a relationship is an Admin act on other people's
      // ministry, so it carries the standing an ending carries. An account alone is
      // not it, and the composite key onto `ministry_member` is what says so.
      await expect(depart(relationship, bruno, elsewhere.adminUserId)).rejects.toThrow(
        expect.objectContaining({ refusal: 'departure.departer_is_not_in_this_ministry' }),
      )
      expect(
        (await membershipsOf(relationship)).filter((row) => row.ended_at === null),
      ).toHaveLength(3)

      await depart(relationship, bruno)

      // `departed_by` is also what tells the two ways a membership closes apart. The
      // ending below closes Cleo's and the Leader's with nobody named against them,
      // because nobody removed them -- the relationship finished.
      const departed = (await membershipsOf(relationship)).find(
        (row) => row.person_id === bruno,
      )
      expect(departed).toMatchObject({ departed_by: ministry.adminUserId })

      await end(relationship)
      const closedByTheEnding = (await membershipsOf(relationship)).filter(
        (row) => row.person_id !== bruno,
      )
      expect(closedByTheEnding).toHaveLength(2)
      for (const row of closedByTheEnding) {
        expect(row.ended_at).not.toBeNull()
        expect(row.departed_by).toBeNull()
      }
    })

    it('tells a departure that lost a race to an ending which one it lost', async () => {
      restart()
      const leader = await roster('Dara Okonjo')
      const esme = await roster('Esme Fontaine')
      const felix = await roster('Felix Berg')
      const relationship = await aGroup(leader, [esme, felix])

      await end(relationship)

      // The store reached as the loser of a race reaches it: the boundary decided
      // from a snapshot in which the relationship was live, and it ended before this
      // write landed. Every membership is already closed, so the update finds nothing
      // -- and *nothing to close* is not the same fact as *this Person was never in
      // it*. An Admin told the second would go looking for a Person who is right
      // there in the relationship they are staring at.
      await expect(
        store.transact(ministry.id, (unit) =>
          unit.departFromRelationship({
            ministryId: ministry.id,
            relationshipId: relationship,
            personId: esme,
            departedAt: clock.now(),
            departedBy: ministry.adminUserId,
          }),
        ),
      ).rejects.toThrow(expect.objectContaining({ refusal: 'departure.relationship_ended' }))
    })

    it('refuses a departure from a relationship this Ministry does not hold', async () => {
      restart()
      await expect(
        depart(relationshipId('00000000-0000-4000-8000-0000000000fe'), await roster('Vic Tan')),
      ).rejects.toThrow(
        expect.objectContaining({ refusal: 'departure.relationship_not_found' }),
      )
    })
  })

  it('refuses through the classes a surface catches, not as bare errors', async () => {
    restart()
    const relationship = await aGroup(await roster('Wes Tanaka'), [await roster('Yuki Sato')])
    await end(relationship)

    await expect(end(relationship)).rejects.toThrow(EndingRefused)
    await expect(depart(relationship, await roster('Zoe Amari'))).rejects.toThrow(
      DepartureRefused,
    )
  })
})
