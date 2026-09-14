import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { relationshipId } from '~/domain/ids'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { materialsFrom, readMaterials } from '~/platform/supabase/materials-reader'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addMembership,
  addPerson,
  addPersonWithAccount,
  assignMaterial,
  createMinistryWithAdmin,
  localSupabase,
  openMaterialHistory,
  pairOneToOne,
  serviceRoleClient,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Materials tab answers in one read (`.scratch/materials/spec.md`, ticket
 * 01). `materials_page` and its two aliases return the whole tab in one
 * document: the session verdict, the Overview's history, the Materials, every
 * period, the accepted unended relationships, and the genders the filter reads.
 * These prove the document says what the separate reads would have said, that
 * the derivation over it files each relationship where the spec says, and that
 * it says nothing to anyone the reads would have refused.
 */

const PAGES = ['materials_page', 'material_page', 'new_material_page'] as const

const asDocument = (data: unknown) => data as Record<string, unknown>
const asRows = (data: unknown) => data as Record<string, unknown>[]

describe('the Materials tab answers in one read', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let leader: AccountFixture
  let participant: AccountFixture
  let groupLeader: AccountFixture
  let oneToOne: string
  let womensGroup: string
  let mixedGroup: string
  let unaccepted: string
  let ended: string
  let masterPlan: string
  let prayer: string

  // The one-to-one's history: accepted on the 1st, on the Master Plan from the 8th.
  const acceptedAt = new Date('2026-08-01T09:00:00Z')
  const assignedAt = new Date('2026-08-08T09:00:00Z')

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Folder Chapel')
    other = await createMinistryWithAdmin('The Chapel Next Door')

    leader = await addPersonWithAccount(ministry, 'Lee Leader', 'leader', { answers: { gender: 'male' } })
    participant = await addPersonWithAccount(ministry, 'Pat Participant', 'leader', {
      answers: { gender: 'male' },
    })
    groupLeader = await addPersonWithAccount(ministry, 'Grace Groupleader', 'leader', {
      answers: { gender: 'female' },
    })

    // A one-to-one that declared nothing, led by a man: files under Men's.
    oneToOne = await pairOneToOne(ministry, leader.personId, participant.personId, { acceptedAt })
    masterPlan = await addMaterial(ministry, 'The Master Plan of Evangelism')
    prayer = await addMaterial(ministry, 'Prayer practices')
    await assignMaterial(oneToOne, masterPlan, ministry.adminUserId, assignedAt)

    // A women's group, on no Material: files under Women's, in the dashed folder.
    womensGroup = await aGroup(ministry, 'Tuesday women', 'female', groupLeader.personId, [
      await addPerson(ministry, 'Wendy Member', { answers: { gender: 'female' } }),
      await addPerson(ministry, 'Willa Member', { answers: { gender: 'female' } }),
    ])

    // A group that declared nothing: mixed, under All only. Its own Leader,
    // because a Leader leads one open group at a time.
    const mixedLeader = await addPersonWithAccount(ministry, 'Claire Delgado', 'leader', {
      answers: { gender: 'female' },
    })
    mixedGroup = await aGroup(ministry, 'Thursday evening', null, mixedLeader.personId, [
      await addPerson(ministry, 'Max Member', { answers: { gender: 'male' } }),
    ])

    // Neither of these appears anywhere on the tab.
    unaccepted = await pairOneToOne(
      ministry,
      (await addPersonWithAccount(ministry, 'Una Unaccepted', 'leader', { answers: { gender: 'male' } })).personId,
      await addPerson(ministry, 'Ulysses Waiting', { answers: { gender: 'male' } }),
      { acceptedAt: null },
    )
    ended = await pairOneToOne(
      ministry,
      (await addPersonWithAccount(ministry, 'Eddie Ended', 'leader', { answers: { gender: 'male' } })).personId,
      await addPerson(ministry, 'Ernest Gone', { answers: { gender: 'male' } }),
      { acceptedAt },
    )
    // Ended the way an Admin ends one, so the memberships close with it.
    const store = createPostgresEffectStore(localSupabase().databaseUrl)
    try {
      await createCommandService({
        clock: createTestClock(new Date()),
        ids: { next: () => crypto.randomUUID() },
        store,
        appBaseUrl: 'https://discipler.test',
      }).execute({
        type: 'relationship.end',
        ministryId: ministry.id,
        relationshipId: relationshipId(ended),
        reason: 'They finished the material together.',
        outcome: 'completed',
        endedBy: ministry.adminUserId,
      })
    } finally {
      await store.close()
    }
  })

  it('carries the Materials, every period, the accepted unended relationships and the genders', async () => {
    const admin = await signInAs(ministry)
    const { data, error } = await admin.rpc('materials_page', { gender: 'female' })
    expect(error).toBeNull()
    const doc = asDocument(data)

    expect(doc.session).toBe('admin')
    expect(asDocument(doc.admin).ministry_id).toBe(ministry.id)
    expect(Object.keys(doc).sort()).toEqual(
      ['admin', 'genders', 'history', 'material_periods', 'materials', 'relationships', 'session', 'user_id'],
    )

    // The Overview's history, row for row.
    const overview = asDocument((await admin.rpc('overview_page')).data)
    expect(doc.history).toEqual(overview.history)

    // The Ministry's Materials in title order, with the flag ticket 02 fills in.
    expect(asRows(doc.materials)).toEqual([
      { id: prayer, title: 'Prayer practices', body: 'The text of Prayer practices.', pdf_path: null, pdf_filename: null, removed: null },
      { id: masterPlan, title: 'The Master Plan of Evangelism', body: 'The text of The Master Plan of Evangelism.', pdf_path: null, pdf_filename: null, removed: null },
    ])

    // Every period, as the function that emits them gapless gives them.
    const periods = await admin.rpc('material_periods', { target_ministry_id: ministry.id })
    expect(doc.material_periods).toEqual(periods.data)

    // Accepted and unended, and nothing else, with the columns the cards read.
    const relationships = asRows(doc.relationships)
    expect(relationships.map((row) => row.id).sort()).toEqual([oneToOne, womensGroup, mixedGroup].sort())
    expect(relationships.find((row) => row.id === womensGroup)).toEqual({
      id: womensGroup,
      kind: 'group',
      name: 'Tuesday women',
      declared_gender: 'female',
      accepted_at: expect.any(String),
    })
    expect(relationships.find((row) => row.id === oneToOne)).toMatchObject({ name: null, declared_gender: null })

    // What each member said at Intake, for the one-to-one rule.
    const genders = asRows(doc.genders)
    expect(genders.find((row) => row.person_id === leader.personId)?.gender).toBe('male')
    expect(genders.find((row) => row.person_id === groupLeader.personId)?.gender).toBe('female')
  })

  it('serves a folder and the new page from the same document under their own names', async () => {
    const admin = await signInAs(ministry)
    const tab = asDocument((await admin.rpc('materials_page')).data)

    for (const page of ['material_page', 'new_material_page'] as const) {
      const doc = asDocument((await admin.rpc(page)).data)
      expect(doc, page).toEqual(tab)
    }
  })

  it('derives the folders the tab shows, through a real session', async () => {
    const admin = await signInAs(ministry)
    const clock = createTestClock(new Date(assignedAt.getTime() + days(30)))

    const page = await readMaterials(admin, ministry.id, clock)
    expect(page.timeZone).toBe('UTC')
    expect(page.materials.map((material) => material.title)).toEqual([
      'Prayer practices',
      'The Master Plan of Evangelism',
    ])

    const byId = new Map(page.relationships.map((each) => [each.relationshipId, each]))
    expect([...byId.keys()].sort()).toEqual([oneToOne, womensGroup, mixedGroup].sort())

    // The one-to-one: on the Master Plan since the 8th, previously on nothing
    // from acceptance, filed under its Leader's gender.
    expect(byId.get(oneToOne as never)).toMatchObject({
      leaderNames: ['Lee Leader'],
      participantNames: ['Pat Participant'],
      groupName: null,
      isAGroup: false,
      acceptedAt,
      runningMaterialId: masterPlan,
      since: assignedAt,
      previously: [{ title: null, startedAt: acceptedAt, endedAt: assignedAt }],
      gender: 'male',
      state: 'healthy',
      openConcerns: 0,
    })

    // The women's group: on no Material since acceptance, nothing before, under
    // what it declared.
    expect(byId.get(womensGroup as never)).toMatchObject({
      leaderNames: ['Grace Groupleader'],
      participantNames: ['Wendy Member', 'Willa Member'],
      groupName: 'Tuesday women',
      isAGroup: true,
      runningMaterialId: null,
      previously: [],
      gender: 'female',
    })

    // The mixed group: under All only, though its one Leader is a woman.
    expect(byId.get(mixedGroup as never)).toMatchObject({
      leaderNames: ['Claire Delgado'],
      groupName: 'Thursday evening',
      isAGroup: true,
      runningMaterialId: null,
      gender: null,
    })

    // Healthy, and nothing on Care Needed: no badge, no flags.
    expect(page.care).toEqual([])
  })

  it('reads a relationship assigned at the instant of acceptance as having no history line', async () => {
    const admin = await signInAs(ministry)
    const swift = await addPersonWithAccount(ministry, 'Swift Leader', 'leader', { answers: { gender: 'male' } })
    const relationship = await pairOneToOne(
      ministry,
      swift.personId,
      await addPerson(ministry, 'Sam Swift', { answers: { gender: 'male' } }),
      { acceptedAt },
    )
    // Closes the opening period at its own start: a zero-length period that
    // covers no instant, and is not printed as one.
    await assignMaterial(relationship, prayer, ministry.adminUserId, acceptedAt)

    const page = await readMaterials(admin, ministry.id, createTestClock(new Date()))
    const card = page.relationships.find((each) => each.relationshipId === relationship)
    expect(card).toMatchObject({ runningMaterialId: prayer, since: acceptedAt, previously: [] })
  })

  it('tells a Leader who administers nothing so, and hands them no Ministry', async () => {
    const lead = await signInWith(leader)

    for (const page of PAGES) {
      const { data, error } = await lead.rpc(page)
      expect(error, page).toBeNull()
      const doc = asDocument(data)
      expect(doc.session, page).toBe('not-an-admin')
      expect(doc.user_id, page).toBe(leader.userId)
      for (const key of ['admin', 'history', 'materials', 'material_periods', 'relationships', 'genders']) {
        expect(doc, `${page} ${key}`).not.toHaveProperty(key)
      }
    }
  })

  it('answers signed-out to a token whose session has been ended', async () => {
    const stranded = await addPersonWithAccount(ministry, 'Sam Stranded', 'leader')
    const held = await signInWith(stranded)
    expect(asDocument((await held.rpc('materials_page')).data).session).toBe('not-an-admin')

    // A reset ends every session on the account (ADR-0016). The token is unchanged
    // and still verifies, so this verdict is the whole of how a page refuses it.
    await supabaseAccounts.setPassword(stranded.userId, 'harbinger-lantern-copper-fern')

    for (const page of PAGES) {
      const doc = asDocument((await held.rpc(page)).data)
      expect(doc, page).toEqual({ session: 'signed-out' })
    }
  })

  it('answers nobody without a session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const nobody = createClient(apiUrl, anonKey)

    for (const page of PAGES) {
      expect((await nobody.rpc(page)).error, page).not.toBeNull()
    }
  })

  it('shows an Admin of another Ministry none of this one', async () => {
    const neighbour = await signInAs(other)
    const doc = asDocument((await neighbour.rpc('materials_page')).data)
    expect(asDocument(doc.admin).ministry_id).toBe(other.id)
    expect(doc.materials).toEqual([])
    expect(doc.material_periods).toEqual([])
    expect(doc.relationships).toEqual([])
    expect(doc.genders).toEqual([])

    // And the derivation over it is the empty tab.
    expect(materialsFrom(doc, createTestClock(new Date()))).toMatchObject({
      materials: [],
      relationships: [],
      care: [],
    })
    // A reader asked about a Ministry the session does not administer reads the
    // empty state the policies would have returned.
    const page = await readMaterials(neighbour, ministry.id, createTestClock(new Date()))
    expect(page).toEqual({ timeZone: null, materials: [], relationships: [], care: [] })
  })
})

/**
 * A group, formed as the Pair form forms one: named, declaring a gender or none,
 * accepted, with its history opened at acceptance.
 */
const aGroup = async (
  ministry: MinistryFixture,
  name: string,
  declaredGender: 'male' | 'female' | null,
  leaderId: string,
  participantIds: readonly string[],
): Promise<string> => {
  const acceptedAt = new Date('2026-08-01T09:00:00Z')
  const { data, error } = await serviceRoleClient()
    .from('relationship')
    .insert({
      ministry_id: ministry.id,
      kind: 'group',
      name,
      declared_gender: declaredGender,
      accepted_at: acceptedAt.toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not form the group ${name}: ${error.message}`)
  await openMaterialHistory(ministry, data.id, acceptedAt)
  await addMembership({ ministry, relationshipId: data.id, kind: 'group', personId: leaderId, role: 'leader' })
  for (const personId of participantIds) {
    await addMembership({ ministry, relationshipId: data.id, kind: 'group', personId, role: 'participant' })
  }
  return data.id
}

