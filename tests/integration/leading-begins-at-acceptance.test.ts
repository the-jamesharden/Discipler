import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '~/domain/clock'
import { personId, relationshipId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  aTestPhoneNumber,
  addMembership,
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, ticket 22; decided by James on 2026-09-20. A leader membership
 * gives its holder nothing until they have accepted it themselves, and a running
 * group is not said to be led by somebody who has not.
 *
 * Against real sessions and the real policies, because what a Leader may see is
 * decided by row-level security and nothing above it can prove that.
 */
describe('leading begins at acceptance', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock: systemClock, ids, store, appBaseUrl: 'https://discipler.test' })

  // A running men's group led by Mo, who holds an account and has accepted, with
  // Clay added to it since by an Admin. Clay holds an account too, which is what
  // makes the question real: they can sign in, and have agreed to lead nobody.
  let group: { id: string; leader: string; disciples: string[] }
  let mo: AccountFixture
  let clay: AccountFixture

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    group = await formGroup(ministry, {
      name: 'Thursday Table',
      declaredGender: 'male',
      leader: { name: 'David Chen', phone: aTestPhoneNumber(), gender: 'male' },
      disciples: [
        { name: 'Emil Novak', phone: aTestPhoneNumber(), gender: 'male' },
        { name: 'Felix Grant', phone: aTestPhoneNumber(), gender: 'male' },
      ],
    })
    mo = await addPersonWithAccount(ministry, 'Mo Farouk', 'leader', { answers: { gender: 'male' } })
    await addMembership({ ministry, relationshipId: group.id, kind: 'group', personId: mo.personId, role: 'leader' })

    clay = await addPersonWithAccount(ministry, 'Clay Martinez', 'leader', { answers: { gender: 'male' } })
    await service().execute({
      type: 'group.add_leader',
      ministryId: ministry.id,
      relationshipId: relationshipId(group.id),
      personId: personId(clay.personId),
      addedBy: ministry.adminUserId,
    })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const dashboardOf = async (account: AccountFixture) => {
    const client = await signInWith(account)
    const { data, error } = await client.rpc('relationships_page')
    if (error) throw new Error(error.message)
    return (data as { dashboard: Record<string, { relationship_id?: string; person_id?: string }[]> }).dashboard
  }

  const accepts = (account: AccountFixture) =>
    pool.query(
      `update relationship_member set accepted_at = $3
        where relationship_id = $1 and person_id = $2 and ended_at is null`,
      [group.id, account.personId, new Date()],
    )

  describe('what a leader who has not accepted is given', () => {
    it('no sight of the group, its memberships or its people through the policies', async () => {
      const asClay = await signInWith(clay)

      const relationships = await asClay.from('relationship').select('id').eq('id', group.id)
      const members = await asClay.from('relationship_member').select('id').eq('relationship_id', group.id)
      const people = await asClay.from('person').select('id').in('id', group.disciples)

      expect(relationships.data).toEqual([])
      expect(members.data).toEqual([])
      expect(people.data).toEqual([])
    })

    it('nobody’s number', async () => {
      const asClay = await signInWith(clay)

      for (const disciple of group.disciples) {
        const { data } = await asClay.rpc('contact_to_share', {
          target_ministry_id: ministry.id,
          target_person_id: disciple,
        })
        expect(data ?? []).toEqual([])
      }
    })

    it('nothing on their dashboard', async () => {
      const dashboard = await dashboardOf(clay)

      expect(dashboard.leaderships).toEqual([])
      expect(dashboard.members).toEqual([])
      expect(dashboard.contacts).toEqual([])
    })

    it('no pausing or resuming it by text, though SWAP still reaches it', async () => {
      const holds = await store.transact(ministry.id, async (unit) =>
        (await unit.inboundFor(personId(clay.personId)))?.holds,
      )

      // Awaiting acceptance, for them, which is what refuses PAUSE and RESUME.
      expect(holds?.map((held) => ({ id: held.relationshipId, accepted: held.acceptedAt !== null }))).toEqual([
        { id: group.id, accepted: false },
      ])
    })
  })

  describe('what the leader who has accepted sees meanwhile', () => {
    it('the group as it was, with no co-leader who has agreed to nothing', async () => {
      const dashboard = await dashboardOf(mo)
      const inIt = dashboard.members!.map((member) => member.person_id)

      expect(dashboard.leaderships!.map((led) => led.relationship_id)).toEqual([group.id])
      expect(inIt).toEqual(expect.arrayContaining([mo.personId, group.leader, ...group.disciples]))
      expect(inIt).not.toContain(clay.personId)
      expect(dashboard.people!.map((person) => (person as { id?: string }).id)).not.toContain(clay.personId)
      expect(dashboard.contacts!.map((contact) => contact.person_id)).not.toContain(clay.personId)
    })

    it('and a keyword of theirs neither reaches the one who has not nor names them', async () => {
      const holds = await store.transact(ministry.id, async (unit) =>
        (await unit.inboundFor(personId(mo.personId)))?.holds,
      )
      const held = holds?.find((each) => each.relationshipId === group.id)

      expect(held?.acceptedAt).not.toBeNull()
      expect(held?.members.map((member) => member.personId)).not.toContain(clay.personId)
      expect(held?.members.map((member) => member.personId)).toContain(mo.personId)
    })
  })

  describe('who the Admin’s screens say leads it', () => {
    it('the leaders who have accepted, on Intake forms, the Pair document and the group link', async () => {
      const admin = await signInAs(ministry)

      const groups = await admin.rpc('ministry_groups', { target_ministry_id: ministry.id })
      const listed = (groups.data as { relationship_id: string; leader_names: string[] }[]).find(
        (each) => each.relationship_id === group.id,
      )
      expect(listed?.leader_names.sort()).toEqual(['David Chen', 'Mo Farouk'])

      const pair = await admin.rpc('pair_page')
      const onThePairDocument = (
        pair.data as { groups: { id: string; leaders: { full_name: string }[]; member_ids: string[] }[] }
      ).groups.find((each) => each.id === group.id)
      expect(onThePairDocument?.leaders.map((leader) => leader.full_name)).toEqual(['David Chen', 'Mo Farouk'])
      // Still in it, accepted or not: this is what keeps the popup from offering
      // somebody a group they have already been invited to lead.
      expect(onThePairDocument?.member_ids).toContain(clay.personId)

      // The group Intake link's own read, which a congregant with no session is
      // shown: never *led by* somebody who has not agreed to lead it.
      const offered = await admin.rpc('groups_open_to_join', { target_ministry_id: ministry.id })
      const onTheLink = (offered.data as { relationship_id: string; leader_first_names: string[] }[]).find(
        (each) => each.relationship_id === group.id,
      )
      expect([...(onTheLink?.leader_first_names ?? [])].sort()).toEqual(['David', 'Mo'])
    })

    it('and the history the Overview, Care Needed and Check-Ins derive from carries each leader’s own acceptance', async () => {
      const admin = await signInAs(ministry)
      const { data } = await admin.rpc('overview_page')
      const members = (
        data as { history: { members: { relationship_id: string; person_id: string; accepted_at: string | null }[] } }
      ).history.members.filter((member) => member.relationship_id === group.id)

      expect(members.find((member) => member.person_id === clay.personId)?.accepted_at).toBeNull()
      expect(members.find((member) => member.person_id === mo.personId)?.accepted_at).not.toBeNull()
    })
  })

  /**
   * The same gap, one step earlier, which the same rule closes: a Leader who
   * already holds an account, invited to a relationship nobody has accepted yet.
   */
  describe('a leader with an account, invited to a new relationship', () => {
    it('sees nothing of it, or of the Disciple, until they accept', async () => {
      const invited = await addPersonWithAccount(ministry, 'Noah Berg', 'leader', { answers: { gender: 'male' } })
      const disciple = await addPerson(ministry, 'Owen Pike', { phone: aTestPhoneNumber(), answers: { gender: 'male' } })
      const { effects } = await service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [personId(invited.personId)],
        participantIds: [personId(disciple)],
      })
      const created = effects.find((effect) => effect.kind === 'relationship.create')
      if (created?.kind !== 'relationship.create') throw new Error('nothing was formed')

      const asInvited = await signInWith(invited)
      const before = await asInvited.from('person').select('id').eq('id', disciple)
      expect(before.data).toEqual([])
      expect((await dashboardOf(invited)).leaderships).toEqual([])
    })
  })

  describe('once they accept', () => {
    it('they are given what a leader is given, and are named as one', async () => {
      await accepts(clay)

      const asClay = await signInWith(clay)
      const people = await asClay.from('person').select('id').in('id', group.disciples)
      expect(people.data?.map((row) => row.id).sort()).toEqual([...group.disciples].sort())
      expect((await dashboardOf(clay)).leaderships!.map((led) => led.relationship_id)).toEqual([group.id])
      expect((await dashboardOf(mo)).members!.map((member) => member.person_id)).toContain(clay.personId)

      const admin = await signInAs(ministry)
      const groups = await admin.rpc('ministry_groups', { target_ministry_id: ministry.id })
      const listed = (groups.data as { relationship_id: string; leader_names: string[] }[]).find(
        (each) => each.relationship_id === group.id,
      )
      expect(listed?.leader_names).toContain('Clay Martinez')
    })
  })
})
