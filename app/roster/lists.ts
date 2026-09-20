import type { DeclaredSide } from '~/domain/intake'
import type { MemberRole } from '~/domain/relationships'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import type { NotPairable, RosterList, RosterSide } from './copy'

/**
 * Which list a Person is on, as the Roster names them, and the three numbers over
 * each list. Pure over what the reader hands back, so the rule is one function the
 * row, the person page and the three lists all read -- and a test can drive it with
 * no database anywhere near it.
 *
 * **A Discipler is a fact, never a mark.** Ticket 36, in James's words: the
 * pairing of the people is the confirmation that they are accepted by the pastor.
 * So three things make a Discipler today and nothing an Admin sets ahead of them
 * does: leading an open relationship, having signed up as a leader on the Intake
 * form, or an import having paired them as one. Everyone else on the Roster is a
 * Disciple -- including somebody imported and never heard from, who is waiting to
 * be cared for -- and a person may be both, which is the discipleship-
 * multiplication case working and not a bug to tidy away.
 */

/**
 * The facts the rule reads, and nothing else. A Roster row is one of these; so is
 * what the person page hands the sentence that says why, and what a test builds
 * without a row.
 */
export interface RosterFacts {
  readonly relationships: readonly { readonly role: MemberRole }[]
  readonly declaredSide: DeclaredSide | null
  readonly intendedPairings: readonly { readonly role: MemberRole }[]
}

export const leadsSomebody = (person: RosterFacts): boolean =>
  person.relationships.some((relationship) => relationship.role === 'leader')

export const isDiscipledBySomebody = (person: RosterFacts): boolean =>
  person.relationships.some((relationship) => relationship.role === 'participant')

/** A plan an import made puts each person on the list of the side they are on. */
export const plannedAs = (person: RosterFacts, role: MemberRole): boolean =>
  person.intendedPairings.some((plan) => plan.role === role)

export const offeredToMentor = (person: RosterFacts): boolean => person.declaredSide === 'mentor'

export const isDiscipler = (person: RosterFacts): boolean =>
  leadsSomebody(person) || offeredToMentor(person) || plannedAs(person, 'leader')

export const isDisciple = (person: RosterFacts): boolean =>
  isDiscipledBySomebody(person) || plannedAs(person, 'participant') || !isDiscipler(person)

/** The role a Person holds on one side's list. All is not a side and has no role. */
export const roleOn: Record<RosterSide, MemberRole> = {
  disciplers: 'leader',
  disciples: 'participant',
}

/**
 * All is everybody, once (Manual pairing, ticket 06). Not a third rule: `isDisciple`
 * already takes whoever `isDiscipler` does not, so everybody on the Roster is on at
 * least one side, and All is those two lists with nobody said twice.
 */
export const onList = (list: RosterList, person: RosterEntry): boolean =>
  list === 'all' || (list === 'disciplers' ? isDiscipler(person) : isDisciple(person))

/** Leading first, so a row on All names who they disciple before who disciples them. Stable within a role. */
const leadingFirst = <T extends { readonly role: MemberRole }>(held: readonly T[]): readonly T[] => [
  ...held.filter(({ role }) => role === 'leader'),
  ...held.filter(({ role }) => role === 'participant'),
]

/** What a row is about, of what a Person holds: the ones in the list's role, and on All every one. */
const heldOn = <T extends { readonly role: MemberRole }>(list: RosterList, held: readonly T[]): readonly T[] =>
  list === 'all' ? leadingFirst(held) : held.filter(({ role }) => role === roleOn[list])

/** The plans this row is about: the ones the Person is on the list's side of, and on All every one. */
export const plansOn = (list: RosterList, person: RosterEntry): readonly RosterIntendedPairing[] =>
  heldOn(list, person.intendedPairings)

/** The relationships this row is about: the ones the Person holds in the list's role, and on All every one. */
export const relationshipsOn = (
  list: RosterList,
  person: RosterEntry,
): readonly RosterRelationship[] => heldOn(list, person.relationships)

/**
 * Why a row offers no Pair, or null when nothing is in the way (Manual pairing,
 * ticket 07). Participation Status is no longer printed under a name, and still
 * decides this: the database refuses a pairing with somebody who has not completed
 * Intake or has opted out, on either side of it, so neither row gets anything to
 * press. One answer for a Discipler and a Disciple, and being paired already is
 * never a reason: a Discipler may lead another, and a Disciple may join a group.
 */
export const whyNotPairable = (person: Pick<RosterEntry, 'participationStatus'>): NotPairable | null =>
  person.participationStatus === 'no_intake_submitted'
    ? 'awaiting_intake'
    : person.participationStatus === 'opted_out'
      ? 'opted_out'
      : null

/**
 * Where Pair on a row goes: the Pair page with that Person already chosen, as the
 * Discipler when they are one and as the Disciple otherwise. About the Person and
 * not the list, so their row says the same on All and on either side, and the
 * pairing screen lets the Admin change it.
 */
export const pairHref = (person: RosterEntry): string =>
  `/roster/pair?${new URLSearchParams(
    isDiscipler(person) ? { leaderId: person.personId } : { with: person.personId },
  )}`

export interface RosterStats {
  readonly total: number
  /**
   * In at least one open relationship in this list's role, and on All in either
   * role. A planned pair is not one.
   */
  readonly paired: number
  readonly unpaired: number
}

export const rosterStats = (list: RosterList, people: readonly RosterEntry[]): RosterStats => {
  const paired = people.filter((person) => relationshipsOn(list, person).length > 0).length
  return { total: people.length, paired, unpaired: people.length - paired }
}
