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
 * The reason a row prints where Pair would have been, or null. `whyNotPairable`,
 * said once: a plan this row shows that is still waiting already reads *planned -
 * awaiting Intake*, and the same words again after it told an Admin nothing (James,
 * 2026-09-19). Every other reason says something the row's lines do not -- *Opted
 * out* beside a pairing or a plan, *Awaiting Intake* beside a plan that was refused.
 * A null here never means Pair: that is `whyNotPairable`'s to answer.
 */
export const reasonOnRow = (list: RosterList, person: RosterEntry): NotPairable | null => {
  const reason = whyNotPairable(person)
  const alreadySaid =
    reason === 'awaiting_intake' && plansOn(list, person).some((plan) => plan.state === 'awaiting_intake')
  return alreadySaid ? null : reason
}

/** The side of a pairing the Pair popup opens on: whose row was pressed, and so who the list is of. */
export type PairSide = 'discipler' | 'disciple'

/**
 * Which side the popup opens on (Manual pairing, ticket 12). **The toggle decides**
 * for somebody on both lists: as a Disciple on Disciples, as a Discipler on
 * Disciplers, and on All a Discipler opens as a Discipler. A list never makes
 * somebody a side they are not on, so an address typed by hand gets the side they
 * do hold.
 */
export const opensAs = (list: RosterList, person: RosterFacts): PairSide =>
  list === 'disciples' && isDisciple(person)
    ? 'disciple'
    : isDiscipler(person)
      ? 'discipler'
      : 'disciple'

/**
 * Where Pair on a row goes. A row that opens as a Disciple opens the popup over the
 * list it was pressed on (Manual pairing, ticket 12). A row that opens as a
 * Discipler still goes to the old Pair page with them chosen as the Discipler,
 * until ticket 14 gives that side a popup, so no row opens an empty one.
 */
export const pairHref = (list: RosterList, person: RosterEntry): string =>
  opensAs(list, person) === 'disciple'
    ? `/roster?${new URLSearchParams({ list, pair: person.personId })}`
    : `/roster/pair?${new URLSearchParams({ leaderId: person.personId })}`

/**
 * Who `?pair=` opens the popup for, or null: somebody on this Ministry's Roster
 * who can be paired. Anything else in the address opens nothing, the rule the row
 * follows when it offers no Pair.
 */
export const whoThePopupIsFor = (
  roster: readonly RosterEntry[],
  id: string | undefined,
): RosterEntry | null => {
  const person = roster.find((each) => each.personId === id)
  return person !== undefined && whyNotPairable(person) === null ? person : null
}

/**
 * The popup's list from a Disciple: every Discipler, in the Roster's order, and
 * never the Disciple themselves. Nobody is left out for something the database
 * would refuse; until ticket 13 greys those rows, the refusal is what says so.
 */
export const disciplersFor = (
  roster: readonly RosterEntry[],
  disciple: RosterEntry,
): readonly RosterEntry[] =>
  roster.filter((each) => isDiscipler(each) && each.personId !== disciple.personId)

/** How many people somebody already leads, across every open relationship they lead. */
export const leadsCount = (person: Pick<RosterEntry, 'relationships'>): number =>
  person.relationships
    .filter(({ role }) => role === 'leader')
    .reduce((led, { participantCount }) => led + participantCount, 0)

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
