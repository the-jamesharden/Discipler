import { drawOverlay, type OverlayMember } from '~/domain/availability-overlay'
import { materialId, ministryId, personId, relationshipId } from '~/domain/ids'
import { SLOT_HOURS, WEEKDAYS, type AvailabilitySlot } from '~/domain/intake'
import type { MemberRole } from '~/domain/relationships'
import { phoneNumber } from '~/domain/roster'
import type {
  AssignedMaterial,
  ItemToOpen,
  LeaderDashboardReader,
  RelationshipContact,
  RelationshipLed,
  RelationshipsPage,
} from '~/service/ports'
import { list, readPageDocument, resolutionOf, section, type PageDocument } from './page'
import { materialItemFrom } from './material-items'
import { text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * The Leader Dashboard's read: the relationships the signed-in person leads, and
 * for each one the availability overlay, the Material, and the names and numbers.
 *
 * One document, `relationships_page`, where this used to be a chain of reads that
 * looped once per Ministry, once per relationship and once per person. Every row
 * in it was read as the signed-in user, so what comes back is what the policies
 * and the definer functions from ticket 15's migration permit -- and the filters
 * restated here are restating that rather than enforcing it. The one place that
 * distinction matters is the list itself: an Admin who leads may read every
 * relationship in their Ministry, so *which ones do I lead* has to be asked as a
 * question about open leader memberships. That is the ticket's rule verbatim: the
 * surface is a live query, never `ministry_member.tier`, which is what lets an
 * Admin who leads reach both surfaces from one account and a Leader whose last
 * relationship ends lose the surface with nothing revoked.
 */

/**
 * How a contact row that arrived broken fails. From the screen's point of view the
 * whole document is one read -- the dashboard came back or it did not -- and which
 * part of it fell over is a server-log question rather than a screen one.
 */
const couldNotRead = (message: string): Error =>
  new Error(`Could not read the relationships you lead: ${message}`)

const isWeekday = (value: unknown): value is AvailabilitySlot['day'] =>
  WEEKDAYS.includes(value as AvailabilitySlot['day'])

const isSlotHour = (value: unknown): value is AvailabilitySlot['hour'] =>
  SLOT_HOURS.includes(value as AvailabilitySlot['hour'])

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
 * and says nothing about who leads anything. The document carries the ids as a
 * plain list, so they are read as strings rather than as rows.
 */
const meIn = (dashboard: PageDocument): readonly string[] => {
  const value = dashboard.mine
  if (!Array.isArray(value)) throw new Error('The page document has no mine')
  return value.flatMap((id) => (text(id) ? [text(id)!] : []))
}

/** Everyone currently in these relationships, by relationship. */
const membersOf = (dashboard: PageDocument): Map<string, Membership[]> => {
  const byRelationship = new Map<string, Membership[]>()
  for (const row of list(dashboard, 'members')) {
    const membership = asMembership(row)
    if (!membership) continue
    const standing = byRelationship.get(membership.relationshipId)
    if (standing) standing.push(membership)
    else byRelationship.set(membership.relationshipId, [membership])
  }
  return byRelationship
}

/**
 * One column of one list of rows, keyed by id -- the two id-to-name lookups this
 * screen needs, both through the same reading. A row `text` cannot make sense of
 * is dropped rather than carried forward as a placeholder: a caller that gets no
 * entry falls back on its own wording, whereas one handed the string `"null"`
 * would print it.
 */
const namesIn = (rows: readonly Record<string, unknown>[], column: string): Map<string, string> =>
  new Map(
    rows.flatMap((row) => {
      const id = text(row.id)
      const value = text(row[column])
      return id !== null && value !== null ? [[id, value] as const] : []
    }),
  )

const namesOf = (dashboard: PageDocument) => namesIn(list(dashboard, 'people'), 'full_name')

const ministryNames = (dashboard: PageDocument) => namesIn(list(dashboard, 'ministries'), 'name')

/**
 * Everyone's availability, keyed by relationship and then by Person.
 *
 * Through the definer function and never off `intake_availability`, which stays
 * Admin-only: the rows are keyed to a submission, and a Leader has no sight of the
 * table that says whose submission it was. The document tags each row with the
 * relationship it was asked for, where the function used to be asked once per
 * relationship.
 *
 * A slot the enums do not recognise is dropped rather than thrown over. It can only
 * arrive from a `slot_hour` added to the database and not to `SLOT_HOURS`, and the
 * grid the overlay draws is the one the domain declares -- a cell the renderer has
 * no column for cannot be shown, and losing the whole screen over it would be worse
 * than a Leader seeing the eighty-four slots that do line up.
 */
const availabilityIn = (dashboard: PageDocument): Map<string, Map<string, AvailabilitySlot[]>> => {
  const byRelationship = new Map<string, Map<string, AvailabilitySlot[]>>()
  for (const row of list(dashboard, 'availability')) {
    const relationship = text(row.relationship_id)
    const person = text(row.person_id)
    if (!relationship || !person || !isWeekday(row.day) || !isSlotHour(row.hour)) continue

    const byPerson = byRelationship.get(relationship) ?? new Map<string, AvailabilitySlot[]>()
    byRelationship.set(relationship, byPerson)

    const standing = byPerson.get(person)
    const slot = { day: row.day, hour: row.hour }
    if (standing) standing.push(slot)
    else byPerson.set(person, [slot])
  }
  return byRelationship
}

/**
 * The Material each relationship is working through, by relationship.
 *
 * The periods of every Ministry the caller leads in arrive together, and the open
 * period is the one taken: the policies show a Leader only the period that is
 * running, so `ended_at is null` here is restating the boundary rather than
 * drawing it.
 *
 * A period with no Material is the opening one -- the stretch before the Ministry
 * assigned anything -- and it maps to `null` on the screen, which says so in words.
 */
const materialsFor = (
  dashboard: PageDocument,
): Map<string, { materialId: string; title: string }> => {
  const byRelationship = new Map<string, { materialId: string; title: string }>()

  for (const row of list(dashboard, 'material_periods')) {
    const relationship = text(row.relationship_id)
    const material = text(row.material_id)
    const title = text(row.title)
    if (!relationship || row.ended_at !== null) continue
    if (!material || !title) continue

    byRelationship.set(relationship, { materialId: material, title })
  }

  return byRelationship
}

/**
 * What a Material holds, each file opening through `/relationships/file/<item>`.
 * Nothing is signed here: a link per file per render was a burst of storage
 * calls on every load of the dashboard, the thing ADR-0023 exists to stop. The
 * route signs the one file tapped, under the Leader's own session, at the moment
 * it is tapped -- so a link on a page left open all afternoon still works, and
 * one for an assignment that has since ended does not.
 */
const readMaterial = (
  dashboard: PageDocument,
  material: { readonly materialId: string; readonly title: string },
): AssignedMaterial => {
  const data = list(dashboard, 'materials').find((row) => text(row.id) === material.materialId)
  const rows = Array.isArray(data?.items) ? (data.items as Record<string, unknown>[]) : []
  const items = rows
    .map((row) => materialItemFrom(material.materialId, row))
    .map((item): ItemToOpen =>
      item.kind === 'file'
        ? {
            kind: 'file',
            id: item.id,
            filename: item.filename,
            contentType: item.contentType,
            bytes: item.bytes,
            url: `/relationships/file/${item.id}`,
          }
        : { kind: 'link', id: item.id, url: item.url, label: item.label },
    )

  return {
    materialId: materialId(material.materialId),
    title: material.title,
    body: text((data ?? {}).body),
    items,
  }
}

/** Which relationships a Pause currently stands on, across every Ministry led in. */
const pausedIn = (dashboard: PageDocument): ReadonlySet<string> => {
  const paused = new Set<string>()

  for (const row of list(dashboard, 'pauses')) {
    const relationship = text(row.relationship_id)
    if (relationship) paused.add(relationship)
  }

  return paused
}

/**
 * The number of everyone in every relationship who currently agrees to share one,
 * keyed by Ministry and Person.
 *
 * One row per Person through `contact_to_share`, which is the only path to a
 * number a browser session has since ticket 15 took the column away from
 * `authenticated`. Asked at the moment of display and never carried forward: a
 * Person who withdrew this morning is withheld this afternoon without anything
 * having to notice they changed their mind.
 *
 * No row is the answer, not a failure: the Person has not agreed to share, or has
 * no number, or is not somebody this caller may ask about. The function does not
 * distinguish them and neither may this -- a Leader who could tell "withheld" from
 * "no such Person" would be reading consent by inference. A row that came back
 * malformed is a broken read like any other, and is thrown rather than folded into
 * the missing case. Both mean "no number" to a caller that cannot tell them apart,
 * and the one that means a rule has stopped holding must not hide inside the one
 * that means the Person said no.
 */
const contactsIn = (dashboard: PageDocument): Map<string, { fullName: string; phone: string }> => {
  const shared = new Map<string, { fullName: string; phone: string }>()

  for (const row of list(dashboard, 'contacts')) {
    const ministry = text(row.ministry_id)
    const person = text(row.person_id)
    if (!ministry || !person) continue

    const fullName = text(row.full_name)
    const phone = text(row.phone)
    if (!fullName || !phone) {
      throw couldNotRead(`Contact details for ${person} came back without a name or a number`)
    }

    shared.set(contactKey(ministry, person), { fullName, phone })
  }

  return shared
}

const contactKey = (ministry: string, person: string) => `${ministry}/${person}`

/**
 * The relationships led, derived from the `relationships_page` document and
 * nothing else: the one read ADR-0023 asks of a page.
 */
export const readRelationshipsLed = (doc: PageDocument): RelationshipsPage => {
  const resolution = resolutionOf(doc)

  // No session is not an empty dashboard: the page redirects rather than shows a
  // Leader with nothing to lead. The verdict says which, and the list says nothing.
  if (resolution.status === 'signed-out') return { resolution, led: [] }

  const dashboard = section(doc, 'dashboard')

  const mine = meIn(dashboard)
  if (mine.length === 0) return { resolution, led: [] }

  // The surface itself: open leader memberships, asked of the data. Not a tier, and
  // not every relationship the policies would let an Admin read.
  const leaderships = list(dashboard, 'leaderships').flatMap((row) => {
    const membership = asMembership(row)
    return membership ? [membership] : []
  })
  if (leaderships.length === 0) return { resolution, led: [] }

  const members = membersOf(dashboard)
  const ministryName = ministryNames(dashboard)
  const materials = materialsFor(dashboard)
  const paused = pausedIn(dashboard)
  const nameOf = namesOf(dashboard)
  const availability = availabilityIn(dashboard)
  const shared = contactsIn(dashboard)

  const led: RelationshipLed[] = []

  for (const leadership of leaderships) {
    const present = members.get(leadership.relationshipId) ?? []
    const slotsOf = availability.get(leadership.relationshipId) ?? new Map<string, AvailabilitySlot[]>()

    const asOverlayMember = (membership: Membership): OverlayMember => ({
      personId: personId(membership.personId),
      fullName: nameOf.get(membership.personId) ?? 'Someone on this relationship',
      role: membership.role,
      slots: slotsOf.get(membership.personId) ?? [],
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

    led.push({
      relationshipId: relationshipId(leadership.relationshipId),
      ministryId: ministryId(leadership.ministryId),
      ministryName: ministryName.get(leadership.ministryId) ?? '',
      paused: paused.has(leadership.relationshipId),
      overlay,
      material: material ? readMaterial(dashboard, material) : null,
      contacts: contactsFor(
        shared,
        leadership.ministryId,
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
  led.sort(
    (a, b) =>
      a.ministryName.localeCompare(b.ministryName) ||
      participantNames(a).localeCompare(participantNames(b)),
  )

  return { resolution, led }
}

const participantNames = (relationship: RelationshipLed): string =>
  relationship.contacts
    .filter((contact) => contact.role === 'participant')
    .map((contact) => contact.fullName)
    .join(', ')

/**
 * The name of everyone in the relationship, and the number of those who currently
 * agree to share one, in the order the overlay draws them.
 */
const contactsFor = (
  shared: ReadonlyMap<string, { readonly fullName: string; readonly phone: string }>,
  ministry: string,
  people: readonly Omit<RelationshipContact, 'phone'>[],
): readonly RelationshipContact[] =>
  people.map((person) => {
    const contact = shared.get(contactKey(ministry, person.personId))
    return {
      personId: person.personId,
      fullName: person.fullName,
      role: person.role,
      isYou: person.isYou,
      // The name comes from the membership and never from the consent answer: a
      // Person who withholds their number is still in the relationship and still
      // has to appear on the Leader's list of who is in it.
      phone: contact ? phoneNumber(contact.phone) : null,
    }
  })

export const supabaseLeaderDashboardReader: LeaderDashboardReader = {
  async readRelationshipsPage(): Promise<RelationshipsPage> {
    const supabase = await createSupabaseServerClient()
    return readRelationshipsLed(await readPageDocument(supabase, 'relationships_page'))
  },
}
