import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AvailabilitySlot } from '~/domain/intake'
import { readRelationshipsLed } from '~/platform/supabase/leader-dashboard'
import { list, readPageDocument, section } from '~/platform/supabase/page'
import { rows } from '~/platform/supabase/rows'
import {
  addMaterial,
  addPerson,
  addPersonWithAccount,
  aTestPhoneNumber,
  assignMaterial,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  pauseRelationship,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * `relationships_page`, the one read behind `/relationships`: the session
 * verdict, the Admin or nothing, and everything the Leader Dashboard shows, where
 * the page used to loop once per Ministry, once per relationship and once per
 * person. The Leader Dashboard is everybody's, so the document answers for any
 * held session -- which is what makes this the one page function whose
 * `not-an-admin` answer carries data.
 *
 * Each list is the same rows the separate function gives the same session, so the
 * document is compared against those reads rather than against a shape of its own.
 */

/**
 * Rows in an order a test can compare, whatever order the aggregate chose. Keyed
 * by as many columns as it takes to tell two rows apart: one Person leading two
 * relationships holds two membership rows.
 */
const byId = (list: readonly Record<string, unknown>[], ...keys: readonly string[]) => {
  const keyOf = (row: Record<string, unknown>) => keys.map((key) => String(row[key])).join('/')
  return [...list].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
}

/** A grid as a list of cells, so two readings of it compare as sets. */
const cells = (list: readonly Record<string, unknown>[]) =>
  list.map((row) => `${row.person_id}:${row.day}:${row.hour}`).sort()

describe('the relationships page answers in one read', () => {
  let riverside: MinistryFixture
  let admin: SupabaseClient

  // Karen leads Ada, and leads Ben in a relationship a Pause stands on.
  let karen: AccountFixture
  let asKaren: SupabaseClient
  let ada: string
  let adaPhone: string
  let ben: string
  let karenAndAda: string
  let karenAndBen: string
  let romans: string

  // The Admin leads too, so their document carries a dashboard of its own.
  let cal: string
  let adminAndCal: string

  const separately = async (client: SupabaseClient, fn: string, args: Record<string, string>) => {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw new Error(error.message)
    return rows(data)
  }

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')

    const karensSlots: AvailabilitySlot[] = [
      { day: 'monday', hour: '12' },
      { day: 'wednesday', hour: '18' },
    ]
    const adasSlots: AvailabilitySlot[] = [
      { day: 'monday', hour: '12' },
      { day: 'thursday', hour: '09' },
    ]

    karen = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader', {
      answers: { availability: karensSlots },
    })
    adaPhone = aTestPhoneNumber()
    ada = await addPerson(riverside, 'Ada Rowe', { phone: adaPhone, answers: { availability: adasSlots } })
    ben = await addPerson(riverside, 'Ben Okafor', { phone: aTestPhoneNumber() })

    karenAndAda = await pairOneToOne(riverside, karen.personId, ada)
    karenAndBen = await pairOneToOne(riverside, karen.personId, ben)
    await pauseRelationship(riverside, karenAndBen)

    romans = await addMaterial(riverside, 'Romans, weeks 1-6')
    await assignMaterial(karenAndAda, romans, riverside.adminUserId)

    // The Admin is a Person on their own Roster like everybody else, and Intake is
    // their own act: it is what lets their number be shared with the people they
    // lead.
    await completeIntake(riverside, riverside.adminPersonId)
    cal = await addPerson(riverside, 'Cal Mendes', { phone: aTestPhoneNumber() })
    adminAndCal = await pairOneToOne(riverside, riverside.adminPersonId, cal)

    admin = await signInAs(riverside)
    asKaren = await signInWith(karen)
  })

  it('carries the Admin and the dashboard of what they lead, row for row with the separate reads', async () => {
    const doc = await readPageDocument(admin, 'relationships_page')

    expect(doc.session).toBe('admin')
    expect(doc.admin).toEqual({
      ministry_id: riverside.id,
      ministry_name: 'Riverside Chapel',
      person_id: riverside.adminPersonId,
    })

    const dashboard = section(doc, 'dashboard')

    expect(dashboard.mine).toEqual([riverside.adminPersonId])
    expect(list(dashboard, 'leaderships')).toEqual([
      {
        relationship_id: adminAndCal,
        ministry_id: riverside.id,
        person_id: riverside.adminPersonId,
        role: 'leader',
      },
    ])
    expect(byId(list(dashboard, 'members'), 'person_id')).toEqual(
      byId(
        [
          { relationship_id: adminAndCal, ministry_id: riverside.id, person_id: riverside.adminPersonId, role: 'leader' },
          { relationship_id: adminAndCal, ministry_id: riverside.id, person_id: cal, role: 'participant' },
        ],
        'person_id',
      ),
    )
    expect(list(dashboard, 'ministries')).toEqual([{ id: riverside.id, name: 'Riverside Chapel' }])
    expect(byId(list(dashboard, 'people'), 'id')).toEqual(
      byId(
        [
          { id: riverside.adminPersonId, full_name: riverside.adminName },
          { id: cal, full_name: 'Cal Mendes' },
        ],
        'id',
      ),
    )

    // The per-Ministry reads, as the same session gets them separately. An Admin
    // sees every period and every Pause in the Ministry, so Karen's are here too.
    const periods = await separately(admin, 'material_periods', { target_ministry_id: riverside.id })
    expect(periods.map((row) => row.relationship_id)).toContain(karenAndAda)
    expect(byId(list(dashboard, 'material_periods'), 'id')).toEqual(byId(periods, 'id'))

    const pauses = await separately(admin, 'relationship_pauses', { target_ministry_id: riverside.id })
    expect(pauses.map((row) => row.relationship_id)).toEqual([karenAndBen])
    expect(list(dashboard, 'pauses')).toEqual(pauses)

    // The per-relationship and per-person reads, for what the Admin leads alone.
    const grid = await separately(admin, 'relationship_availability', { target_relationship_id: adminAndCal })
    expect(grid.length).toBeGreaterThan(0)
    const availability = list(dashboard, 'availability')
    expect(availability.every((row) => row.relationship_id === adminAndCal)).toBe(true)
    expect(cells(availability)).toEqual(cells(grid))

    for (const person of [riverside.adminPersonId, cal]) {
      const [contact] = await separately(admin, 'contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: person,
      })
      expect(list(dashboard, 'contacts').filter((row) => row.person_id === person)).toEqual([
        { ministry_id: riverside.id, person_id: person, ...contact },
      ])
    }

    // No Material is assigned to what the Admin leads, so none travels with it,
    // however many the Ministry holds.
    expect(list(dashboard, 'materials')).toEqual([])
  })

  it('carries the dashboard and no Admin for a Leader who administers nothing', async () => {
    const doc = await readPageDocument(asKaren, 'relationships_page')

    expect(doc.session).toBe('not-an-admin')
    expect(doc.user_id).toBe(karen.userId)
    expect(doc.admin).toBeUndefined()

    const dashboard = section(doc, 'dashboard')

    expect(dashboard.mine).toEqual([karen.personId])
    expect(list(dashboard, 'leaderships').map((row) => row.relationship_id).sort()).toEqual(
      [karenAndAda, karenAndBen].sort(),
    )
    const membership = (row: Record<string, unknown>) => [row.relationship_id, row.person_id, row.role]
    expect(byId(list(dashboard, 'members'), 'relationship_id', 'person_id').map(membership)).toEqual(
      byId(
        [
          { relationship_id: karenAndAda, person_id: karen.personId, role: 'leader' },
          { relationship_id: karenAndAda, person_id: ada, role: 'participant' },
          { relationship_id: karenAndBen, person_id: karen.personId, role: 'leader' },
          { relationship_id: karenAndBen, person_id: ben, role: 'participant' },
        ],
        'relationship_id',
        'person_id',
      ).map(membership),
    )
    expect(list(dashboard, 'ministries')).toEqual([{ id: riverside.id, name: 'Riverside Chapel' }])
    expect(byId(list(dashboard, 'people'), 'id').map((row) => row.full_name)).toEqual(
      byId(
        [
          { id: karen.personId, full_name: 'Karen Whitfield' },
          { id: ada, full_name: 'Ada Rowe' },
          { id: ben, full_name: 'Ben Okafor' },
        ],
        'id',
      ).map((row) => row.full_name),
    )

    // The grid of each relationship she leads, tagged with which one it is for.
    for (const relationship of [karenAndAda, karenAndBen]) {
      const grid = await separately(asKaren, 'relationship_availability', {
        target_relationship_id: relationship,
      })
      expect(
        cells(list(dashboard, 'availability').filter((row) => row.relationship_id === relationship)),
      ).toEqual(cells(grid))
    }

    // The number of everyone in both, where they currently agree to share one.
    for (const person of [karen.personId, ada, ben]) {
      const [contact] = await separately(asKaren, 'contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: person,
      })
      expect(contact).toBeDefined()
      expect(list(dashboard, 'contacts').filter((row) => row.person_id === person)).toEqual([
        { ministry_id: riverside.id, person_id: person, ...contact },
      ])
    }

    // What she is working through with Ada, and the Pause standing on Ben's.
    expect(list(dashboard, 'materials')).toEqual([
      { id: romans, body: 'The text of Romans, weeks 1-6.', pdf_path: null, pdf_filename: null, items: [] },
    ])
    expect(list(dashboard, 'pauses').map((row) => row.relationship_id)).toEqual([karenAndBen])
    const periods = await separately(asKaren, 'material_periods', { target_ministry_id: riverside.id })
    expect(byId(list(dashboard, 'material_periods'), 'id')).toEqual(byId(periods, 'id'))
  })

  it('refuses a visitor with no session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const nobody = createClient(apiUrl, anonKey)

    expect((await nobody.rpc('relationships_page')).error).not.toBeNull()
  })

  it('answers for the session’s own relationships and no other Ministry’s', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')

    const doc = await readPageDocument(await signInAs(northgate), 'relationships_page')

    expect(doc.admin).toMatchObject({ ministry_id: northgate.id })
    const dashboard = section(doc, 'dashboard')
    expect(dashboard.mine).toEqual([northgate.adminPersonId])
    for (const key of ['leaderships', 'members', 'ministries', 'material_periods', 'pauses', 'people', 'availability', 'materials', 'contacts']) {
      expect(list(dashboard, key)).toEqual([])
    }
    expect(JSON.stringify(doc)).not.toContain(riverside.id)
    expect(JSON.stringify(doc)).not.toContain(karenAndAda)
  })

  describe('what the reader derives from it', () => {
    it('is the list the Leader Dashboard shows, with the Pause, the Material and who is you', async () => {
      const { resolution, led } = await readRelationshipsLed(
        asKaren,
        await readPageDocument(asKaren, 'relationships_page'),
      )

      expect(resolution).toEqual({ status: 'not-an-admin' })

      // By who the relationship is with: Ada before Ben.
      expect(led.map((each) => each.relationshipId)).toEqual([karenAndAda, karenAndBen])

      const [withAda, withBen] = led
      expect(withAda).toMatchObject({
        ministryId: riverside.id,
        ministryName: 'Riverside Chapel',
        paused: false,
        material: {
          materialId: romans,
          title: 'Romans, weeks 1-6',
          body: 'The text of Romans, weeks 1-6.',
          items: [],
        },
      })
      // The reader first, then the rest, each with the number they agreed to share.
      expect(withAda!.contacts).toEqual([
        { personId: karen.personId, fullName: 'Karen Whitfield', role: 'leader', isYou: true, phone: karen.phone },
        { personId: ada, fullName: 'Ada Rowe', role: 'participant', isYou: false, phone: adaPhone },
      ])
      expect(withAda!.overlay.people.map((person) => person.personId)).toEqual([karen.personId, ada])

      expect(withBen).toMatchObject({ paused: true, material: null })
      expect(withBen!.contacts.map((contact) => [contact.fullName, contact.isYou])).toEqual([
        ['Karen Whitfield', true],
        ['Ben Okafor', false],
      ])
    })

    it('is nothing at all for a document that says signed-out', async () => {
      expect(await readRelationshipsLed(asKaren, { session: 'signed-out' })).toEqual({
        resolution: { status: 'signed-out' },
        led: [],
      })
    })
  })
})
