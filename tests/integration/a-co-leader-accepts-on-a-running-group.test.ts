import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days, systemClock, type Clock } from '~/domain/clock'
import { personId, relationshipId, type IdSource } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresInvitationReader } from '~/platform/supabase/invitation-reader'
import { createCommandService } from '~/service/command-service'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pauseRelationship,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, recut ticket 01; decided by James on 2026-09-20. A Discipler an
 * Admin added to a group accepts on their Invitation Link, and where the group is
 * already running that records their Acceptance and nothing else: no second
 * activation, no second Starter Message, nothing to the Disciples and nothing to
 * the leaders it already has.
 */
describe('a co-leader accepts on a group already running', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresInvitationReader>
  let pool: pg.Pool
  const ids: IdSource = { next: () => crypto.randomUUID() }
  // The real clock, except where a test is about days passing: a pinned one beside
  // fixtures stamped with the real one is a date bomb.
  const service = (clock: Clock = systemClock) =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  let numbered = 0
  const named = (first: string) => `${first} Coleads${++numbered}`

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresInvitationReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  const aGroup = async (over: { accepted?: boolean; in?: MinistryFixture } = {}) => {
    const leaderName = named('Grace')
    const discipleNames = [named('Emil'), named('Felix')]
    const group = await formGroup(over.in ?? ministry, {
      name: `Thursday Table ${++numbered}`,
      declaredGender: 'male',
      ...(over.accepted === false ? { acceptedAt: null } : {}),
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender: 'male' },
      disciples: discipleNames.map((name) => ({ name, phone: aTestPhoneNumber(), gender: 'male' as const })),
    })
    return { ...group, leaderName, discipleNames }
  }

  const aDiscipler = (within: MinistryFixture = ministry) =>
    addPerson(within, named('Claire'), { phone: aTestPhoneNumber(), answers: { gender: 'male' } })

  const addLeader = (
    group: string,
    person: string,
    within: MinistryFixture = ministry,
    clock: Clock = systemClock,
  ) =>
    service(clock).execute({
      type: 'group.add_leader',
      ministryId: within.id,
      relationshipId: relationshipId(group),
      personId: personId(person),
      addedBy: within.adminUserId,
    })

  const liveToken = async (group: string, person: string) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation
        where relationship_id = $1 and person_id = $2 and consumed_at is null`,
      [group, person],
    )
    if (!rows[0]) throw new Error('no live invitation to accept on')
    return rows[0].token
  }

  const accept = async (
    group: string,
    person: string,
    within: MinistryFixture = ministry,
    clock: Clock = systemClock,
  ) => {
    const token = await liveToken(group, person)
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      phone: aTestPhoneNumber(),
      password: 'a-long-enough-password',
      phone_confirm: true,
    })
    if (error) throw new Error(error.message)
    return service(clock).execute({
      type: 'relationship.accept',
      ministryId: within.id,
      token: invitationToken(token),
      fullName: 'As Given',
      userId: data.user.id,
    })
  }

  const messagesTo = async (person: string) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  const acceptanceOf = async (group: string, person: string) => {
    const { rows } = await pool.query<{ accepted_at: Date | null }>(
      `select accepted_at from relationship_member
        where relationship_id = $1 and person_id = $2 and role = 'leader' and ended_at is null`,
      [group, person],
    )
    return rows[0]?.accepted_at ?? null
  }

  /** Everything about the group that a co-leader's acceptance must leave as it was. */
  const theGroupItself = async (group: string) => {
    const { rows } = await pool.query(
      `select r.name, r.declared_gender, r.accepted_at, r.ended_at, r.intended_material_id,
              (select jsonb_agg(jsonb_build_array(a.material_id, a.started_at, a.ended_at)
                                order by a.started_at)
                 from material_assignment a where a.relationship_id = r.id) as materials,
              (select count(*)::int from ministry_event e
                where e.subject_id = r.id
                  and e.type in ('relationship.paused', 'relationship.resumed')) as pauses
         from relationship r where r.id = $1`,
      [group],
    )
    return rows[0]
  }

  const eventTypesOn = async (group: string) => {
    const { rows } = await pool.query<{ type: string }>(
      `select type from ministry_event where subject_id = $1`,
      [group],
    )
    // Sorted here and never by Postgres, whose collation and JavaScript's
    // disagree about `.` and `_`.
    return rows.map((row) => row.type).sort()
  }

  const openItemsOn = async (group: string) => {
    const { rows } = await pool.query<{ kind: string; person_id: string | null; payload: unknown }>(
      `select kind, person_id, payload from follow_up_item
        where relationship_id = $1 and resolved_at is null
        order by kind`,
      [group],
    )
    return rows
  }

  /** Nobody already in the group hears anything: not its Disciples, not its leaders. */
  const expectNobodyElseWasTold = async (
    group: { leader: string; disciples: readonly string[] },
    before: ReadonlyMap<string, readonly string[]>,
  ) => {
    for (const person of [group.leader, ...group.disciples]) {
      expect(await messagesTo(person)).toEqual(before.get(person))
    }
  }

  const whatTheyHadBeenSent = async (group: { leader: string; disciples: readonly string[] }) => {
    const sent = new Map<string, readonly string[]>()
    for (const person of [group.leader, ...group.disciples]) sent.set(person, await messagesTo(person))
    return sent
  }

  /** A group formed by the product and awaiting its first leader, with a co-leader added since. */
  const formedAwaiting = async () => {
    const first = await aDiscipler()
    const disciples = [
      await addPerson(ministry, named('Emil'), { phone: aTestPhoneNumber(), answers: { gender: 'male' } }),
      await addPerson(ministry, named('Felix'), { phone: aTestPhoneNumber(), answers: { gender: 'male' } }),
    ]
    const { effects } = await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [personId(first)],
      participantIds: disciples.map((disciple) => personId(disciple)),
      declaredGender: 'male',
      name: named('Awaiting'),
    })
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('no group was formed')
    const claire = await aDiscipler()
    await addLeader(created.relationship.id, claire)
    return { id: created.relationship.id as string, first, claire, disciples }
  }

  describe('on a group that is running', () => {
    it('records their Acceptance on their own membership, and nothing else about the group changes', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      // Read before the Admin adds her, so *nobody else was told* below covers
      // the adding as well as the accepting.
      const sentBefore = await whatTheyHadBeenSent(group)
      await addLeader(group.id, claire)
      const before = await theGroupItself(group.id)
      const eventsBefore = await eventTypesOn(group.id)

      const { effects } = await accept(group.id, claire)

      // Timestamped, on the membership that is theirs.
      expect(await acceptanceOf(group.id, claire)).toBeInstanceOf(Date)
      // The activation moment is the one it had, and so is its Material history:
      // no period was opened over the one the group is already in.
      const after = await theGroupItself(group.id)
      expect(after).toEqual(before)
      expect(after.accepted_at).not.toBeNull()

      // One event, their Acceptance, and no second activation.
      expect(await eventTypesOn(group.id)).toEqual(
        [...eventsBefore, 'relationship.leader_accepted'].sort(),
      )
      const { rows: accepted } = await pool.query<{ payload: unknown }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'relationship.leader_accepted'`,
        [group.id],
      )
      expect(accepted).toEqual([{ payload: { personId: claire, activated: false } }])

      // No Starter Message, to anybody.
      expect(effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
      await expectNobodyElseWasTold(group, sentBefore)
      // The co-leader's own invitation is the only text this whole act ever sent.
      expect(await messagesTo(claire)).toHaveLength(1)
    })

    it('spends their link and gives them the account they made', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      await addLeader(group.id, claire)
      const token = await liveToken(group.id, claire)

      await accept(group.id, claire)

      const { rows } = await pool.query<{ consumed: boolean; full_name: string; linked: boolean }>(
        `select i.consumed_at is not null as consumed, p.full_name, p.user_id is not null as linked
           from invitation i join person p on p.id = i.person_id
          where i.token = $1`,
        [token],
      )
      expect(rows).toEqual([{ consumed: true, full_name: 'As Given', linked: true }])
    })

    it('treats them, from then on, as a group formed with two leaders treats its second', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      await addLeader(group.id, claire)
      await accept(group.id, claire)

      const leads = async (person: string) => {
        const snapshot = await store.transact(ministry.id, (unit) => unit.checkInFor(personId(person)))
        return snapshot?.leads.map((led) => ({ id: led.relationshipId, accepted: led.acceptedAt !== null }))
      }

      // Asked about the group like the leader it already had, by the rule that was
      // already there. This ticket designs nothing new for check-ins.
      expect(await leads(claire)).toEqual([{ id: group.id, accepted: true }])
      expect(await leads(group.leader)).toEqual([{ id: group.id, accepted: true }])
    })
  })

  describe('on a group that is paused', () => {
    it('records their Acceptance, and the group stays paused and is told nothing', async () => {
      const group = await aGroup()
      await pauseRelationship(ministry, group.id)
      const claire = await aDiscipler()
      const sentBefore = await whatTheyHadBeenSent(group)
      await addLeader(group.id, claire)
      const before = await theGroupItself(group.id)
      const eventsBefore = await eventTypesOn(group.id)

      const { effects } = await accept(group.id, claire)

      expect(await acceptanceOf(group.id, claire)).toBeInstanceOf(Date)
      expect(await theGroupItself(group.id)).toEqual(before)
      // Her Acceptance and no activation, and no resume either.
      expect(await eventTypesOn(group.id)).toEqual(
        [...eventsBefore, 'relationship.leader_accepted'].sort(),
      )
      expect(effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
      await expectNobodyElseWasTold(group, sentBefore)
    })
  })

  describe('on a group still awaiting its first leader', () => {
    const expectItActivatedOnce = async (group: Awaited<ReturnType<typeof formedAwaiting>>) => {
      expect((await theGroupItself(group.id)).accepted_at).not.toBeNull()
      expect((await eventTypesOn(group.id)).filter((type) => type === 'relationship.activated')).toHaveLength(1)
      // One Starter Message each, and every text counted rather than filtered:
      // a leader has their invitation and then it, a Disciple has it alone.
      for (const leader of [group.first, group.claire]) {
        const [invitation, starter, ...more] = await messagesTo(leader)
        expect(invitation).toContain('/invitation/')
        expect(starter).not.toContain('/invitation/')
        expect(more).toEqual([])
      }
      for (const disciple of group.disciples) expect(await messagesTo(disciple)).toHaveLength(1)
    }

    const expectItStillWaits = async (group: Awaited<ReturnType<typeof formedAwaiting>>) => {
      expect((await theGroupItself(group.id)).accepted_at).toBeNull()
      // Each leader has the invitation they were sent and nothing since, and no
      // Disciple has heard a word.
      for (const leader of [group.first, group.claire]) expect(await messagesTo(leader)).toHaveLength(1)
      for (const disciple of group.disciples) expect(await messagesTo(disciple)).toEqual([])
    }

    it('activates only when both have accepted, the first leader first', async () => {
      const group = await formedAwaiting()

      await accept(group.id, group.first)
      await expectItStillWaits(group)

      await accept(group.id, group.claire)
      await expectItActivatedOnce(group)
    })

    it('and the same with the co-leader first', async () => {
      const group = await formedAwaiting()

      await accept(group.id, group.claire)
      await expectItStillWaits(group)

      await accept(group.id, group.first)
      await expectItActivatedOnce(group)
    })
  })

  describe('on a group still awaiting its first leader, both at the same moment', () => {
    it('activates once, with one Starter Message', async () => {
      const group = await formedAwaiting()

      const racers = await Promise.all(
        [group.first, group.claire].map(async (person) => {
          const { data, error } = await serviceRoleClient().auth.admin.createUser({
            phone: aTestPhoneNumber(),
            password: 'a-long-enough-password',
            phone_confirm: true,
          })
          if (error) throw new Error(error.message)
          return { token: await liveToken(group.id, person), userId: data.user.id }
        }),
      )

      // Both transactions held open until both have begun, as the formation race
      // in `accepting-an-invitation.test.ts` does it, so the overlap is the one
      // the row lock exists for and not whatever the event loop produced.
      const bothInside = (() => {
        let arrived = 0
        let open = () => {}
        const gate = new Promise<void>((resolve) => {
          open = resolve
        })
        return async () => {
          if (++arrived === 2) open()
          await gate
        }
      })()
      const racing = createCommandService({
        clock: systemClock,
        ids,
        appBaseUrl: 'https://discipler.test',
        store: {
          transact: (forMinistry, work) =>
            store.transact(forMinistry, async (unit) => {
              await bothInside()
              return work(unit)
            }),
        },
      })

      await Promise.all(
        racers.map((racer) =>
          racing.execute({
            type: 'relationship.accept',
            ministryId: ministry.id,
            token: invitationToken(racer.token),
            fullName: 'Racing Leader',
            userId: racer.userId,
          }),
        ),
      )

      expect((await theGroupItself(group.id)).accepted_at).not.toBeNull()
      expect((await eventTypesOn(group.id)).filter((type) => type === 'relationship.activated')).toHaveLength(1)
      for (const disciple of group.disciples) expect(await messagesTo(disciple)).toHaveLength(1)
    })
  })

  describe('an invitation they decline, or never answer', () => {
    it('declined by text, raises the item a leader invited at formation raises, and tells nobody in the group', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      const sentBefore = await whatTheyHadBeenSent(group)
      await addLeader(group.id, claire)
      const before = await theGroupItself(group.id)

      // SWAP, which from Awaiting Leader Acceptance is how a leader says no.
      await service().execute({
        type: 'sms.inbound',
        ministryId: ministry.id,
        personId: personId(claire),
        body: 'SWAP',
      })

      expect(await openItemsOn(group.id)).toEqual([
        { kind: 'swap_requested', person_id: claire, payload: { requestedBy: 'leader' } },
      ])
      // The group goes on as it was, led by who it was led by.
      expect(await theGroupItself(group.id)).toEqual(before)
      expect(await acceptanceOf(group.id, claire)).toBeNull()
      await expectNobodyElseWasTold(group, sentBefore)
    })

    it('unanswered for five days, raises the item an unanswered invitation at formation raises', async () => {
      // Its own Ministry and its own clock: the tick reaches everything live in a
      // Ministry, and a clock does not run backwards. Started from now, not from a
      // date, because the fixtures beside it are stamped with the real clock.
      const quiet = await createMinistryWithAdmin('The Quiet Chapel')
      const started = new Date()
      const clock = createTestClock(started)
      const on = (elapsed: number) => clock.advanceTo(new Date(started.getTime() + elapsed))

      const group = await aGroup({ in: quiet })
      const claire = await aDiscipler(quiet)
      await addLeader(group.id, claire, quiet, clock)
      const tick = () => service(clock).execute({ type: 'scheduled.tick', ministryId: quiet.id })

      on(days(4))
      await tick()
      expect((await openItemsOn(group.id)).filter((item) => item.kind === 'relationship_unaccepted')).toEqual([])

      on(days(5))
      await tick()
      expect((await openItemsOn(group.id)).filter((item) => item.kind === 'relationship_unaccepted')).toEqual([
        { kind: 'relationship_unaccepted', person_id: null, payload: {} },
      ])
      // Still running, and still led by the leader it has.
      expect((await theGroupItself(group.id)).accepted_at).not.toBeNull()

      // And the answer it was waiting for closes it, with no Admin on it. **Cancel**
      // is refused on a running group, so left open it could only be dismissed.
      on(days(6))
      await accept(group.id, claire, quiet, clock)

      expect(await openItemsOn(group.id)).toEqual([])
      const { rows: closed } = await pool.query<{ resolved_by: string | null }>(
        `select resolved_by from follow_up_item
          where relationship_id = $1 and kind = 'relationship_unaccepted'`,
        [group.id],
      )
      expect(closed).toEqual([{ resolved_by: null }])
    })

    it('stands while a second co-leader has still to answer, and closes with the last of them', async () => {
      const quiet = await createMinistryWithAdmin('The Patient Chapel')
      const started = new Date()
      const clock = createTestClock(started)
      const group = await aGroup({ in: quiet })
      const claire = await aDiscipler(quiet)
      const tom = await aDiscipler(quiet)
      await addLeader(group.id, claire, quiet, clock)
      await addLeader(group.id, tom, quiet, clock)

      clock.advanceTo(new Date(started.getTime() + days(5)))
      await service(clock).execute({ type: 'scheduled.tick', ministryId: quiet.id })
      const unanswered = async () =>
        (await openItemsOn(group.id)).filter((item) => item.kind === 'relationship_unaccepted')
      expect(await unanswered()).toHaveLength(1)

      // It is the group's item and not Claire's: Tom has still said nothing.
      await accept(group.id, claire, quiet, clock)
      expect(await unanswered()).toHaveLength(1)

      await accept(group.id, tom, quiet, clock)
      expect(await unanswered()).toEqual([])
    })
  })

  describe('a tick that decided before an acceptance and writes after it', () => {
    // The tick reads who has not answered, and raises its item a moment later. An
    // acceptance landing in between would leave an item nothing closes, so the
    // raise looks again, behind the lock an acceptance holds.
    const raiseUnanswered = (group: string) =>
      store.transact(ministry.id, (unit) =>
        unit.raiseFollowUp({
          ministryId: ministry.id,
          kind: 'relationship_unaccepted',
          relationshipId: relationshipId(group),
          personId: null,
          raisedAt: new Date(),
        }),
      )
    const unanswered = async (group: string) =>
      (await openItemsOn(group)).filter((item) => item.kind === 'relationship_unaccepted')

    it('raises nothing about a group everybody has accepted', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      await addLeader(group.id, claire)
      await accept(group.id, claire)

      await raiseUnanswered(group.id)

      expect(await unanswered(group.id)).toEqual([])
    })

    it('still raises it while somebody has yet to answer', async () => {
      const group = await aGroup()
      await addLeader(group.id, await aDiscipler())

      await raiseUnanswered(group.id)

      expect(await unanswered(group.id)).toHaveLength(1)
    })
  })

  describe('what their Invitation Link shows before they accept', () => {
    it('who they would be leading, and who they would be leading with', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      await addLeader(group.id, claire)

      const page = await reader.readInvitationPage(await liveToken(group.id, claire))

      expect(page?.role).toBe('leader')
      // Compared as a set: the reader orders by when each membership started,
      // and a fixture can start two in the same millisecond.
      expect([...(page?.withNames ?? [])].sort()).toEqual([...group.discipleNames].sort())
      expect(page?.leadingWith).toEqual([group.leaderName])
    })

    it('names nobody as leading a running group who has not agreed to', async () => {
      const group = await aGroup()
      const claire = await aDiscipler()
      const tom = await aDiscipler()
      await addLeader(group.id, claire)
      await addLeader(group.id, tom)

      const page = await reader.readInvitationPage(await liveToken(group.id, tom))

      // Claire was invited and has said nothing. She is not somebody Tom would be
      // leading with until she has accepted, as on every Admin screen.
      expect(page?.leadingWith).toEqual([group.leaderName])
    })

    it('names everybody a group nobody has activated is waiting for', async () => {
      const group = await aGroup({ accepted: false })
      const claire = await aDiscipler()
      await addLeader(group.id, claire)

      const page = await reader.readInvitationPage(await liveToken(group.id, claire))

      expect(page?.leadingWith).toEqual([group.leaderName])
    })

    it('says nothing of co-leaders to somebody leading alone', async () => {
      const group = await aGroup({ accepted: false })
      const { rows } = await pool.query<{ token: string }>(
        `insert into invitation (ministry_id, relationship_id, person_id, token, created_at, expires_at)
         values ($1, $2, $3, $4, $5, $6) returning token`,
        [
          ministry.id,
          group.id,
          group.leader,
          crypto.randomUUID(),
          new Date(),
          new Date(Date.now() + days(14)),
        ],
      )

      const page = await reader.readInvitationPage(rows[0]!.token)

      expect([...(page?.withNames ?? [])].sort()).toEqual([...group.discipleNames].sort())
      expect(page?.leadingWith).toEqual([])
    })
  })
})
