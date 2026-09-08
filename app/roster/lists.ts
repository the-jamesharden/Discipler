import type { MemberRole } from '~/domain/relationships'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import type { RosterList } from './copy'

/**
 * Which list a Person is on, as the Roster names them, and the four numbers over
 * each list. Pure over what the reader hands back, so the rule is one function the
 * row, the person page and the two lists all read -- and a test can drive it with
 * no database anywhere near it.
 *
 * **A Discipler is a fact, never a mark.** Ticket 36, in James's words: the
 * pairing of the people is the confirmation that they are accepted by the pastor.
 * So two things make a Discipler today and nothing an Admin sets ahead of them
 * does: leading an open relationship, or having signed up as a leader on the
 * Intake form. (An import that pairs somebody as the discipler will be the third,
 * with the planned pairings of step 4.) Everyone else on the Roster is a Disciple
 * -- including somebody imported and never heard from, who is waiting to be cared
 * for -- and a person may be both, which is the discipleship-multiplication case
 * working and not a bug to tidy away.
 */
export const leadsSomebody = (person: RosterEntry): boolean =>
  person.relationships.some((relationship) => relationship.role === 'leader')

export const isDiscipledBySomebody = (person: RosterEntry): boolean =>
  person.relationships.some((relationship) => relationship.role === 'participant')

export const isDiscipler = (person: RosterEntry): boolean =>
  leadsSomebody(person) || person.declaredSide === 'mentor'

export const isDisciple = (person: RosterEntry): boolean =>
  isDiscipledBySomebody(person) || !isDiscipler(person)

/** The role a Person holds on the list being looked at. */
export const roleOn: Record<RosterList, MemberRole> = {
  disciplers: 'leader',
  disciples: 'participant',
}

export const onList = (list: RosterList, person: RosterEntry): boolean =>
  list === 'disciplers' ? isDiscipler(person) : isDisciple(person)

/** The relationships this row is about: the ones the Person holds in the list's role. */
export const relationshipsOn = (
  list: RosterList,
  person: RosterEntry,
): readonly RosterRelationship[] =>
  person.relationships.filter((relationship) => relationship.role === roleOn[list])

/**
 * Whether a relationship is a group, from the live count of people being
 * discipled in it and never from the relationship's kind (ADR-0004). One
 * disciple is a one-to-one; more is a group.
 */
export const isAGroup = (relationship: RosterRelationship): boolean =>
  relationship.participantCount > 1

export interface RosterStats {
  readonly total: number
  /** In at least one open relationship in this list's role. A planned pair is not one. */
  readonly paired: number
  readonly unpaired: number
  /** In at least one open relationship, in this list's role, with more than one disciple. */
  readonly inGroups: number
}

export const rosterStats = (list: RosterList, people: readonly RosterEntry[]): RosterStats => {
  const paired = people.filter((person) => relationshipsOn(list, person).length > 0).length
  const inGroups = people.filter((person) => relationshipsOn(list, person).some(isAGroup)).length
  return { total: people.length, paired, unpaired: people.length - paired, inGroups }
}
