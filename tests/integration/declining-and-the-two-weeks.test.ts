import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days, systemClock, type Clock, type TestClock } from '~/domain/clock'
import { InvitationRefused } from '~/domain/errors'
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
 * Manual pairing, recut ticket 06; decided by James on 2026-09-21. The two ways an
 * invitation ends without being accepted: its Leader declines on the page the link
 * opens, or nobody answers and the product withdraws it when its fortnight runs
 * out. Either way their unaccepted membership is ended and never deleted, an Admin
 * is told on Follow-Up, and nobody else is told anything.
 *
 * Every case runs both ways. A decline runs on the real clock; the two weeks run
 * on a clock of their own **in a Ministry of their own**, because the sweep
 * reaches every invitation in a Ministry and a clock does not run backwards.
 */
describe('declining an invitation, and one nobody answers', () => {
  let shared: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = (clock: Clock = systemClock) =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  let numbered = 0
  const named = (first: string) => `${first} Declines${++numbered}`

  beforeAll(async () => {
    shared = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  /** Where a case runs, and on whose clock. */
  interface Setting {
    readonly ministry: MinistryFixture
    readonly clock: Clock
    /** The same clock where a case can move it, which the two weeks can. */
    readonly moves: TestClock | null
    /** Ends Claire's invitation the way this setting does. */
    readonly end: (group: string, person: string) => Promise<unknown>
  }

  const liveToken = async (group: string, person: string) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation
        where relationship_id = $1 and person_id = $2
          and consumed_at is null and withdrawn_at is null`,
      [group, person],
    )
    if (!rows[0]) throw new Error('no live invitation')
    return rows[0].token
  }

  const declining = async (): Promise<Setting> => ({
    ministry: shared,
    clock: systemClock,
    moves: null,
    end: async (group, person) =>
      service().execute({
        type: 'invitation.decline',
        ministryId: shared.id,
        token: invitationToken(await liveToken(group, person)),
      }),
  })

  const twoWeeks = async (): Promise<Setting> => {
    const ministry = await createMinistryWithAdmin(`The Quiet Chapel ${++numbered}`)
    // Started from now, not from a date: the fixtures beside it are stamped with
    // the real clock, and a pinned one is a date bomb.
    const started = new Date()
    const clock = createTestClock(started)
    return {
      ministry,
      clock,
      moves: clock,
      end: async () => {
        clock.advanceTo(new Date(started.getTime() + days(14) + 1000))
        return service(clock).withdrawLapsedInvitations(ministry.id)
      },
    }
  }

  const BOTH = [
    { how: 'a decline', setting: declining, item: 'match_declined', event: 'relationship.leader_declined', as: 'declined' },
    { how: 'the two weeks', setting: twoWeeks, item: 'invitation_expired', event: 'relationship.invitation_expired', as: 'expired' },
  ] as const

  const aGroup = async (within: MinistryFixture, over: { accepted?: boolean } = {}) => {
    const leaderName = named('Grace')
    const group = await formGroup(within, {
      name: `Thursday Table ${++numbered}`,
      declaredGender: 'male',
      ...(over.accepted === false ? { acceptedAt: null } : {}),
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender: 'male' },
      disciples: [named('Emil'), named('Felix')].map((name) => ({
        name,
        phone: aTestPhoneNumber(),
        gender: 'male' as const,
      })),
    })
    return { ...group, leaderName }
  }

  const aDiscipler = (within: MinistryFixture) =>
    addPerson(within, named('Claire'), { phone: aTestPhoneNumber(), answers: { gender: 'male' } })

  const addLeader = (setting: Setting, group: string, person: string) =>
    service(setting.clock).execute({
      type: 'group.add_leader',
      ministryId: setting.ministry.id,
      relationshipId: relationshipId(group),
      personId: personId(person),
      addedBy: setting.ministry.adminUserId,
    })

  const anAccount = async () => {
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      phone: aTestPhoneNumber(),
      password: 'a-long-enough-password',
      phone_confirm: true,
    })
    if (error) throw new Error(error.message)
    return data.user.id
  }

  const accept = async (setting: Setting, group: string, person: string) =>
    service(setting.clock).execute({
      type: 'relationship.accept',
      ministryId: setting.ministry.id,
      token: invitationToken(await liveToken(group, person)),
      fullName: 'As Given',
      userId: await anAccount(),
    })

  /** A group the product formed, awaiting its first leader, with Claire added since. */
  const formedAwaiting = async (setting: Setting) => {
    const male = { phone: aTestPhoneNumber(), answers: { gender: 'male' as const } }
    const first = await addPerson(setting.ministry, named('Grace'), { ...male, phone: aTestPhoneNumber() })
    const disciples = [
      await addPerson(setting.ministry, named('Emil'), { ...male, phone: aTestPhoneNumber() }),
      await addPerson(setting.ministry, named('Felix'), { ...male, phone: aTestPhoneNumber() }),
    ]
    const { effects } = await service(setting.clock).execute({
      type: 'relationship.create',
      ministryId: setting.ministry.id,
      leaderIds: [personId(first)],
      participantIds: disciples.map((disciple) => personId(disciple)),
      declaredGender: 'male',
      name: named('Awaiting'),
    })
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('no group was formed')
    const claire = await aDiscipler(setting.ministry)
    await addLeader(setting, created.relationship.id, claire)
    return { id: created.relationship.id as string, first, claire, disciples }
  }

  const messagesTo = async (person: string) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  const membershipsOf = async (group: string, person: string) => {
    const { rows } = await pool.query<{
      role: string
      accepted: boolean
      ended: boolean
      departed_by: string | null
    }>(
      `select role, accepted_at is not null as accepted, ended_at is not null as ended, departed_by
         from relationship_member
        where relationship_id = $1 and person_id = $2
        order by started_at, id`,
      [group, person],
    )
    return rows
  }

  const invitationsOf = async (group: string, person: string) => {
    const { rows } = await pool.query<{ withdrawn_as: string | null; consumed: boolean }>(
      `select withdrawn_as, consumed_at is not null as consumed
         from invitation where relationship_id = $1 and person_id = $2
        order by created_at, id`,
      [group, person],
    )
    return rows
  }

  /** Everything about the group that ending one invitation must leave as it was. */
  const theGroupItself = async (group: string) => {
    const { rows } = await pool.query(
      `select r.name, r.declared_gender, r.accepted_at, r.ended_at, r.intended_material_id,
              (select jsonb_agg(jsonb_build_array(a.material_id, a.started_at, a.ended_at)
                                order by a.started_at)
                 from material_assignment a where a.relationship_id = r.id) as materials,
              (select count(*)::int from ministry_event e
                where e.subject_id = r.id
                  and e.type in ('relationship.paused', 'relationship.resumed')) as pauses,
              (select jsonb_agg(jsonb_build_array(m.person_id, m.role, m.accepted_at)
                                order by m.person_id)
                 from relationship_member m
                where m.relationship_id = r.id and m.ended_at is null) as members
         from relationship r where r.id = $1`,
      [group],
    )
    return rows[0]
  }

  const eventsOn = async (group: string, type: string) => {
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event where subject_id = $1 and type = $2 order by recorded_at`,
      [group, type],
    )
    return rows.map((row) => row.payload)
  }

  const openItemsOn = async (group: string) => {
    const { rows } = await pool.query<{ kind: string; person_id: string | null }>(
      `select kind, person_id from follow_up_item
        where relationship_id = $1 and resolved_at is null`,
      [group],
    )
    // Sorted here and never by Postgres, which orders an enum by where each value
    // was added and not by how it is spelt.
    return rows.sort((a, b) => a.kind.localeCompare(b.kind))
  }

  const whatTheyHadBeenSent = async (people: readonly string[]) => {
    const sent = new Map<string, readonly string[]>()
    for (const person of people) sent.set(person, await messagesTo(person))
    return sent
  }

  const raiseUnanswered = (within: MinistryFixture, group: string, at: Date = new Date()) =>
    store.transact(within.id, (unit) =>
      unit.raiseFollowUp({
        ministryId: within.id,
        kind: 'relationship_unaccepted',
        relationshipId: relationshipId(group),
        personId: null,
        raisedAt: at,
      }),
    )

  describe.each(BOTH)('$how', ({ setting: inSetting, item, event, as }) => {
    it('on a running group ends their unaccepted membership, tells the Admin, and changes nothing else', async () => {
      const setting = await inSetting()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      const everybodyElse = [group.leader, ...group.disciples]
      const sentBefore = await whatTheyHadBeenSent(everybodyElse)
      await addLeader(setting, group.id, claire)
      const token = await liveToken(group.id, claire)
      const withHer = await theGroupItself(group.id)

      await setting.end(group.id, claire)

      // Ended, never deleted, and by no Admin: that she was invited, and when,
      // stays on the relationship.
      expect(await membershipsOf(group.id, claire)).toEqual([
        { role: 'leader', accepted: false, ended: true, departed_by: null },
      ])
      expect(await invitationsOf(group.id, claire)).toEqual([{ withdrawn_as: as, consumed: false }])

      // Its activation, its Material, its name, its declaration, its state, its
      // other leaders and its Disciples.
      const after = await theGroupItself(group.id)
      expect(after).toEqual({
        ...withHer,
        members: (withHer.members as unknown[][]).filter(([person]) => person !== claire),
      })
      expect(after.accepted_at).not.toBeNull()

      expect(await openItemsOn(group.id)).toEqual([{ kind: item, person_id: claire }])
      expect(await eventsOn(group.id, event)).toEqual([{ personId: claire, activated: false }])

      // Nobody is sent anything by it: not her, not its leaders, not its Disciples.
      for (const person of everybodyElse) expect(await messagesTo(person)).toEqual(sentBefore.get(person))
      // She has the invitation she was sent, and nothing since.
      const hers = await messagesTo(claire)
      expect(hers).toHaveLength(1)
      expect(hers[0]).toContain('/invitation/')

      // And her link opens nothing to accept.
      await expect(
        service(setting.clock).execute({
          type: 'relationship.accept',
          ministryId: setting.ministry.id,
          token: invitationToken(token),
          fullName: 'Too Late',
          userId: await anAccount(),
        }),
      ).rejects.toMatchObject({
        refusal: as === 'declined' ? 'invitation.declined' : 'invitation.expired',
      })
    })

    it('on a paused group does the same, and the group stays paused', async () => {
      const setting = await inSetting()
      const group = await aGroup(setting.ministry)
      await pauseRelationship(setting.ministry, group.id)
      const claire = await aDiscipler(setting.ministry)
      const sentBefore = await whatTheyHadBeenSent([group.leader, ...group.disciples])
      await addLeader(setting, group.id, claire)
      const withHer = await theGroupItself(group.id)

      await setting.end(group.id, claire)

      const after = await theGroupItself(group.id)
      expect(after.pauses).toBe(withHer.pauses)
      expect(after.accepted_at).toEqual(withHer.accepted_at)
      expect(after.materials).toEqual(withHer.materials)
      expect(await eventsOn(group.id, 'relationship.resumed')).toEqual([])
      expect(await openItemsOn(group.id)).toEqual([{ kind: item, person_id: claire }])
      for (const person of [group.leader, ...group.disciples]) {
        expect(await messagesTo(person)).toEqual(sentBefore.get(person))
      }
    })

    it('activates a group awaiting two leaders where the other has accepted, once, with one Starter Message', async () => {
      const setting = await inSetting()
      const group = await formedAwaiting(setting)
      await accept(setting, group.id, group.first)
      expect((await theGroupItself(group.id)).accepted_at).toBeNull()

      await setting.end(group.id, group.claire)

      expect((await theGroupItself(group.id)).accepted_at).not.toBeNull()
      expect(await eventsOn(group.id, 'relationship.activated')).toHaveLength(1)
      expect(await eventsOn(group.id, event)).toEqual([{ personId: group.claire, activated: true }])

      // Every text counted rather than filtered. The leader who stayed has their
      // invitation and then the Starter Message; each Disciple has it alone; and
      // she has nothing but what she was sent before it.
      const [invitation, starter, ...more] = await messagesTo(group.first)
      expect(invitation).toContain('/invitation/')
      expect(starter).not.toContain('/invitation/')
      expect(more).toEqual([])
      for (const disciple of group.disciples) {
        const texts = await messagesTo(disciple)
        expect(texts).toHaveLength(1)
        expect(texts[0]).not.toContain('Claire')
      }
      for (const text of await messagesTo(group.claire)) expect(text).toContain('/invitation/')

      // Its Material history opened with it, as it does when the last leader accepts.
      expect((await theGroupItself(group.id)).materials).toHaveLength(1)
    })

    it('leaves a group still waiting on its other leader waiting, and sends nobody anything', async () => {
      const setting = await inSetting()
      const group = await formedAwaiting(setting)
      // The other leader's is sent again before the two weeks are up, which starts
      // theirs again, so only Claire's has lapsed when the sweep runs.
      if (setting.moves) {
        setting.moves.advanceBy(days(13))
        await service(setting.clock).execute({
          type: 'invitation.reissue',
          ministryId: setting.ministry.id,
          relationshipId: relationshipId(group.id),
          personId: personId(group.first),
        })
      }

      await setting.end(group.id, group.claire)

      expect((await theGroupItself(group.id)).accepted_at).toBeNull()
      expect(await membershipsOf(group.id, group.first)).toEqual([
        { role: 'leader', accepted: false, ended: false, departed_by: null },
      ])
      for (const disciple of group.disciples) expect(await messagesTo(disciple)).toEqual([])
    })

    it('leaves a relationship whose only leader it was with no leader, and does not cancel it', async () => {
      const setting = await inSetting()
      const male = { answers: { gender: 'male' as const } }
      const claire = await addPerson(setting.ministry, named('Claire'), { ...male, phone: aTestPhoneNumber() })
      const sam = await addPerson(setting.ministry, named('Sam'), { ...male, phone: aTestPhoneNumber() })
      const { effects } = await service(setting.clock).execute({
        type: 'relationship.create',
        ministryId: setting.ministry.id,
        leaderIds: [personId(claire)],
        participantIds: [personId(sam)],
        declaredGender: null,
      })
      const created = effects.find((effect) => effect.kind === 'relationship.create')
      if (created?.kind !== 'relationship.create') throw new Error('no pairing was formed')
      const pairing = created.relationship.id as string
      const open = await raiseUnanswered(setting.ministry, pairing, setting.clock.now())
      expect(open).toBe(true)

      await setting.end(pairing, claire)

      const after = await theGroupItself(pairing)
      expect(after.ended_at).toBeNull()
      expect(after.accepted_at).toBeNull()
      expect((after.members as unknown[][]).map(([person]) => person)).toEqual([sam])
      expect(await messagesTo(sam)).toEqual([])
      // The Awaiting acceptance item stands, because it is what offers Cancel, and
      // cancelling from it still works.
      expect(await openItemsOn(pairing)).toEqual([
        { kind: item, person_id: claire },
        { kind: 'relationship_unaccepted', person_id: null },
      ])
      await service(setting.clock).execute({
        type: 'relationship.cancel',
        ministryId: setting.ministry.id,
        relationshipId: relationshipId(pairing),
        cancelledBy: setting.ministry.adminUserId,
      })
      expect((await theGroupItself(pairing)).ended_at).not.toBeNull()
    })

    it('closes an open Awaiting acceptance item where nobody is left to answer, with no Admin on it', async () => {
      const setting = await inSetting()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      // As a build before this ticket raised it: the tick no longer does.
      await raiseUnanswered(setting.ministry, group.id, setting.clock.now())

      await setting.end(group.id, claire)

      // One thing for the Admin to read, and not two.
      expect(await openItemsOn(group.id)).toEqual([{ kind: item, person_id: claire }])
      const { rows: closed } = await pool.query<{ resolved_by: string | null }>(
        `select resolved_by from follow_up_item
          where relationship_id = $1 and kind = 'relationship_unaccepted'`,
        [group.id],
      )
      expect(closed).toEqual([{ resolved_by: null }])
    })

    it('lets them be invited again afterwards, by the act that invited them first', async () => {
      const setting = await inSetting()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      await setting.end(group.id, claire)

      // The Roster's memberships are the open ones, so she is off the group's row
      // there and the popup offers her the group again.
      const { rows: open } = await pool.query(
        `select 1 from relationship_member
          where relationship_id = $1 and person_id = $2 and ended_at is null`,
        [group.id, claire],
      )
      expect(open).toEqual([])

      await addLeader(setting, group.id, claire)

      expect(await membershipsOf(group.id, claire)).toEqual([
        { role: 'leader', accepted: false, ended: true, departed_by: null },
        { role: 'leader', accepted: false, ended: false, departed_by: null },
      ])
      // The withdrawn invitation stays as the record of itself, beside the new one.
      expect(await invitationsOf(group.id, claire)).toEqual([
        { withdrawn_as: as, consumed: false },
        { withdrawn_as: null, consumed: false },
      ])
      await accept(setting, group.id, claire)
      expect((await membershipsOf(group.id, claire))[1]).toMatchObject({ accepted: true, ended: false })
    })
  })

  describe('declining', () => {
    it('is refused a second time, and changes nothing the second time', async () => {
      const setting = await declining()
      const group = await aGroup(shared)
      const claire = await aDiscipler(shared)
      await addLeader(setting, group.id, claire)
      const token = invitationToken(await liveToken(group.id, claire))
      const decline = () =>
        service().execute({ type: 'invitation.decline', ministryId: shared.id, token })

      await decline()
      await expect(decline()).rejects.toBeInstanceOf(InvitationRefused)

      expect(await openItemsOn(group.id)).toEqual([{ kind: 'match_declined', person_id: claire }])
      expect(await eventsOn(group.id, 'relationship.leader_declined')).toHaveLength(1)
    })

    it('shows her, on the same link, that the Ministry has been told, and names nobody', async () => {
      const setting = await declining()
      const reader = createPostgresInvitationReader(localSupabase().databaseUrl)
      try {
        const group = await aGroup(shared)
        const claire = await aDiscipler(shared)
        await addLeader(setting, group.id, claire)
        const token = await liveToken(group.id, claire)
        expect(await reader.readInvitationPage(token)).toMatchObject({ state: 'live', withdrawn: false })

        await setting.end(group.id, claire)

        expect(await reader.readInvitationPage(token)).toMatchObject({
          state: 'declined',
          withdrawn: true,
          ministryName: 'Riverside Chapel',
          pairedWithCount: 2,
          withNames: [],
          leadingWith: [],
        })
      } finally {
        await reader.close()
      }
    })

    it('an acceptance at the same moment is one or the other, and never both', async () => {
      const setting = await declining()
      const group = await aGroup(shared)
      const claire = await aDiscipler(shared)
      await addLeader(setting, group.id, claire)
      const token = invitationToken(await liveToken(group.id, claire))
      const userId = await anAccount()

      // Both transactions held open until both have begun, so the overlap is the
      // one the row lock exists for and not whatever the event loop produced.
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

      const outcomes = await Promise.allSettled([
        racing.execute({ type: 'relationship.accept', ministryId: shared.id, token, fullName: 'Racing', userId }),
        racing.execute({ type: 'invitation.decline', ministryId: shared.id, token }),
      ])

      // Exactly one of them went through, and the other was refused in words a
      // page can say. Which one is the database's to order.
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      const refused = outcomes.find((outcome) => outcome.status === 'rejected')
      expect(refused?.status === 'rejected' && refused.reason).toBeInstanceOf(InvitationRefused)

      const [membership] = await membershipsOf(group.id, claire)
      const [invitation] = await invitationsOf(group.id, claire)
      expect(membership?.accepted).toBe(!membership?.ended)
      expect(invitation?.consumed).toBe(membership?.accepted)
      expect(invitation?.withdrawn_as).toBe(membership?.ended ? 'declined' : null)
      expect(await openItemsOn(group.id)).toEqual(
        membership?.ended ? [{ kind: 'match_declined', person_id: claire }] : [],
      )
    })
  })

  describe('the two weeks', () => {
    it('withdraws nothing up to the expiry, and everything unanswered after it', async () => {
      const setting = await twoWeeks()
      const clock = setting.moves!
      const started = clock.now()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      const sweep = () => service(clock).withdrawLapsedInvitations(setting.ministry.id)

      clock.advanceTo(new Date(started.getTime() + days(14)))
      expect(await sweep()).toBe(0)
      expect(await openItemsOn(group.id)).toEqual([])

      clock.advanceTo(new Date(started.getTime() + days(14) + 1))
      expect(await sweep()).toBe(1)
      // And once: a second pass finds nothing left to withdraw.
      expect(await sweep()).toBe(0)
      expect(await eventsOn(group.id, 'relationship.invitation_expired')).toHaveLength(1)
    })

    it('starts again when a new invitation is sent before they are up', async () => {
      const setting = await twoWeeks()
      const clock = setting.moves!
      const started = clock.now()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)

      clock.advanceTo(new Date(started.getTime() + days(10)))
      await service(clock).execute({
        type: 'invitation.reissue',
        ministryId: setting.ministry.id,
        relationshipId: relationshipId(group.id),
        personId: personId(claire),
      })

      clock.advanceTo(new Date(started.getTime() + days(15)))
      expect(await service(clock).withdrawLapsedInvitations(setting.ministry.id)).toBe(0)
      expect(await membershipsOf(group.id, claire)).toMatchObject([{ ended: false }])

      clock.advanceTo(new Date(started.getTime() + days(24) + 1000))
      expect(await service(clock).withdrawLapsedInvitations(setting.ministry.id)).toBe(1)
    })

    it('an invitation accepted in the same moment is accepted, and is not withdrawn', async () => {
      const setting = await twoWeeks()
      const clock = setting.moves!
      const started = clock.now()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      const userId = await anAccount()
      const token = invitationToken(await liveToken(group.id, claire))

      /** Until the withdrawal is waiting on the row her acceptance holds. */
      const untilItWaits = async () => {
        for (let tries = 0; tries < 100; tries += 1) {
          const { rows } = await pool.query(
            `select 1 from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`,
          )
          if (rows.length > 0) return
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        throw new Error('nothing ever waited, so the two never overlapped')
      }

      // Her acceptance at the very last instant the link is live, held open
      // mid-transaction while the sweep, a moment later by its own clock, reads
      // her as lapsed and goes to withdraw her.
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const accepting = createCommandService({
        clock: createTestClock(new Date(started.getTime() + days(14))),
        ids,
        appBaseUrl: 'https://discipler.test',
        store: {
          transact: (forMinistry, work) =>
            store.transact(forMinistry, async (unit) => {
              const result = await work(unit)
              await held
              return result
            }),
        },
      }).execute({
        type: 'relationship.accept',
        ministryId: setting.ministry.id,
        token,
        fullName: 'Just In Time',
        userId,
      })

      clock.advanceTo(new Date(started.getTime() + days(14) + 1))
      // Let her transaction take its lock before the sweep begins.
      await new Promise((resolve) => setTimeout(resolve, 300))
      const sweeping = service(clock).withdrawLapsedInvitations(setting.ministry.id)
      await untilItWaits()
      release()

      // A leader's acceptance never fails on the product's timing.
      await accepting
      expect(await sweeping).toBe(0)

      expect(await membershipsOf(group.id, claire)).toEqual([
        { role: 'leader', accepted: true, ended: false, departed_by: null },
      ])
      expect(await invitationsOf(group.id, claire)).toEqual([{ withdrawn_as: null, consumed: true }])
      expect(await openItemsOn(group.id)).toEqual([])
      expect(await eventsOn(group.id, 'relationship.invitation_expired')).toEqual([])
    })

    it('shows an expired link what an expired link always said, with nobody named', async () => {
      const setting = await twoWeeks()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      const token = await liveToken(group.id, claire)
      await setting.end(group.id, claire)

      const reader = createPostgresInvitationReader(localSupabase().databaseUrl, () => setting.clock.now())
      try {
        expect(await reader.readInvitationPage(token)).toMatchObject({
          state: 'expired',
          withdrawn: true,
          withNames: [],
          leadingWith: [],
        })
      } finally {
        await reader.close()
      }
    })
  })

  describe('the Unaccepted flag', () => {
    it('is no longer raised for a leader added to a running group, who is still reminded', async () => {
      const setting = await twoWeeks()
      const clock = setting.moves!
      const started = clock.now()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)

      clock.advanceTo(new Date(started.getTime() + days(6)))
      await service(clock).execute({ type: 'scheduled.tick', ministryId: setting.ministry.id })

      expect(await openItemsOn(group.id)).toEqual([])
      // Her invitation, and the one reminder, unchanged.
      expect(await messagesTo(claire)).toHaveLength(2)
    })

    it('is still raised for a relationship nobody has activated', async () => {
      const setting = await twoWeeks()
      const clock = setting.moves!
      const started = clock.now()
      const group = await formedAwaiting(setting)

      clock.advanceTo(new Date(started.getTime() + days(6)))
      await service(clock).execute({ type: 'scheduled.tick', ministryId: setting.ministry.id })

      expect(await openItemsOn(group.id)).toEqual([{ kind: 'relationship_unaccepted', person_id: null }])
    })
  })

  describe('Copy link to re-invite leader', () => {
    const copyLink = (setting: Setting, group: string, person: string) =>
      service(setting.clock).execute({
        type: 'invitation.copy_link',
        ministryId: setting.ministry.id,
        relationshipId: relationshipId(group),
        personId: personId(person),
        copiedBy: setting.ministry.adminUserId,
      })

    it('puts her back as somebody invited, for another fortnight, and sends her nothing', async () => {
      const setting = await twoWeeks()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      await setting.end(group.id, claire)
      const sentBefore = await messagesTo(claire)
      const everybodyElse = await whatTheyHadBeenSent([group.leader, ...group.disciples])

      const { effects } = await copyLink(setting, group.id, claire)

      expect(await membershipsOf(group.id, claire)).toEqual([
        { role: 'leader', accepted: false, ended: true, departed_by: null },
        { role: 'leader', accepted: false, ended: false, departed_by: null },
      ])
      const issued = effects.find((effect) => effect.kind === 'invitation.issue')
      if (issued?.kind !== 'invitation.issue') throw new Error('no invitation was made')
      expect(issued.invitation.expiresAt.getTime()).toBe(setting.clock.now().getTime() + days(14))
      expect(issued.invitation.token).toBe(await liveToken(group.id, claire))

      expect(await messagesTo(claire)).toEqual(sentBefore)
      for (const [person, sent] of everybodyElse) expect(await messagesTo(person)).toEqual(sent)

      // Recorded with the Admin who made it and the Person, and never the link.
      const [copied, ...more] = await eventsOn(group.id, 'invitation.link_copied')
      expect(more).toEqual([])
      expect(copied).toMatchObject({
        personId: claire,
        copiedBy: setting.ministry.adminUserId,
        reinvited: true,
      })
      expect(JSON.stringify(copied)).not.toContain(issued.invitation.token)

      // And the link works.
      await accept(setting, group.id, claire)
      expect((await membershipsOf(group.id, claire))[1]).toMatchObject({ accepted: true })
    })

    it('always gives a working link: pressed again, it replaces the one it made', async () => {
      const setting = await twoWeeks()
      const group = await aGroup(setting.ministry)
      const claire = await aDiscipler(setting.ministry)
      await addLeader(setting, group.id, claire)
      await setting.end(group.id, claire)

      await copyLink(setting, group.id, claire)
      const first = await liveToken(group.id, claire)
      await copyLink(setting, group.id, claire)
      const second = await liveToken(group.id, claire)

      expect(second).not.toBe(first)
      // One open membership and one live invitation, however often it is pressed.
      expect((await membershipsOf(group.id, claire)).filter((row) => !row.ended)).toHaveLength(1)
      expect((await invitationsOf(group.id, claire)).filter((row) => row.withdrawn_as === null)).toHaveLength(1)
      expect(await eventsOn(group.id, 'invitation.link_copied')).toHaveLength(2)
    })

    it('is refused for somebody who was never invited to it, and once she has accepted', async () => {
      const setting = await declining()
      const group = await aGroup(shared)
      const stranger = await aDiscipler(shared)
      await expect(copyLink(setting, group.id, stranger)).rejects.toMatchObject({
        refusal: 'reinvite.never_invited',
      })
      expect(await membershipsOf(group.id, stranger)).toEqual([])

      const claire = await aDiscipler(shared)
      await addLeader(setting, group.id, claire)
      await accept(setting, group.id, claire)
      await expect(copyLink(setting, group.id, claire)).rejects.toMatchObject({
        refusal: 'reinvite.already_accepted',
      })
    })
  })
})
