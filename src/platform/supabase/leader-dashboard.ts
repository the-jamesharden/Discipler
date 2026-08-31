import type { SupabaseClient } from '@supabase/supabase-js'
import { drawOverlay, type OverlayMember } from '~/domain/availability-overlay'
import {
  materialId,
  ministryId,
  personId,
  relationshipId,
  type MinistryId,
  type PersonId,
} from '~/domain/ids'
import { DAY_BLOCKS, WEEKDAYS, type AvailabilitySlot } from '~/domain/intake'
import type { MemberRole } from '~/domain/relationships'
import { phoneNumber } from '~/domain/roster'
import type {
  AssignedMaterial,
  LeaderDashboardReader,
  RelationshipContact,
  RelationshipLed,
} from '~/service/ports'
import { readContactToShare } from './care-needed-reader'
import { createSupabaseServerClient } from './server-client'

/**
 * The Leader Dashboard's read: the relationships the signed-in person leads, and
 * for each one the availability overlay, the Material, and the names and numbers.
 *
 * Every query runs as the signed-in user, so what comes back is what the policies
 * and the definer functions from ticket 15's migration permit -- and the filters
 * written here restate that rather than enforce it. The one place that distinction
 * matters is the list itself: an Admin who leads may read every relationship in
 * their Ministry, so *which ones do I lead* has to be asked as a question about
 * open leader memberships. That is the ticket's rule verbatim: the surface is a
 * live query, never `ministry_member.tier`, which is what lets an Admin who leads
 * reach both surfaces from one account and a Leader whose last relationship ends
 * lose the surface with nothing revoked.
 */

const HOW_LONG_A_PDF_LINK_LIVES = 60 * 10

const rows = (data: unknown): readonly Record<string, unknown>[] =>
  (data ?? []) as Record<string, unknown>[]

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/**
 * How every read in this file fails. From the screen's point of view these queries
 * are one read -- the dashboard came back or it did not -- and which of them fell
 * over is a server-log question rather than a screen one.
 */
const couldNotRead = (error: { readonly message: string }): Error =>
  new Error(`Could not read the relationships you lead: ${error.message}`)

const isWeekday = (value: unknown): value is AvailabilitySlot['day'] =>
  WEEKDAYS.includes(value as AvailabilitySlot['day'])

const isDayBlock = (value: unknown): value is AvailabilitySlot['block'] =>
  DAY_BLOCKS.includes(value as AvailabilitySlot['block'])

/**
 * `kind` is deliberately absent, here and on the port. This screen branches on the
 * live participant count -- one Participant shades the grid green and yellow, and
 * several give each person a colour -- and never on the capacity a relationship was
 * declared with. See `docs/adr/0004-relationship-kind-as-capacity-declaration.md`.
 */
interface Membership {
  readonly relationshipId: string
  readonly ministryId: string
  readonly personId: string
  readonly role: MemberRole
}

const asMembership = (row: Record<string, unknown>): Membership | null => {
  const relationship = text(row.relationship_id)
  const ministry = text(row.ministry_id)
  const person = text(row.person_id)
  const role = row.role

  if (!relationship || !ministry || !person) return null
  if (role !== 'leader' && role !== 'participant') return null

  return { relationshipId: relationship, ministryId: ministry, personId: person, role }
}

/**
 * The people this account *is*. One row per Ministry, because one human may belong
 * to two -- and a Leader's list is the union of what those Person records lead
 * rather than a choice the screen makes on their behalf.
 *
 * Read off `person.user_id` and not off `ministry_member`, which is an access tier
 * and says nothing about who leads anything.
 */
const meIn = async (supabase: SupabaseClient, userId: string): Promise<readonly string[]> => {
  const { data, error } = await supabase.from('person').select('id').eq('user_id', userId)
  if (error) throw couldNotRead(error)
  return rows(data).flatMap((row) => (text(row.id) ? [text(row.id)!] : []))
}

/** Everyone currently in these relationships, by relationship. */
const membersOf = async (
  supabase: SupabaseClient,
  relationships: readonly string[],
): Promise<Map<string, Membership[]>> => {
  const { data, error } = await supabase
    .from('relationship_member')
    .select('relationship_id, ministry_id, person_id, role')
    .in('relationship_id', [...relationships])
    .is('ended_at', null)

  if (error) throw couldNotRead(error)

  const byRelationship = new Map<string, Membership[]>()
  for (const row of rows(data)) {
    const membership = asMembership(row)
    if (!membership) continue
    const standing = byRelationship.get(membership.relationshipId)
    if (standing) standing.push(membership)
    else byRelationship.set(membership.relationshipId, [membership])
  }
  return byRelationship
}

const namesOf = async (
  supabase: SupabaseClient,
  people: readonly string[],
): Promise<Map<string, string>> => {
  if (people.length === 0) return new Map()

  const { data, error } = await supabase
    .from('person')
    .select('id, full_name')
    .in('id', [...new Set(people)])

  if (error) throw couldNotRead(error)

  return new Map(
    rows(data).flatMap((row) => {
      const id = text(row.id)
      const name = text(row.full_name)
      return id && name ? [[id, name] as const] : []
    }),
  )
}

const ministryNames = async (
  supabase: SupabaseClient,
  ministries: readonly string[],
): Promise<Map<string, string>> => {
  if (ministries.length === 0) return new Map()

  const { data, error } = await supabase
    .from('ministry')
    .select('id, name')
    .in('id', [...new Set(ministries)])

  if (error) throw couldNotRead(error)

  return new Map(
    rows(data).flatMap((row) => {
      const id = text(row.id)
      const name = text(row.name)
      return id && name ? [[id, name] as const] : []
    }),
  )
}

/**
 * Everyone's availability for one relationship, keyed by Person.
 *
 * Through the definer function and never off `intake_availability`, which stays
 * Admin-only: the rows are keyed to a submission, and a Leader has no sight of the
 * table that says whose submission it was.
 *
 * A slot the enums do not recognise is dropped rather than thrown over. It can only
 * arrive from a `day_block` added to the database and not to `DAY_BLOCKS`, and the
 * grid the overlay draws is the one the domain declares -- a cell the renderer has
 * no column for cannot be shown, and losing the whole screen over it would be worse
 * than a Leader seeing the thirty-five slots that do line up.
 */
const availabilityFor = async (
  supabase: SupabaseClient,
  relationship: string,
): Promise<Map<string, AvailabilitySlot[]>> => {
  const { data, error } = await supabase.rpc('relationship_availability', {
    target_relationship_id: relationship,
  })

  if (error) throw couldNotRead(error)

  const byPerson = new Map<string, AvailabilitySlot[]>()
  for (const row of rows(data)) {
    const person = text(row.person_id)
    if (!person || !isWeekday(row.day) || !isDayBlock(row.block)) continue

    const standing = byPerson.get(person)
    const slot = { day: row.day, block: row.block }
    if (standing) standing.push(slot)
    else byPerson.set(person, [slot])
  }
  return byPerson
}

/**
 * The Material each relationship is working through, by relationship.
 *
 * One call per Ministry rather than per relationship, and the open period is the
 * one taken: the policies show a Leader only the period that is running, so
 * `ended_at is null` here is restating the boundary rather than drawing it.
 *
 * A period with no Material is the opening one -- the stretch before the Ministry
 * assigned anything -- and it maps to `null` on the screen, which says so in words.
 */
const materialsFor = async (
  supabase: SupabaseClient,
  ministries: readonly string[],
): Promise<Map<string, { materialId: string; title: string }>> => {
  const byRelationship = new Map<string, { materialId: string; title: string }>()

  for (const ministry of new Set(ministries)) {
    const { data, error } = await supabase.rpc('material_periods', {
      target_ministry_id: ministry,
    })
    if (error) throw couldNotRead(error)

    for (const row of rows(data)) {
      const relationship = text(row.relationship_id)
      const material = text(row.material_id)
      const title = text(row.title)
      if (!relationship || row.ended_at !== null) continue
      if (!material || !title) continue

      byRelationship.set(relationship, { materialId: material, title })
    }
  }

  return byRelationship
}

/** What a Material holds, and a short-lived link to its PDF if it has one. */
const readMaterial = async (
  supabase: SupabaseClient,
  material: { readonly materialId: string; readonly title: string },
): Promise<AssignedMaterial> => {
  const { data, error } = await supabase
    .from('material')
    .select('body, pdf_path, pdf_filename')
    .eq('id', material.materialId)
    .maybeSingle()

  if (error) throw couldNotRead(error)

  const pdfPath = text((data ?? {}).pdf_path)
  const pdfFilename = text((data ?? {}).pdf_filename)

  // Minted per render and short-lived, so a link cannot outlive the assignment it
  // came with. A failure to mint one is not a failure of the screen: the title and
  // the typed content are still what the Leader came for.
  let pdfUrl: string | null = null
  if (pdfPath) {
    const signed = await supabase.storage
      .from('material')
      .createSignedUrl(pdfPath, HOW_LONG_A_PDF_LINK_LIVES)
    pdfUrl = signed.data?.signedUrl ?? null
  }

  return {
    materialId: materialId(material.materialId),
    title: material.title,
    body: text((data ?? {}).body),
    pdfFilename,
    pdfUrl,
  }
}

/** Which relationships in this Ministry a Pause currently stands on. */
const pausedIn = async (
  supabase: SupabaseClient,
  ministries: readonly string[],
): Promise<ReadonlySet<string>> => {
  const paused = new Set<string>()

  for (const ministry of new Set(ministries)) {
    const { data, error } = await supabase.rpc('relationship_pauses', {
      target_ministry_id: ministry,
    })
    if (error) throw couldNotRead(error)

    for (const row of rows(data)) {
      const relationship = text(row.relationship_id)
      if (relationship) paused.add(relationship)
    }
  }

  return paused
}

export const readRelationshipsLed = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<readonly RelationshipLed[]> => {
  const mine = await meIn(supabase, userId)
  if (mine.length === 0) return []

  // The surface itself: open leader memberships, asked of the data. Not a tier, and
  // not every relationship the policies would let an Admin read.
  const { data: led, error } = await supabase
    .from('relationship_member')
    .select('relationship_id, ministry_id, person_id, role')
    .in('person_id', [...mine])
    .eq('role', 'leader')
    .is('ended_at', null)

  if (error) throw couldNotRead(error)

  const leaderships = rows(led).flatMap((row) => {
    const membership = asMembership(row)
    return membership ? [membership] : []
  })
  if (leaderships.length === 0) return []

  const relationships = leaderships.map((membership) => membership.relationshipId)
  const ministries = leaderships.map((membership) => membership.ministryId)

  const [members, ministryName, materials, paused] = await Promise.all([
    membersOf(supabase, relationships),
    ministryNames(supabase, ministries),
    materialsFor(supabase, ministries),
    pausedIn(supabase, ministries),
  ])

  const nameOf = await namesOf(
    supabase,
    [...members.values()].flat().map((membership) => membership.personId),
  )

  const dashboard: RelationshipLed[] = []

  for (const leadership of leaderships) {
    const present = members.get(leadership.relationshipId) ?? []
    const availability = await availabilityFor(supabase, leadership.relationshipId)

    const asOverlayMember = (membership: Membership): OverlayMember => ({
      personId: personId(membership.personId),
      fullName: nameOf.get(membership.personId) ?? 'Someone on this relationship',
      role: membership.role,
      slots: availability.get(membership.personId) ?? [],
    })

    // Everybody else in the relationship, whatever their role. A co-Leader is one
    // of them: `one_to_one_one_open_leader` binds one-to-ones to a single Leader
    // and leaves groups alone, so a group holding two is an ordinary shape -- and
    // one who was drawn nowhere would be missing from *the name and phone number of
    // everyone in it*, and missing from the count of who a slot gathers.
    //
    // The reader is this account's own Person on this relationship, not whoever the
    // membership rows happen to list first: the overlay's asymmetry -- yellow for
    // *they can, you said you could not* -- is a claim about who is looking at it.
    const others = present
      .filter((membership) => membership.personId !== leadership.personId)
      .sort(
        (a, b) =>
          // Participants first: they are who the relationship is for, and a
          // co-Leader reads as somebody standing alongside rather than as one of
          // the people being discipled.
          Number(a.role === 'leader') - Number(b.role === 'leader') ||
          (nameOf.get(a.personId) ?? '').localeCompare(nameOf.get(b.personId) ?? ''),
      )

    const overlay = drawOverlay(asOverlayMember(leadership), others.map(asOverlayMember))

    const material = materials.get(leadership.relationshipId)

    dashboard.push({
      relationshipId: relationshipId(leadership.relationshipId),
      ministryId: ministryId(leadership.ministryId),
      ministryName: ministryName.get(leadership.ministryId) ?? '',
      paused: paused.has(leadership.relationshipId),
      overlay,
      material: material ? await readMaterial(supabase, material) : null,
      contacts: await contactsFor(
        supabase,
        ministryId(leadership.ministryId),
        overlay.people.map((person) => ({
          personId: person.personId,
          fullName: person.fullName,
          role: person.role,
          isYou: person.isYou,
        })),
      ),
    })
  }

  // The order a Leader reads their own list in. By Ministry first for the rare
  // person who leads in two, then by who the relationship is with, so the list does
  // not reshuffle itself between visits.
  return dashboard.sort(
    (a, b) =>
      a.ministryName.localeCompare(b.ministryName) ||
      participantNames(a).localeCompare(participantNames(b)),
  )
}

const participantNames = (relationship: RelationshipLed): string =>
  relationship.contacts
    .filter((contact) => contact.role === 'participant')
    .map((contact) => contact.fullName)
    .join(', ')

/**
 * The name of everyone in the relationship, and the number of those who currently
 * agree to share one.
 *
 * One call per Person through `contact_to_share`, which is the only path to a
 * number a browser session has since ticket 15 took the column away from
 * `authenticated`. Asked at the moment of display and never carried forward: a
 * Person who withdrew this morning is withheld this afternoon without anything
 * having to notice they changed their mind.
 */
const contactsFor = async (
  supabase: SupabaseClient,
  ministry: MinistryId,
  people: readonly {
    readonly personId: PersonId
    readonly fullName: string
    readonly role: MemberRole
    readonly isYou: boolean
  }[],
): Promise<readonly RelationshipContact[]> =>
  Promise.all(
    people.map(async (person) => {
      const shared = await readContactToShare(supabase, ministry, person.personId)
      return {
        personId: person.personId,
        fullName: person.fullName,
        role: person.role,
        isYou: person.isYou,
        // The name comes from the membership and never from the consent answer: a
        // Person who withholds their number is still in the relationship and still
        // has to appear on the Leader's list of who is in it.
        phone: shared ? phoneNumber(shared.phone) : null,
      }
    }),
  )

export const supabaseLeaderDashboardReader: LeaderDashboardReader = {
  async listRelationshipsLed(): Promise<readonly RelationshipLed[]> {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    // No session is not an error and not an empty dashboard either -- but this
    // reader cannot tell a page which of those it is, so it answers the only thing
    // true of both: there is nobody here leading anything. The page redirects.
    if (!user) return []

    return readRelationshipsLed(supabase, user.id)
  },
}

