import type { DeclaredSide } from '~/domain/intake'
import type { MemberRole } from '~/domain/relationships'
import type { GroupToJoin, RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
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

/**
 * Asked to be discipled on the Intake form. For everybody who leads nobody it
 * changes nothing, since they are a Disciple already; it is the one fact that puts
 * a Discipler on the Disciples list as well (James, 2026-09-22: somebody who fills
 * out the Intake as a mentee can appear on both). Leading somebody does not
 * withdraw the answer. Not `askedToBeDiscipled` below, which is who heads a side of
 * the Pair popup (Roles per pairing, ticket 01).
 */
export const answeredMentee = (person: RosterFacts): boolean => person.declaredSide === 'mentee'

export const isDiscipler = (person: RosterFacts): boolean =>
  leadsSomebody(person) || offeredToMentor(person) || plannedAs(person, 'leader')

export const isDisciple = (person: RosterFacts): boolean =>
  isDiscipledBySomebody(person)
  || answeredMentee(person)
  || plannedAs(person, 'participant')
  || !isDiscipler(person)

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
 * ticket 07). Participation Status is not printed as a status on the Roster, and
 * still decides this: the database refuses a pairing with somebody who has not completed
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
 * The tag beside a name, or null (James, 2026-09-21): somebody who has not completed
 * Intake is tagged where an Admin reads the names, because an import files people
 * who have answered nothing and they look like everybody else until a Pair is
 * missed. It is `whyNotPairable`'s answer and no second rule, so the tag and the
 * missing Pair cannot disagree. Opted out is not tagged: the Paired with cell says it.
 */
export const tagOnName = (person: Pick<RosterEntry, 'participationStatus'>): 'awaiting_intake' | null =>
  whyNotPairable(person) === 'awaiting_intake' ? 'awaiting_intake' : null

/**
 * The reason a row prints where Pair would have been, or null. `whyNotPairable`,
 * less what the row has already said: the tag beside the name says *Awaiting
 * Intake*, and the same words again in the Paired with cell told an Admin nothing
 * (James, 2026-09-19, of a plan line that said it; the tag now says it on every
 * such row). *Opted out* is said nowhere else, so it is said here. A null here never
 * means Pair: that is `whyNotPairable`'s to answer.
 */
export const reasonOnRow = (person: Pick<RosterEntry, 'participationStatus'>): NotPairable | null => {
  const reason = whyNotPairable(person)
  return reason === tagOnName(person) ? null : reason
}

/**
 * Which side of this one pairing the person the Pair popup is for is on (Roles per
 * pairing, ticket 01). Nobody is a Discipler or a Disciple: each pairing says who
 * disciples whom, and the popup asks which side this person is on in this one. It
 * is the popup's state, held in its address on its own and apart from the Roster's
 * `list`, so a refresh or a refusal comes back on the side it was on.
 */
export type PairSide = 'discipler' | 'disciple'

/** The address field the side travels in, to the popup and back from a refusal. */
export const SIDE_FIELD = 'side'

export const isPairSide = (value: unknown): value is PairSide => value === 'discipler' || value === 'disciple'

/**
 * Which side the popup opens on where nothing says (Roles per pairing, ticket 01):
 * today's rule for who is a Discipler. Leading an open relationship, having
 * answered Mentor, or being the discipler in a plan an import made opens it on
 * *Disciples somebody*; everybody else opens on *Is discipled*. It only presets
 * the popup and never limits who can be picked, and one press switches it. The
 * Roster's list no longer decides it (it did, Manual pairing, ticket 12).
 */
export const opensAs = (person: RosterFacts): PairSide => (isDiscipler(person) ? 'discipler' : 'disciple')

/** The side the address asks for, or the preset where it asks for none it knows. */
export const sideOfThePopup = (asked: string | undefined, person: RosterFacts): PairSide =>
  isPairSide(asked) ? asked : opensAs(person)

/** The list each side of the popup is drawn over, where nothing else says which. */
export const LIST_OF_SIDE: Record<PairSide, RosterSide> = {
  discipler: 'disciplers',
  disciple: 'disciples',
}

/**
 * The Pair popup for somebody, over a list. Every way into pairing is one of these
 * (Manual pairing, recut ticket 05): a row, the person page, the Follow-Up tab and
 * the old Pair page's address, which redirects here. A way in that knows which
 * side it means says so (Roles per pairing, ticket 01); one that does not leaves
 * it to the preset.
 */
export const pairPopupHref = (list: RosterList, personId: string, side?: PairSide): string =>
  `/roster?${new URLSearchParams({ list, pair: personId, ...(side === undefined ? {} : { [SIDE_FIELD]: side }) })}`

/**
 * The popup's address on the other side: the side chooser's one press (Roles per
 * pairing, ticket 01). Everything else in the address is kept as it was, the
 * Roster's list and every restored choice included, except a refusal: it was
 * about what was posted from the side being left, and would read as the other
 * side's.
 */
export const popupOnSide = (address: URLSearchParams, side: PairSide): string => {
  const onSide = new URLSearchParams(address)
  onSide.delete('error')
  onSide.delete('about')
  onSide.set(SIDE_FIELD, side)
  return `/roster?${onSide}`
}

/**
 * Where Pair on a row goes: the popup over the list it was pressed on (Manual
 * pairing, ticket 12), on the side the preset gives (Roles per pairing, ticket 01).
 */
export const pairHref = (list: RosterList, person: RosterEntry): string => pairPopupHref(list, person.personId)

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
 * Who either side of the popup lists (Roles per pairing, ticket 01): everybody on
 * the Roster but the person themselves, in the Roster's order. Anybody who has
 * completed Intake can be picked on either side; whoever cannot be chosen is
 * greyed with the reason (`./greying`), and only gender leaves anybody off.
 */
export const candidatesFor = (
  roster: readonly RosterEntry[],
  person: Pick<RosterEntry, 'personId'>,
): readonly RosterEntry[] => roster.filter((each) => each.personId !== person.personId)

/**
 * Who heads *Disciples somebody* (Roles per pairing, ticket 01), under **Asked to
 * be discipled**: somebody who has completed Intake, has not opted out, is
 * discipled in nothing open, and would not open the popup on *Disciples somebody*
 * themselves. Everybody else is under *Everyone else*.
 */
export const askedToBeDiscipled = (person: RosterEntry): boolean =>
  whyNotPairable(person) === null && !isDiscipledBySomebody(person) && !isDiscipler(person)

/**
 * Whether a candidate heads the list of the side the popup is on, or is folded
 * under *Everyone else*. On *Disciples somebody* the list opens on who asked to be
 * discipled; on *Is discipled*, on who disciples somebody already, or offered to,
 * which is whoever would open as *Disciples somebody*.
 */
export const listedFirst = (side: PairSide, candidate: RosterEntry): boolean =>
  side === 'discipler' ? askedToBeDiscipled(candidate) : isDiscipler(candidate)

/**
 * The groups the popup offers somebody (Manual pairing, recut ticket 03): every one
 * the Pair document lists, in its order, less any they are already in. In either
 * role, and accepted or not, which is what `memberIds` holds: nobody is offered a
 * group they lead or are invited to lead. What the popup lists is `groupsShownTo`
 * in `./greying`, which also leaves out a group whose declaration rules them out.
 */
export const groupsToJoin = (
  person: Pick<RosterEntry, 'personId'>,
  groups: readonly GroupToJoin[],
): readonly GroupToJoin[] => groups.filter((group) => !group.memberIds.includes(person.personId))

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
