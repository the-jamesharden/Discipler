import type { DeclaredSide } from '~/domain/intake'
import type { MemberRole } from '~/domain/relationships'
import type { GroupToJoin, RosterEntry, RosterRelationship } from '~/service/ports'
import type { NotPairable } from './copy'

/**
 * The facts the Roster reads about a Person, and the rules over them that the
 * row, the person page and the Pair popup share. Pure over what the reader hands
 * back, so each rule is one function -- and a test can drive it with no database
 * anywhere near it.
 *
 * **Nobody is a Discipler or a Disciple** (Roles per pairing): each pairing says
 * who disciples whom, and the Roster is one list (ticket 02). What was the rule
 * for who is a Discipler is now only which side the Pair popup opens on
 * (`opensAs`, ticket 01): leading an open relationship, having answered Mentor on
 * the Intake form, or an import having paired them as one. Nothing an Admin sets
 * ahead of them counts (ticket 36): pairing them is the pastor's acceptance.
 */

/**
 * The facts the preset reads, and nothing else. A Roster row is one of these; so
 * is what a test builds without a row.
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

/** Whether an import planned them on this side of a pairing. */
export const plannedAs = (person: RosterFacts, role: MemberRole): boolean =>
  person.intendedPairings.some((plan) => plan.role === role)

export const offeredToMentor = (person: RosterFacts): boolean => person.declaredSide === 'mentor'

export const isDiscipler = (person: RosterFacts): boolean =>
  leadsSomebody(person) || offeredToMentor(person) || plannedAs(person, 'leader')

/**
 * A group, by the live count of Disciples in it, as the size tag beside the same
 * pairing counts them (ADR-0004): what it was formed as is a capacity declaration
 * and words nothing, so a group fallen to one Disciple reads as a one-to-one.
 */
export const isAGroupNow = (pairing: Pick<RosterRelationship, 'participantCount'>): boolean =>
  pairing.participantCount > 1

const RANK: Record<MemberRole, number> = { leader: 0, participant: 2 }

/**
 * The one order a person's pairings are said in, wherever they are said: the
 * Roster's Paired with cell (Roles per pairing, ticket 02), the tags and the
 * Pairings card on a person's page (ticket 03), and a Pair popup row's second line
 * (ticket 01). What they lead first, and within each side the one-to-ones before
 * the groups, as all the mock-ups draw it. Otherwise the reader's own order, which
 * is stable.
 */
export const inPairingOrder = <T extends Pick<RosterRelationship, 'role' | 'participantCount'>>(
  held: readonly T[],
): readonly T[] => {
  const rank = (pairing: T): number => RANK[pairing.role] + (isAGroupNow(pairing) ? 1 : 0)
  return [...held].sort((a, b) => rank(a) - rank(b))
}

/** Plans an import made, the ones they would lead first, as their pairings are said. */
export const plansInOrder = <T extends { readonly role: MemberRole }>(plans: readonly T[]): readonly T[] => [
  ...plans.filter(({ role }) => role === 'leader'),
  ...plans.filter(({ role }) => role === 'participant'),
]

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
 * is the popup's state, held in its address on its own, so a refresh or a refusal
 * comes back on the side it was on.
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
 * Roster's list decided it (Manual pairing, ticket 12) until the Roster became one
 * list (Roles per pairing, ticket 02).
 */
export const opensAs = (person: RosterFacts): PairSide => (isDiscipler(person) ? 'discipler' : 'disciple')

/** The side the address asks for, or the preset where it asks for none it knows. */
export const sideOfThePopup = (asked: string | undefined, person: RosterFacts): PairSide =>
  isPairSide(asked) ? asked : opensAs(person)

/**
 * The Pair popup for somebody, over the whole Roster. Every way into pairing that
 * is not a Roster row is one of these (Manual pairing, recut ticket 05): the person
 * page, the Follow-Up tab, Suggested Pairs and the old Pair page's address, which
 * redirects here. A way in that knows which side it means says so (Roles per
 * pairing, ticket 01); one that does not leaves it to the preset. A row's Pair
 * keeps what the Roster shows behind it, and is `pairHref` in `./menu`.
 */
export const pairPopupHref = (personId: string, side?: PairSide): string =>
  `/roster?${new URLSearchParams({ pair: personId, ...(side === undefined ? {} : { [SIDE_FIELD]: side }) })}`

/**
 * The popup's address on the other side: the side chooser's one press (Roles per
 * pairing, ticket 01). Everything else in the address is kept as it was, what
 * the Roster's menu has ticked and every restored choice included, except a
 * refusal: it was about what was posted from the side being left, and would read
 * as the other side's.
 */
export const popupOnSide = (address: URLSearchParams, side: PairSide): string => {
  const onSide = new URLSearchParams(address)
  onSide.delete('error')
  onSide.delete('about')
  onSide.set(SIDE_FIELD, side)
  return `/roster?${onSide}`
}

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

/**
 * The three numbers under the menu while nothing is ticked (Roles per pairing,
 * ticket 02), over the whole Roster. *In groups* left with Manual pairing, ticket
 * 06, and the menu's *In a group* counts it now.
 */
export interface RosterStats {
  readonly total: number
  /** In at least one open relationship, in either role. A planned pair is not one. */
  readonly paired: number
  readonly unpaired: number
}

export const rosterStats = (people: readonly Pick<RosterEntry, 'relationships'>[]): RosterStats => {
  const paired = people.filter((person) => person.relationships.length > 0).length
  return { total: people.length, paired, unpaired: people.length - paired }
}
