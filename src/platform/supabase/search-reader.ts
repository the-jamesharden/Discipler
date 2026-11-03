import { daysSince, systemClock, type Clock } from '~/domain/clock'
import { materialId, personId, relationshipId, type PersonId } from '~/domain/ids'
import { isParticipationStatus } from '~/domain/participation'
import { ACCEPTANCE_ESCALATION_DAYS, isMemberRole, type MemberRole } from '~/domain/relationships'
import type {
  SearchPage,
  SearchPerson,
  SearchReader,
  SearchRelationship,
} from '~/service/ports'
import { adminPage, list, readPageDocument, type PageDocument } from './page'
import { instant } from './relationship-history'
import { text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * What search reads when an Admin opens it (Exponential launch, ticket 24): one
 * document, `search_page`, through the signed-in Admin's session, so the policies are
 * what scope it to their own church.
 *
 * The document holds names and nothing a person wrote, which is the whole of why
 * search can never find a Concern or a reply: there is nothing here to find them in.
 *
 * SQL batches and TypeScript derives (`docs/adr/0023-a-page-is-one-read.md`), so who
 * is in what and whether the Overview draws it yet are decided here, from the rows,
 * by the same rule the Overview's own reader uses.
 */

interface Member {
  readonly personId: PersonId
  readonly relationship: string
  readonly role: MemberRole
  readonly acceptedAt: Date | null
}

/** A name a row must carry, thrown for rather than drawn blank. */
const named = (value: unknown, what: string): string => {
  const name = text(value)
  if (!name) throw new Error(`Search was handed ${what} with no name`)
  return name
}

const membersFrom = (doc: PageDocument): readonly Member[] =>
  list(doc, 'members').map((row) => {
    const person = text(row.person_id)
    const relationship = text(row.relationship_id)
    if (!person || !relationship || !isMemberRole(row.role)) {
      throw new Error(`Search was handed a membership it cannot read: ${JSON.stringify(row)}`)
    }
    return {
      personId: personId(person),
      relationship,
      role: row.role,
      acceptedAt: instant(row.accepted_at),
    }
  })

/**
 * The search document as what the directory says.
 *
 * A Discipler an Admin added to a group that was already running is not one of its
 * Leaders until they accept (Manual pairing, ticket 22), so nobody else's line names
 * them. Their own line still carries it, as the Roster's does.
 */
export const searchPageFrom = (doc: PageDocument, clock: Clock): SearchPage => {
  const now = clock.now()
  const timeZone = text(doc.timezone)
  if (!timeZone) throw new Error('Search was handed no timezone for the Ministry')

  const nameOf = new Map(
    list(doc, 'people').map((row) => [text(row.person_id), named(row.full_name, 'a person')]),
  )
  const members = membersFrom(doc)
  const rows = list(doc, 'relationships')
  const accepted = new Map(rows.map((row) => [text(row.id), instant(row.accepted_at)]))

  const heldBy = new Map<string, Member[]>()
  for (const member of members) {
    const stillToAccept = member.role === 'leader' && member.acceptedAt === null
    if (stillToAccept && accepted.get(member.relationship)) continue
    heldBy.set(member.relationship, [...(heldBy.get(member.relationship) ?? []), member])
  }

  /** The names of everyone in one relationship holding one role, sorted, without a removed Person. */
  const namesIn = (relationship: string, role: MemberRole): string[] =>
    (heldBy.get(relationship) ?? [])
      .flatMap((member) => (member.role === role ? (nameOf.get(member.personId) ?? []) : []))
      .sort((a, b) => a.localeCompare(b))

  const nameOfRelationship = new Map(rows.map((row) => [text(row.id), text(row.name)]))

  const people: SearchPerson[] = list(doc, 'people').map((row) => {
    const id = text(row.person_id)
    if (!id) throw new Error('Search was handed a person with no id')
    if (!isParticipationStatus(row.participation_status)) {
      throw new Error(`Search was handed no Participation Status for ${id}`)
    }
    if (typeof row.is_admin !== 'boolean') throw new Error(`Search was handed no Admin answer for ${id}`)

    return {
      personId: personId(id),
      fullName: named(row.full_name, 'a person'),
      participationStatus: row.participation_status,
      isAdmin: row.is_admin,
      pairings: members
        .filter((member) => member.personId === id)
        .map((member) => ({
          role: member.role,
          name: nameOfRelationship.get(member.relationship) ?? null,
          leaderNames: namesIn(member.relationship, 'leader'),
          participantNames: namesIn(member.relationship, 'participant'),
          participantCount: namesIn(member.relationship, 'participant').length,
        })),
    }
  })

  const relationships: SearchRelationship[] = rows.map((row) => {
    const id = text(row.id)
    const createdAt = instant(row.created_at)
    if (!id || !createdAt) {
      throw new Error(`Search was handed a relationship it cannot read: ${JSON.stringify(row)}`)
    }
    const acceptedAt = instant(row.accepted_at)
    const groupName = text(row.name)
    const participantNames = namesIn(id, 'participant')

    return {
      relationshipId: relationshipId(id),
      groupName,
      leaderNames: namesIn(id, 'leader'),
      participantNames,
      isAGroup: groupName !== null || participantNames.length > 1,
      acceptedAt,
      // The Overview's own rule (`overviewFrom`): an unaccepted relationship is the
      // Leader's to answer until it has waited this long, and it draws no card.
      onTheOverview: acceptedAt !== null || daysSince(createdAt, now) >= ACCEPTANCE_ESCALATION_DAYS,
      leaderId: (heldBy.get(id) ?? []).find((member) => member.role === 'leader')?.personId ?? null,
    }
  })

  return {
    timeZone,
    people,
    relationships,
    materials: list(doc, 'materials').map((row) => {
      const id = text(row.id)
      if (!id) throw new Error('Search was handed a Material with no id')
      return { materialId: materialId(id), title: named(row.title, 'a Material') }
    }),
  }
}

export const createSupabaseSearchReader = (clock: Clock = systemClock): SearchReader => ({
  async readSearchPage() {
    const doc = await readPageDocument(await createSupabaseServerClient(), 'search_page')
    return adminPage(doc, () => searchPageFrom(doc, clock))
  },
})
