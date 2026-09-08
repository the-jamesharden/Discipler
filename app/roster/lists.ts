import type { RosterEntry } from '~/service/ports'

/**
 * Which list a Person is on, as the Roster names them. Pure over what the reader
 * hands back, so the rule is one function the row, the person page and the two
 * lists all read -- and a test can drive it with no database anywhere near it.
 *
 * **A Discipler is a fact, never a mark.** Ticket 36, in James's words: the
 * pairing of the people is the confirmation that they are accepted by the pastor.
 * So three things make a Discipler and nothing an Admin sets ahead of them does:
 * leading an open relationship, having signed up as a leader on the Intake form,
 * or an import having paired them as one. Everyone else on the Roster is a
 * Disciple -- including somebody imported and never heard from, who is waiting to
 * be cared for -- and a person may be both, which is the discipleship-
 * multiplication case working and not a bug to tidy away.
 */
export const leadsSomebody = (person: RosterEntry): boolean =>
  person.relationships.some((relationship) => relationship.role === 'leader')

export const isDiscipledBySomebody = (person: RosterEntry): boolean =>
  person.relationships.some((relationship) => relationship.role === 'participant')

export const isDiscipler = (person: RosterEntry): boolean =>
  leadsSomebody(person) || person.declaredSide === 'mentor'

export const isDisciple = (person: RosterEntry): boolean =>
  isDiscipledBySomebody(person) || !isDiscipler(person)
