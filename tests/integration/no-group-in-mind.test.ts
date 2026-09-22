import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '~/domain/clock'
import { followUpItemId, personId, relationshipId, type IdSource } from '~/domain/ids'
import { GROUP_PATH, NO_GROUP_IN_MIND, type IntakeFormFields } from '~/domain/intake'
import { careNeededFrom, withPlacements } from '~/platform/supabase/care-needed-reader'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { documentFor } from '~/platform/supabase/page'
import { historyOf } from '~/platform/supabase/relationship-history'
import { createCommandService } from '~/service/command-service'
import type { PlacementWanted } from '~/service/ports'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Group form exits, ticket 01, underneath the screens: a submission with no group
 * in mind raises one `group_placement_wanted` item per Person, placing them in a
 * group closes it and writes the membership, resolving closes it without one, and
 * the item offers only the groups open to them.
 */
describe('no group in mind', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  // Nothing here is decided against a date, so the real clock: a pinned one beside
  // fixtures stamped with the real one is a date bomb.
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock: systemClock, ids, store, appBaseUrl: 'https://discipler.test' })

  let numbered = 0
  const named = (first: string) => `${first} Placed${++numbered}`

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Grace Fellowship')
    other = await createMinistryWithAdmin('The Chapel Across The Road')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const signsUp = async (
    fullName: string,
    phone: string,
    over: Partial<IntakeFormFields> = {},
    inMinistry: MinistryFixture = ministry,
  ) => {
    await service().execute({
      type: 'intake.submit',
      ministryId: inMinistry.id,
      form: {
        fullName,
        phone,
        email: null,
        ageBand: '25-34',
        gender: 'male',
        goalId: null,
        availability: ['tuesday:18', 'thursday:18'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: GROUP_PATH,
        declaredSide: null,
        experience: null,
        groupId: NO_GROUP_IN_MIND,
        ...over,
      },
    })
    const { rows } = await pool.query<{ id: string }>(
      `select id from person where ministry_id = $1 and full_name = $2`,
      [inMinistry.id, fullName],
    )
    return rows[0]!.id
  }

  const itemsOf = async (person: string) => {
    const { rows } = await pool.query<{
      id: string
      relationship_id: string | null
      payload: unknown
      resolved_at: Date | null
      resolved_by: string | null
    }>(
      `select id, relationship_id, payload, resolved_at, resolved_by from follow_up_item
        where person_id = $1 and kind = 'group_placement_wanted'
        order by raised_at, id`,
      [person],
    )
    return rows
  }

  const aGroup = async (declaredGender: 'male' | 'female' | null, over: { accepted?: boolean; name?: string | null } = {}) => {
    const gender = declaredGender ?? 'male'
    const name = over.name === undefined ? `Group ${named('G')}` : over.name
    const group = await formGroup(ministry, {
      name,
      declaredGender,
      ...(over.accepted === false ? { acceptedAt: null } : {}),
      leader: { name: named('Leader'), phone: aTestPhoneNumber(), gender },
      disciples: [{ name: named('Disciple'), phone: aTestPhoneNumber(), gender }],
    })
    return { ...group, name }
  }

  const place = (group: string, person: string) =>
    service().execute({
      type: 'group.add_participant',
      ministryId: ministry.id,
      relationshipId: relationshipId(group),
      personId: personId(person),
      addedBy: ministry.adminUserId,
    })

  /** What the Follow-Up tab shows for one Person's item, read as the Admin. */
  const placementShownFor = async (person: string): Promise<PlacementWanted | null> => {
    const doc = await documentFor(await signInAs(ministry), ministry.id, 'follow_up_page')
    if (!doc) throw new Error('the Admin should read their own Follow-Up tab')
    const history = historyOf(doc)
    const item = withPlacements(careNeededFrom(history, systemClock), doc, history.timeZone).find(
      (each) => each.source === 'follow_up' && each.personId === person,
    )
    return item?.source === 'follow_up' ? item.placement : null
  }

  it('lands them on the Roster with the group path recorded, no group named and one item raised', async () => {
    const jonah = await signsUp(named('Jonah'), aTestPhoneNumber())

    const { rows: consents } = await pool.query<{ intake_path: string }>(
      `select distinct intake_path::text from consent_record where person_id = $1`,
      [jonah],
    )
    expect(consents).toEqual([{ intake_path: 'group' }])
    const { rows: memberships } = await pool.query(
      `select 1 from relationship_member where person_id = $1`,
      [jonah],
    )
    expect(memberships).toEqual([])

    const [item, ...more] = await itemsOf(jonah)
    expect(more).toEqual([])
    expect(item).toMatchObject({ relationship_id: null, payload: {}, resolved_at: null })
  })

  it('raises one item per Person however often they ask, and records every ask', async () => {
    const fullName = named('Micah')
    const phone = aTestPhoneNumber()
    const micah = await signsUp(fullName, phone)
    await signsUp(fullName, phone)

    expect(await itemsOf(micah)).toHaveLength(1)
    const { rows: asks } = await pool.query(
      `select 1 from ministry_event where subject_id = $1 and type = 'person.group_placement_wanted'`,
      [micah],
    )
    expect(asks).toHaveLength(2)
  })

  describe('what the migration holds', () => {
    const insert = (person: string, relationship: string | null, payload: object) =>
      pool.query(
        `insert into follow_up_item (ministry_id, kind, person_id, relationship_id, raised_at, payload)
         values ($1, 'group_placement_wanted', $2, $3, now(), $4)`,
        [ministry.id, person, relationship, JSON.stringify(payload)],
      )

    it('holds one open item per Person, by the one-open-item index', async () => {
      const ruth = await signsUp(named('Ruth'), aTestPhoneNumber())
      await expect(insert(ruth, null, {})).rejects.toThrow(/follow_up_item_one_open_per_subject/)
    })

    it('refuses the item a relationship, and a payload', async () => {
      const group = await aGroup(null)
      const amos = await signsUp(named('Amos'), aTestPhoneNumber())
      // Resolved first, so the one-open-item index is not what refuses these.
      const [item] = await itemsOf(amos)
      await service().execute({
        type: 'follow_up.resolve',
        ministryId: ministry.id,
        itemId: followUpItemId(item!.id),
        resolvedBy: ministry.adminUserId,
      })

      await expect(insert(amos, group.id, {})).rejects.toThrow(
        /follow_up_item_placement_names_only_a_person/,
      )
      await expect(insert(amos, null, { groupId: group.id })).rejects.toThrow(
        /follow_up_item_payload_matches_kind/,
      )
    })
  })

  describe('placing them', () => {
    it('writes the membership and closes the item in the same act, by the Admin', async () => {
      const group = await aGroup('male')
      const jonah = await signsUp(named('Jonah'), aTestPhoneNumber())
      const [item] = await itemsOf(jonah)

      await place(group.id, jonah)

      const { rows: memberships } = await pool.query<{ role: string }>(
        `select role from relationship_member where relationship_id = $1 and person_id = $2 and ended_at is null`,
        [group.id, jonah],
      )
      expect(memberships).toEqual([{ role: 'participant' }])

      const [closed] = await itemsOf(jonah)
      expect(closed).toMatchObject({ id: item!.id, resolved_by: ministry.adminUserId })
      expect(closed!.resolved_at).not.toBeNull()

      const { rows: events } = await pool.query<{ payload: unknown }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'relationship.participant_added'`,
        [group.id],
      )
      expect(events).toEqual([
        { payload: { personId: jonah, addedBy: ministry.adminUserId, placementItemId: item!.id } },
      ])
    })

    it('leaves the item open when the gender trigger refuses the group', async () => {
      const womens = await aGroup('female')
      const jonah = await signsUp(named('Jonah'), aTestPhoneNumber())

      await expect(place(womens.id, jonah)).rejects.toThrow(
        /relationship.gender_does_not_match_the_declaration/,
      )
      const [item] = await itemsOf(jonah)
      expect(item!.resolved_at).toBeNull()
    })

    it('resolving it alone closes it and writes no membership', async () => {
      const jonah = await signsUp(named('Jonah'), aTestPhoneNumber())
      const [item] = await itemsOf(jonah)

      await service().execute({
        type: 'follow_up.resolve',
        ministryId: ministry.id,
        itemId: followUpItemId(item!.id),
        resolvedBy: ministry.adminUserId,
      })

      const [closed] = await itemsOf(jonah)
      expect(closed!.resolved_at).not.toBeNull()
      const { rows: memberships } = await pool.query(
        `select 1 from relationship_member where person_id = $1`,
        [jonah],
      )
      expect(memberships).toEqual([])
    })
  })

  describe('what the item shows', () => {
    it('offers only the groups open to them: their gender or mixed, accepted, named and unended', async () => {
      const mens = await aGroup('male')
      const mixed = await aGroup(null)
      const womens = await aGroup('female')
      const unaccepted = await aGroup('male', { accepted: false })
      const unnamed = await aGroup('male', { name: null })
      const jonah = await signsUp(named('Jonah'), aTestPhoneNumber())

      const shown = await placementShownFor(jonah)
      const offered = shown?.groups.map((group) => group.relationshipId) ?? []

      expect(offered).toEqual(expect.arrayContaining([mens.id, mixed.id]))
      for (const closed of [womens.id, unaccepted.id, unnamed.id]) expect(offered).not.toContain(closed)
    })

    it('carries what their latest Intake said', async () => {
      const fullName = named('Priya')
      const phone = aTestPhoneNumber()
      await signsUp(fullName, phone, { gender: 'female', ageBand: '35-44' })
      const priya = await signsUp(fullName, phone, { gender: 'female', ageBand: '35-44', availability: ['saturday:09'] })

      expect(await placementShownFor(priya)).toMatchObject({
        gender: 'female',
        ageBand: '35-44',
        availability: [{ day: 'saturday', hour: '09' }],
      })
    })

    it('is read by an Admin of the Ministry and nobody else', async () => {
      await signsUp(named('Hosea'), aTestPhoneNumber(), {}, other)

      const { data: theirs, error } = await (await signInAs(ministry)).rpc('group_placements_wanted', {
        target_ministry_id: other.id,
      })
      expect(error).toBeNull()
      expect(theirs).toEqual([])

      const { data: own } = await (await signInAs(other)).rpc('group_placements_wanted', {
        target_ministry_id: other.id,
      })
      expect(own).toHaveLength(1)
    })
  })
})
