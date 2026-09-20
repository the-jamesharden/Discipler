import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '~/domain/clock'
import { GroupJoinRefused, PairingRefused } from '~/domain/errors'
import { followUpItemId, personId, relationshipId, type IdSource } from '~/domain/ids'
import { GROUP_PATH } from '~/domain/intake'
import { groupJoinedMessage, leaderDashboardLink } from '~/domain/outbound-copy'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  optOut,
  pairOneToOne,
  pauseRelationship,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, ticket 22, stage 1: an Admin putting a Disciple into a group that
 * already exists, underneath the screens. What the command writes, which groups it
 * reaches, and what the command and the database each refuse.
 */
describe('an Admin puts a Disciple into a group', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  // Nothing here is decided against a date, so the real clock: a pinned one beside
  // fixtures stamped with the real one is a date bomb.
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const APP = 'https://discipler.test'
  const service = () => createCommandService({ clock: systemClock, ids, store, appBaseUrl: APP })

  let numbered = 0
  const named = (first: string) => `${first} Joiner${++numbered}`

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    other = await createMinistryWithAdmin('The Chapel Across The Road')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  type Gender = 'male' | 'female'

  const aGroup = async (
    over: {
      readonly in?: MinistryFixture
      readonly name?: string | null
      readonly declaredGender?: Gender | null
      readonly accepted?: boolean
      readonly joinRequiresApproval?: boolean
    } = {},
  ) => {
    const gender: Gender = over.declaredGender ?? 'male'
    const name = over.name === undefined ? `Thursday Table ${++numbered}` : over.name
    const group = await formGroup(over.in ?? ministry, {
      name,
      declaredGender: over.declaredGender === undefined ? 'male' : over.declaredGender,
      joinRequiresApproval: over.joinRequiresApproval ?? false,
      ...(over.accepted === false ? { acceptedAt: null } : {}),
      leader: { name: named('David'), phone: aTestPhoneNumber(), gender },
      disciples: [
        { name: named('Emil'), phone: aTestPhoneNumber(), gender },
        { name: named('Felix'), phone: aTestPhoneNumber(), gender },
      ],
    })
    return { ...group, name }
  }

  const aDisciple = (gender: Gender = 'male', inMinistry: MinistryFixture = ministry) =>
    addPerson(inMinistry, named('Sam'), { phone: aTestPhoneNumber(), answers: { gender } })

  const add = (group: string, person: string) =>
    service().execute({
      type: 'group.add_participant',
      ministryId: ministry.id,
      relationshipId: relationshipId(group),
      personId: personId(person),
      addedBy: ministry.adminUserId,
    })

  const openMembership = async (group: string, person: string) => {
    const { rows } = await pool.query<{ role: string; kind: string }>(
      `select role, kind from relationship_member
        where relationship_id = $1 and person_id = $2 and ended_at is null`,
      [group, person],
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

  /** Everything about the group that joining it must leave as it was. */
  const theGroupItself = async (group: string) => {
    const { rows } = await pool.query(
      `select r.name, r.declared_gender, r.join_requires_approval, r.accepted_at, r.ended_at,
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

  const refusalOf = async (attempt: Promise<unknown>) => {
    try {
      await attempt
    } catch (error) {
      if (error instanceof GroupJoinRefused || error instanceof PairingRefused) return error.refusal
      throw error
    }
    throw new Error('Expected a refusal, and the command went through')
  }

  describe('a ready Disciple and a running group', () => {
    it('is in it at once, recorded as the Admin’s act, with the Discipler told and nobody else', async () => {
      const group = await aGroup()
      const sam = await aDisciple()
      const { rows: samRow } = await pool.query<{ full_name: string }>(
        `select full_name from person where id = $1`,
        [sam],
      )
      const before = await theGroupItself(group.id)

      await add(group.id, sam)

      expect(await openMembership(group.id, sam)).toEqual([{ role: 'participant', kind: 'group' }])

      // An event of its own type: not the self-join's and not the admission's.
      const { rows: events } = await pool.query<{ type: string; payload: unknown }>(
        `select type, payload from ministry_event
          where subject_id = $1 and type like 'relationship.participant_%'`,
        [group.id],
      )
      expect(events).toEqual([
        {
          type: 'relationship.participant_added',
          payload: { personId: sam, addedBy: ministry.adminUserId },
        },
      ])

      // The message a self-join sends, to the Discipler, and nothing to anybody else.
      expect(await messagesTo(group.leader)).toEqual([
        groupJoinedMessage({
          ministryName: 'Riverside Chapel',
          joinerFullName: samRow[0]!.full_name,
          groupName: group.name!,
          dashboardLink: leaderDashboardLink(APP),
        }),
      ])
      expect(await messagesTo(sam)).toEqual([])
      for (const disciple of group.disciples) expect(await messagesTo(disciple)).toEqual([])

      // Its Material, its name, its declaration and its state, as they were.
      expect(await theGroupItself(group.id)).toEqual(before)
    })

    it('takes somebody already in a one-to-one, and somebody already in another group', async () => {
      const sam = await aDisciple()
      const mentor = await addPerson(ministry, named('Mark'), { answers: { gender: 'male' } })
      await pairOneToOne(ministry, mentor, sam)

      const first = await aGroup()
      const second = await aGroup()
      await add(first.id, sam)
      await add(second.id, sam)

      expect(await openMembership(first.id, sam)).toHaveLength(1)
      expect(await openMembership(second.id, sam)).toHaveLength(1)
    })
  })

  describe('every group the Pair document lists can be joined', () => {
    it('a paused one, which stays paused', async () => {
      const group = await aGroup()
      await pauseRelationship(ministry, group.id)
      const before = await theGroupItself(group.id)
      const sam = await aDisciple()

      await add(group.id, sam)

      expect(await openMembership(group.id, sam)).toHaveLength(1)
      expect(await theGroupItself(group.id)).toEqual(before)
      expect(await messagesTo(group.leader)).toHaveLength(1)
    })

    it('one still awaiting its Discipler, who is sent nothing, and it goes on waiting', async () => {
      const group = await aGroup({ accepted: false })
      const sam = await aDisciple()

      await add(group.id, sam)

      expect(await openMembership(group.id, sam)).toHaveLength(1)
      expect(await messagesTo(group.leader)).toEqual([])
      expect((await theGroupItself(group.id)).accepted_at).toBeNull()
    })

    it('one nobody has named', async () => {
      const group = await aGroup({ name: null })
      const sam = await aDisciple()

      await add(group.id, sam)

      expect(await openMembership(group.id, sam)).toHaveLength(1)
      expect((await messagesTo(group.leader))[0]).toContain('just joined your group.')
    })
  })

  describe('the rules forming a group is held to', () => {
    it('refuses somebody who has not completed Intake', async () => {
      const group = await aGroup({ declaredGender: null })
      const imported = await addPerson(ministry, named('Ivan'), { intake: false })

      expect(await refusalOf(add(group.id, imported))).toBe(
        'relationship.participant_has_not_completed_intake',
      )
      expect(await openMembership(group.id, imported)).toEqual([])
    })

    it('refuses somebody who has opted out', async () => {
      const group = await aGroup()
      const sam = await aDisciple()
      await optOut(ministry, sam)

      expect(await refusalOf(add(group.id, sam))).toBe('relationship.participant_has_opted_out')
    })

    it('refuses a woman a men’s group and takes her into a mixed one', async () => {
      const mens = await aGroup({ declaredGender: 'male' })
      const mixed = await aGroup({ declaredGender: null })
      const priya = await aDisciple('female')

      expect(await refusalOf(add(mens.id, priya))).toBe(
        'relationship.gender_does_not_match_the_declaration',
      )
      expect(await messagesTo(mens.leader)).toEqual([])

      await add(mixed.id, priya)
      expect(await openMembership(mixed.id, priya)).toHaveLength(1)
    })

    /**
     * No gender on file is somebody no form has asked, which is somebody who has
     * not completed Intake. The readiness rule is what refuses them, with something
     * the Admin can act on, and never *genders do not match*.
     */
    it('refuses somebody with no gender on file by the readiness rule, in a men’s group', async () => {
      const mens = await aGroup({ declaredGender: 'male' })
      const unasked = await addPerson(ministry, named('Una'), { intake: false })

      expect(await refusalOf(add(mens.id, unasked))).toBe(
        'relationship.participant_has_not_completed_intake',
      )
    })
  })

  describe('what it refuses with a code of its own', () => {
    it('a group that has ended', async () => {
      const group = await aGroup()
      await service().execute({
        type: 'relationship.end',
        ministryId: ministry.id,
        relationshipId: relationshipId(group.id),
        reason: 'They stopped meeting.',
        outcome: 'discontinued',
        endedBy: ministry.adminUserId,
      })
      const sam = await aDisciple()

      expect(await refusalOf(add(group.id, sam))).toBe('joining.group_has_ended')
      expect(await openMembership(group.id, sam)).toEqual([])
    })

    it('a one-to-one, which is not a group', async () => {
      const mentor = await addPerson(ministry, named('Mark'), { answers: { gender: 'male' } })
      const mentee = await aDisciple()
      const oneToOne = await pairOneToOne(ministry, mentor, mentee)
      const sam = await aDisciple()

      expect(await refusalOf(add(oneToOne, sam))).toBe('joining.not_a_group')
      expect(await openMembership(oneToOne, sam)).toEqual([])
    })

    it('somebody already in it, being discipled or leading it', async () => {
      const group = await aGroup()

      expect(await refusalOf(add(group.id, group.disciples[0]!))).toBe('joining.already_in_the_group')
      expect(await refusalOf(add(group.id, group.leader))).toBe('joining.already_in_the_group')
      expect(await openMembership(group.id, group.leader)).toEqual([{ role: 'leader', kind: 'group' }])
    })

    it('another Ministry’s group, as no group at all', async () => {
      const theirs = await aGroup({ in: other })
      const sam = await aDisciple()

      expect(await refusalOf(add(theirs.id, sam))).toBe('joining.group_not_found')
      expect(await refusalOf(add(crypto.randomUUID(), sam))).toBe('joining.group_not_found')
      expect(await openMembership(theirs.id, sam)).toEqual([])
    })

    it('another Ministry’s Person, as nobody at all', async () => {
      const group = await aGroup()
      const stranger = await aDisciple('male', other)

      expect(await refusalOf(add(group.id, stranger))).toBe('joining.person_not_found')
      expect(await refusalOf(add(group.id, crypto.randomUUID()))).toBe('joining.person_not_found')
      expect(await openMembership(group.id, stranger)).toEqual([])
    })
  })

  /**
   * The spec does not say what becomes of a request to join the same group that
   * is still open. Nothing is closed on the Admin's behalf: it stays where it was,
   * and answering it later is what it already is for somebody who got in another
   * way -- the item is resolved and nobody is joined twice.
   */
  describe('an open request of theirs to join the same group', () => {
    it('is left open, and admitting it afterwards closes it and joins nobody', async () => {
      const group = await aGroup({ joinRequiresApproval: true })
      const fullName = named('Priyan')
      await service().execute({
        type: 'intake.submit',
        ministryId: ministry.id,
        form: {
          fullName,
          phone: aTestPhoneNumber(),
          email: null,
          ageBand: '25-34',
          gender: 'male',
          goalId: null,
          availability: ['tuesday:19'],
          smsConsent: true,
          contactSharing: 'granted',
          source: 'pastor_link',
          intakePath: GROUP_PATH,
          declaredSide: null,
          experience: null,
          groupId: group.id,
        },
      })
      const openRequests = async () => {
        const { rows } = await pool.query<{ id: string; person_id: string }>(
          `select id, person_id from follow_up_item
            where relationship_id = $1 and kind = 'group_join_requested' and resolved_at is null`,
          [group.id],
        )
        return rows
      }
      const [request] = await openRequests()
      expect(request).toBeDefined()

      await add(group.id, request!.person_id)

      expect(await openMembership(group.id, request!.person_id)).toHaveLength(1)
      expect(await openRequests()).toEqual([request])

      await service().execute({
        type: 'relationship.admit',
        ministryId: ministry.id,
        itemId: followUpItemId(request!.id),
        admittedBy: ministry.adminUserId,
      })

      expect(await openRequests()).toEqual([])
      expect(await openMembership(group.id, request!.person_id)).toHaveLength(1)
      // Told once, when they joined, and not again when the request was closed.
      expect(await messagesTo(group.leader)).toHaveLength(1)
    })
  })
})
