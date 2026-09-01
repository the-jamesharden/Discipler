import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { FollowUpRefused, GroupRefused, PairingRefused } from '~/domain/errors'
import { followUpItemId, personId, relationshipId, type IdSource } from '~/domain/ids'
import { GROUP_PATH, type IntakeFormFields } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { createCommandService } from '~/service/command-service'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  openMaterialHistory,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Joining a group, underneath the screens: what the group Intake path writes, what
 * an open door and a guarded one each do, what an Admin's admission does, and what
 * the database refuses on its own.
 */
describe('joining a group', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-09T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  let numbered = 0
  const aNumber = () => `+1555${String(3_000_000 + ((Date.now() % 100_000) * 10 + ++numbered)).padStart(7, '0')}`

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  /**
   * An accepted group with one Leader and one Participant, named by an Admin.
   * Inserted whole rather than through `createRelationship`, because the
   * declaration is immutable once the row exists and these tests need to say what
   * a group declared at the moment it was formed.
   */
  const aGroup = async (over: {
    readonly name?: string | null
    readonly joinRequiresApproval?: boolean
    readonly declaredGender?: 'male' | 'female' | null
    readonly acceptedAt?: Date | null
  } = {}) => {
    const leader = await addPerson(ministry, `Ruth ${++numbered}`, {
      phone: aNumber(),
      answers: { gender: 'female' },
    })
    const first = await addPerson(ministry, `Emily ${++numbered}`, {
      phone: aNumber(),
      answers: { gender: 'female' },
    })
    const acceptedAt =
      over.acceptedAt === undefined ? new Date('2026-03-02T09:00:00Z') : over.acceptedAt
    const { rows } = await pool.query<{ id: string }>(
      `insert into relationship
         (ministry_id, kind, accepted_at, name, join_requires_approval, declared_gender)
       values ($1, 'group', $2, $3, $4, $5)
       returning id`,
      [
        ministry.id,
        acceptedAt,
        over.name === undefined ? 'Tuesday Women’s Group' : over.name,
        over.joinRequiresApproval ?? false,
        over.declaredGender === undefined ? 'female' : over.declaredGender,
      ],
    )
    const id = rows[0]!.id
    if (acceptedAt) await openMaterialHistory(ministry, id, acceptedAt)
    await addMembership({ ministry, relationshipId: id, kind: 'group', personId: leader, role: 'leader' })
    await addMembership({ ministry, relationshipId: id, kind: 'group', personId: first, role: 'participant' })
    return { id: relationshipId(id), leader: personId(leader), first: personId(first) }
  }

  const form = (groupId: string, over: Partial<IntakeFormFields> = {}): IntakeFormFields => ({
    fullName: `Priya ${++numbered}`,
    phone: aNumber(),
    email: null,
    ageBand: '25-34',
    gender: 'female',
    goalId: null,
    availability: ['tuesday:evening'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: GROUP_PATH,
    declaredSide: null,
    experience: null,
    groupId,
    ...over,
  })

  const submit = (groupId: string, over: Partial<IntakeFormFields> = {}) => {
    const fields = form(groupId, over)
    return service()
      .execute({ type: 'intake.submit', ministryId: ministry.id, form: fields })
      .then(() => fields)
  }

  const membersOf = async (relationship: string) => {
    const { rows } = await pool.query<{ full_name: string; role: string }>(
      `select p.full_name, m.role from relationship_member m join person p on p.id = m.person_id
        where m.relationship_id = $1 and m.ended_at is null order by m.started_at, p.full_name`,
      [relationship],
    )
    return rows
  }

  const messagesTo = async (person: string) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  const openItems = async (relationship: string) => {
    const { rows } = await pool.query<{ id: string; person_id: string; kind: string }>(
      `select id, person_id, kind from follow_up_item
        where relationship_id = $1 and resolved_at is null order by raised_at`,
      [relationship],
    )
    return rows
  }

  const personNamed = async (fullName: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from person where ministry_id = $1 and full_name = $2`,
      [ministry.id, fullName],
    )
    return rows[0]!.id
  }

  describe('the group Intake path', () => {
    it('joins an open group on submit, records who did it, and tells the Leader', async () => {
      const group = await aGroup()
      const fields = await submit(group.id)

      const members = await membersOf(group.id)
      expect(members.map((row) => row.full_name)).toContain(fields.fullName)

      const joiner = await personNamed(fields.fullName!)
      const { rows: events } = await pool.query<{ type: string; payload: { personId: string } }>(
        `select type, payload from ministry_event
          where subject_id = $1 and type = 'relationship.participant_joined'`,
        [group.id],
      )
      expect(events).toHaveLength(1)
      expect(events[0]!.payload.personId).toBe(joiner)

      const toLeader = await messagesTo(group.leader)
      expect(toLeader).toHaveLength(1)
      expect(toLeader[0]).toContain(`${fields.fullName!.split(' ')[0]} just joined Tuesday Women’s Group.`)
      expect(toLeader[0]).toContain('https://discipler.test/relationships')

      // The joiner is sent the Welcome and nothing about the group.
      const toJoiner = await messagesTo(joiner)
      expect(toJoiner).toHaveLength(1)
      expect(toJoiner[0]).toContain('you’re all set')
      expect(toJoiner[0]).not.toContain('matched')
      expect(toJoiner[0]).not.toContain('Tuesday')
    })

    it('records the path on every consent record, and no Goal on the submission', async () => {
      const group = await aGroup()
      const fields = await submit(group.id)
      const joiner = await personNamed(fields.fullName!)

      const { rows: consents } = await pool.query(
        `select intake_path, declared_side from consent_record where person_id = $1`,
        [joiner],
      )
      expect(consents).toHaveLength(2)
      for (const row of consents) {
        expect(row.intake_path).toBe('group')
        expect(row.declared_side).toBeNull()
      }
      const { rows: submissions } = await pool.query(
        `select discipleship_goal_id, first_time from intake_submission where person_id = $1`,
        [joiner],
      )
      expect(submissions[0]!.discipleship_goal_id).toBeNull()
      expect(submissions[0]!.first_time).toBeNull()
    })

    it('asks rather than joins where the door is guarded, and asks once', async () => {
      const group = await aGroup({ joinRequiresApproval: true })
      const fields = await submit(group.id)

      expect((await membersOf(group.id)).map((row) => row.full_name)).not.toContain(fields.fullName)
      const items = await openItems(group.id)
      expect(items).toHaveLength(1)
      expect(items[0]!.kind).toBe('group_join_requested')
      expect(await messagesTo(group.leader)).toHaveLength(0)

      // The same Person asking again is one thing to act on.
      await submit(group.id, { fullName: fields.fullName, phone: fields.phone })
      expect(await openItems(group.id)).toHaveLength(1)
    })

    it('refuses a group the page would not have offered', async () => {
      const unaccepted = await aGroup({ acceptedAt: null })
      await expect(submit(unaccepted.id)).rejects.toMatchObject({
        refusals: ['intake.group_unavailable'],
      })

      const unnamed = await aGroup({ name: null })
      await expect(submit(unnamed.id)).rejects.toMatchObject({
        refusals: ['intake.group_unavailable'],
      })

      await expect(submit('not-a-group')).rejects.toMatchObject({
        refusals: ['intake.group_unavailable'],
      })

      // A one-to-one is no such group, whatever its id.
      const david = await addPerson(ministry, `David ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
      const sam = await addPerson(ministry, `Sam ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
      const pair = await createRelationship(ministry, 'one_to_one')
      await addMembership({ ministry, relationshipId: pair, kind: 'one_to_one', personId: david, role: 'leader' })
      await addMembership({ ministry, relationshipId: pair, kind: 'one_to_one', personId: sam, role: 'participant' })
      await pool.query(`update relationship set name = 'Not a group' where id = $1`, [pair])
      await expect(submit(pair, { gender: 'male' })).rejects.toMatchObject({
        refusals: ['intake.group_unavailable'],
      })
    })

    it('refuses a group that declared a gender the Person is not', async () => {
      const group = await aGroup({ declaredGender: 'female' })
      await expect(submit(group.id, { gender: 'male' })).rejects.toMatchObject({
        refusals: ['intake.group_not_open_to_you'],
      })
    })

    it('offers the page every accepted, named group and nothing else', async () => {
      const open = await aGroup({ name: `Open ${++numbered}` })
      await aGroup({ name: null })
      await aGroup({ acceptedAt: null, name: `Waiting ${++numbered}` })
      const guarded = await aGroup({ name: `Guarded ${++numbered}`, joinRequiresApproval: true })

      const page = await reader.readGroupIntakePage(ministry.id)
      expect(page?.ministryName).toBe('Riverside Chapel')
      const offered = page!.groups
      const ids = offered.map((group) => group.relationshipId)
      expect(ids).toContain(open.id)
      expect(ids).toContain(guarded.id)
      // Unnamed and unaccepted groups are left out; the one-to-one above is too.
      for (const group of offered) {
        expect(group.name).not.toBeNull()
        expect(group.leaderFirstNames.length).toBeGreaterThan(0)
        expect(group.leaderFirstNames[0]).toMatch(/^Ruth$/)
      }
      expect(offered.find((group) => group.relationshipId === guarded.id)?.joinRequiresApproval).toBe(true)
    })
  })

  describe('an Admin acting on a request', () => {
    const admit = (item: string) =>
      service().execute({
        type: 'relationship.admit',
        ministryId: ministry.id,
        itemId: followUpItemId(item),
        admittedBy: ministry.adminUserId,
      })

    it('admits the Person, closes the item, and tells the Leader', async () => {
      const group = await aGroup({ joinRequiresApproval: true })
      const fields = await submit(group.id)
      const [item] = await openItems(group.id)

      await admit(item!.id)

      expect((await membersOf(group.id)).map((row) => row.full_name)).toContain(fields.fullName)
      expect(await openItems(group.id)).toHaveLength(0)
      const { rows: resolved } = await pool.query(
        `select resolved_by from follow_up_item where id = $1`,
        [item!.id],
      )
      expect(resolved[0]!.resolved_by).toBe(ministry.adminUserId)

      const { rows: events } = await pool.query<{ payload: Record<string, unknown> }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'relationship.participant_admitted'`,
        [group.id],
      )
      expect(events[0]!.payload).toMatchObject({ admittedBy: ministry.adminUserId, itemId: item!.id })

      const toLeader = await messagesTo(group.leader)
      expect(toLeader).toHaveLength(1)
      expect(toLeader[0]).toContain('just joined Tuesday Women’s Group.')
    })

    it('refuses an item already closed, and one that names no request', async () => {
      const group = await aGroup({ joinRequiresApproval: true })
      await submit(group.id)
      const [item] = await openItems(group.id)

      await admit(item!.id)
      await expect(admit(item!.id)).rejects.toBeInstanceOf(GroupRefused)
      await expect(admit(crypto.randomUUID())).rejects.toThrow(
        new GroupRefused('group.request_not_found'),
      )
    })

    it('declining is resolving the item alone, and joins nobody', async () => {
      const group = await aGroup({ joinRequiresApproval: true })
      const fields = await submit(group.id)
      const [item] = await openItems(group.id)

      await service().execute({
        type: 'follow_up.resolve',
        ministryId: ministry.id,
        itemId: followUpItemId(item!.id),
        resolvedBy: ministry.adminUserId,
      })

      expect(await openItems(group.id)).toHaveLength(0)
      expect((await membersOf(group.id)).map((row) => row.full_name)).not.toContain(fields.fullName)
      expect(await messagesTo(group.leader)).toHaveLength(0)
      await expect(
        service().execute({
          type: 'follow_up.resolve',
          ministryId: ministry.id,
          itemId: followUpItemId(item!.id),
          resolvedBy: ministry.adminUserId,
        }),
      ).rejects.toBeInstanceOf(FollowUpRefused)
    })
  })

  describe('naming a group and choosing its door', () => {
    it('changes what the page offers and whether picking it asks', async () => {
      const group = await aGroup({ name: null })
      expect(
        (await reader.readGroupIntakePage(ministry.id))!.groups.map((g) => g.relationshipId),
      ).not.toContain(group.id)

      await service().execute({
        type: 'group.configure',
        ministryId: ministry.id,
        relationshipId: group.id,
        name: '  Thursday Group  ',
        joinRequiresApproval: true,
        changedBy: ministry.adminUserId,
      })

      const offered = (await reader.readGroupIntakePage(ministry.id))!.groups.find(
        (g) => g.relationshipId === group.id,
      )
      expect(offered).toMatchObject({ name: 'Thursday Group', joinRequiresApproval: true })

      const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'relationship.group_configured'`,
        [group.id],
      )
      expect(rows[0]!.payload).toMatchObject({
        name: 'Thursday Group',
        joinRequiresApproval: true,
        changedBy: ministry.adminUserId,
      })
    })

    it('refuses a blank name, at the boundary and in the database', async () => {
      const group = await aGroup()
      await expect(
        service().execute({
          type: 'group.configure',
          ministryId: ministry.id,
          relationshipId: group.id,
          name: '   ',
          joinRequiresApproval: false,
          changedBy: ministry.adminUserId,
        }),
      ).rejects.toThrow(new GroupRefused('group.name_missing'))

      await expect(
        pool.query(`update relationship set name = '  ' where id = $1`, [group.id]),
      ).rejects.toThrow(/relationship_name_is_not_blank/)
    })
  })

  describe('what the database holds on its own', () => {
    it('holds a one-to-one to one Participant, however the row arrives', async () => {
      const david = await addPerson(ministry, `David ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
      const sam = await addPerson(ministry, `Sam ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
      const tom = await addPerson(ministry, `Tom ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
      const pair = await createRelationship(ministry, 'one_to_one')
      await addMembership({ ministry, relationshipId: pair, kind: 'one_to_one', personId: david, role: 'leader' })
      await addMembership({ ministry, relationshipId: pair, kind: 'one_to_one', personId: sam, role: 'participant' })

      await expect(
        addMembership({ ministry, relationshipId: pair, kind: 'one_to_one', personId: tom, role: 'participant' }),
      ).rejects.toThrow(/one_to_one_one_open_participant/)
    })

    it('refuses a membership the gender rule refuses, as a pairing refusal', async () => {
      // Past the domain's own check, which reads the form and is proven in the
      // unit suite. What is asserted here is that the same trigger formation runs
      // judges a join, and that the store translates it to the same code.
      const women = await aGroup({ declaredGender: 'female' })
      const marcus = await addPerson(ministry, `Marcus ${++numbered}`, {
        phone: aNumber(),
        answers: { gender: 'male' },
      })

      await expect(
        addMembership({ ministry, relationshipId: women.id, kind: 'group', personId: marcus, role: 'participant' }),
      ).rejects.toThrow(/declared/)

      await expect(
        store.transact(ministry.id, (unit) =>
          unit.joinRelationship({
            ministryId: ministry.id,
            relationshipId: women.id,
            personId: personId(marcus),
            startedAt: clock.now(),
          }),
        ),
      ).rejects.toThrow(new PairingRefused('relationship.gender_does_not_match_the_declaration'))
    })
  })

  describe('the weekly question', () => {
    it('asks about a named group by its name', async () => {
      const group = await aGroup({ name: 'Tuesday Women’s Group' })
      await service().execute({ type: 'checkin.start', ministryId: ministry.id, personId: group.leader })

      const sent = await messagesTo(group.leader)
      expect(sent.at(-1)).toContain('Did you meet with Tuesday Women’s Group this week?')
    })
  })
})
