import type { Gender } from '~/domain/intake'
import type { GroupToJoin, RosterEntry } from '~/service/ports'
import type { NotPairable } from './copy'
import type { GroupDeclaration } from './declared-gender'
import { disciplersFor, groupsToJoin, whyNotPairable } from './lists'

/**
 * Who is greyed in the Pair popup, and why (Manual pairing, ticket 23). One rule
 * both sides of the popup read, so a row is shown unavailable with its reason
 * instead of being offered and then refused.
 *
 * **Greying is computed against the declaration the shape implies, never against
 * one person.** The rules are the database's own and the screen invents none: it
 * removes no rule underneath, and the database still refuses what it refused.
 *
 * Who the Roster puts on each side's list is `./lists` (`disciplersFor`,
 * `disciplesFor`, `groupsToJoin`). A row that is listed and cannot be chosen is
 * greyed here with its reason, with one exception, decided by James on 2026-09-21:
 * what gender rules out, where nothing on that side of the popup could open it
 * again, is not listed at all (`leftOutForADisciple`, `groupLeftOut`).
 */

/** What a shape declares: a gender, mixed, or nothing asked at all. */
export type Declaration = Gender | 'mixed' | 'none'

/** Why a row cannot be chosen. */
export type Greyed =
  /** About the candidate and no declaration: the reason their Roster row already gives. */
  | { readonly why: 'not_pairable'; readonly reason: NotPairable }
  | { readonly why: 'gender'; readonly declared: Gender }
  /** `participant_one_open_one_to_one`: one open one-to-one as a participant, any number of groups. */
  | { readonly why: 'already_in_a_one_to_one'; readonly withName: string | null }

/**
 * The gender a declaration holds a candidate to and they are not, or null where it
 * does not rule them out. No gender on file is never a mismatch: both database
 * triggers return early on a null gender, so that the readiness rules refuse the
 * row with something the Admin can act on, and the screen shows the same restraint.
 */
const declaredAgainst = (declaration: Declaration, candidate: Pick<RosterEntry, 'gender'>): Gender | null =>
  declaration !== 'mixed' &&
  declaration !== 'none' &&
  candidate.gender !== null &&
  candidate.gender !== declaration
    ? declaration
    : null

export const greyedAgainst = (
  declaration: Declaration,
  candidate: Pick<RosterEntry, 'gender' | 'participationStatus'>,
): Greyed | null => {
  // Said in place of a gender reason where both hold: nothing about the shape
  // would open this row, so the shape's reason would be the wrong thing to act on.
  const reason = whyNotPairable(candidate)
  if (reason !== null) return { why: 'not_pairable', reason }

  const declared = declaredAgainst(declaration, candidate)
  return declared === null ? null : { why: 'gender', declared }
}

/**
 * What a one-to-one declares. It is same-gender while the Ministry enforces the
 * match, so it declares the gender of the person the popup was opened from, and
 * nothing is asked. Where the Ministry does not enforce it, or that person has no
 * gender on file, it declares nothing and nobody is greyed for gender.
 */
export const declaredByAOneToOne = ({
  genderMatchEnforced,
  openedFrom,
}: {
  /** Whether the Ministry enforces the gender match on a one-to-one: its `suggest_gender_match`. */
  readonly genderMatchEnforced: boolean
  readonly openedFrom: Pick<RosterEntry, 'gender'>
}): Declaration => (genderMatchEnforced && openedFrom.gender !== null ? openedFrom.gender : 'none')

/**
 * The open one-to-one somebody is in as a Disciple, or null. Read from which cap
 * the pairing counts against, which the Roster's document carries, and never from
 * how many Disciples it has: a group that has fallen to one Disciple is still a
 * group, and its last Disciple may be given a one-to-one (ADR-0004). Leading a
 * one-to-one is not being in one as a Disciple. Found whoever leads it: a
 * one-to-one that names nobody still counts against the database's cap, so its row
 * is still greyed.
 */
const openOneToOneOf = (
  person: Pick<RosterEntry, 'relationships'>,
): { readonly withName: string | null } | null => {
  const oneToOne = person.relationships.find(
    ({ role, countsAsAGroup }) => role === 'participant' && !countsAsAGroup,
  )
  return oneToOne === undefined ? null : { withName: oneToOne.leaderNames[0] ?? null }
}

/**
 * A row while what is chosen would make a one-to-one, from either side. A Disciple
 * already in a one-to-one can be given no second, whoever the other person is.
 * Otherwise the candidate is read against what a one-to-one declares, which is the
 * gender of the person the popup was opened from.
 */
const greyedInAOneToOne = ({
  genderMatchEnforced,
  openedFrom,
  candidate,
  disciple,
}: {
  readonly genderMatchEnforced: boolean
  readonly openedFrom: Pick<RosterEntry, 'gender'>
  readonly candidate: Pick<RosterEntry, 'gender' | 'participationStatus'>
  /** Whichever of the two would be the Disciple in it. */
  readonly disciple: Pick<RosterEntry, 'relationships'>
}): Greyed | null => {
  const already = openOneToOneOf(disciple)
  return already !== null
    ? { why: 'already_in_a_one_to_one', withName: already.withName }
    : greyedAgainst(declaredByAOneToOne({ genderMatchEnforced, openedFrom }), candidate)
}

/**
 * A Discipler's row in the popup opened from a Disciple. If that Disciple is
 * already in a one-to-one, every Discipler is greyed with it, whoever they are.
 * One who cannot be paired is greyed and never hidden; only one gender rules out
 * is not listed, which `disciplersShownTo` has already seen to.
 */
export const greyedForADisciple = ({
  genderMatchEnforced,
  disciple,
  discipler,
}: {
  readonly genderMatchEnforced: boolean
  readonly disciple: Pick<RosterEntry, 'gender' | 'relationships'>
  readonly discipler: Pick<RosterEntry, 'gender' | 'participationStatus'>
}): Greyed | null =>
  greyedInAOneToOne({ genderMatchEnforced, openedFrom: disciple, candidate: discipler, disciple })

/**
 * Who is not listed at all in the popup opened from a Disciple (decided by James on
 * 2026-09-21, reviewing recut ticket 03): a Discipler gender rules out is left out,
 * in place of a greyed row that says why. From this side nothing the Admin can
 * change would open that row, so it is only in the way. Where the Ministry lets a
 * one-to-one cross genders, everybody shows.
 *
 * Asked of gender alone, whatever else is true of either of them. Every other
 * reason is still a greyed row and never a missing one (`greyedForADisciple`):
 * Awaiting Intake, Opted out, and a Disciple already in a one-to-one. The popup
 * opened from a Discipler still greys for gender, because there a shape can open
 * the row again.
 */
export const leftOutForADisciple = ({
  genderMatchEnforced,
  disciple,
  discipler,
}: {
  readonly genderMatchEnforced: boolean
  readonly disciple: Pick<RosterEntry, 'gender'>
  readonly discipler: Pick<RosterEntry, 'gender'>
}): boolean => declaredAgainst(declaredByAOneToOne({ genderMatchEnforced, openedFrom: disciple }), discipler) !== null

/**
 * And a group whose own declaration rules somebody out is not listed for them
 * (James, 2026-09-21: what is against the gender rules is hidden; a woman sees the
 * Coed groups and the women's, never the men's). Written for whoever the popup was
 * opened from, so the Discipler's side reads it too when it comes to list groups;
 * today the Disciple's side is its one reader.
 * A declaration binds its members, a leader as much as a Disciple, whatever the
 * Ministry says of a one-to-one, so this is not read off `suggest_gender_match`.
 * A Coed group, which is the model's mixed, is shown to everybody, and so is every
 * group to somebody with no gender on file.
 */
export const groupLeftOut = ({
  group,
  person,
}: {
  readonly group: Pick<GroupToJoin, 'declaredGender'>
  /** Who the popup was opened from: the Disciple to be put into it, or the Discipler to help lead it. */
  readonly person: Pick<RosterEntry, 'gender'>
}): boolean => declaredAgainst(group.declaredGender ?? 'mixed', person) !== null

/** The Disciplers the popup opened from a Disciple lists: every Discipler, less whoever gender rules out. */
export const disciplersShownTo = ({
  roster,
  disciple,
  genderMatchEnforced,
}: {
  readonly roster: readonly RosterEntry[]
  readonly disciple: RosterEntry
  readonly genderMatchEnforced: boolean
}): readonly RosterEntry[] =>
  disciplersFor(roster, disciple).filter(
    (discipler) => !leftOutForADisciple({ genderMatchEnforced, disciple, discipler }),
  )

/** The groups the popup lists for somebody: every one they are not already in, less any whose declaration rules them out. */
export const groupsShownTo = (
  person: Pick<RosterEntry, 'personId' | 'gender'>,
  groups: readonly GroupToJoin[],
): readonly GroupToJoin[] => groupsToJoin(person, groups).filter((group) => !groupLeftOut({ group, person }))

/**
 * A Disciple's row in the popup opened from a Discipler, while what is ticked
 * would make a one-to-one. They are open again for a shape that makes a group.
 * This side lists only Disciples who can be paired (`disciplesFor`), which is what
 * its ticket asks, so the cannot-be-paired reason is never the one given here.
 */
export const greyedForADiscipler = ({
  genderMatchEnforced,
  discipler,
  disciple,
}: {
  readonly genderMatchEnforced: boolean
  readonly discipler: Pick<RosterEntry, 'gender'>
  readonly disciple: Pick<RosterEntry, 'gender' | 'participationStatus' | 'relationships'>
}): Greyed | null =>
  greyedInAOneToOne({ genderMatchEnforced, openedFrom: discipler, candidate: disciple, disciple })

/**
 * A Disciple's row while what is ticked would make a 1:2 pair (Manual pairing,
 * recut ticket 02). A 1:2 takes the Discipler's gender as its declaration and asks
 * nothing, and a declaration binds its members whatever the Ministry says of a
 * one-to-one, so this is not read off `suggest_gender_match`. A Discipler with no
 * gender on file declares nothing, and nobody is greyed for it.
 *
 * It is a group for every rule, so a Disciple already in a one-to-one is open:
 * `participant_one_open_one_to_one` is one open one-to-one and any number of groups.
 */
export const greyedInAOneToTwo = ({
  discipler,
  disciple,
}: {
  readonly discipler: Pick<RosterEntry, 'gender'>
  readonly disciple: Pick<RosterEntry, 'gender' | 'participationStatus'>
}): Greyed | null => greyedAgainst(discipler.gender ?? 'none', disciple)

/**
 * A Disciple's row while what is ticked would make a Group (Manual pairing, recut
 * ticket 04), read against what its gender toggle says. The toggle is preset from
 * the Discipler and the Admin can change it, so the declaration arrives from the
 * screen and is never worked out from a person here. Mixed, which the screen calls
 * Coed, rules nobody out, and that is how a coed group is made by hand. Like a 1:2
 * pair's, it binds whatever the Ministry says of a one-to-one.
 *
 * A Group is a group for every rule, so a Disciple already in a one-to-one, or in
 * another group, is open.
 */
export const greyedInAGroup = ({
  declared,
  disciple,
}: {
  readonly declared: GroupDeclaration
  readonly disciple: Pick<RosterEntry, 'gender' | 'participationStatus'>
}): Greyed | null => greyedAgainst(declared, disciple)

/**
 * Whether somebody already leads a group, which is what `leader_one_open_group`
 * caps: one open group led at a time, and any number of one-to-ones. Counted
 * whether or not they have accepted it yet, as the index counts it, and however
 * many Disciples it has left: a group that has fallen to one is still the one
 * group they lead.
 */
export const leadsAGroup = (person: Pick<RosterEntry, 'relationships'>): boolean =>
  person.relationships.some(({ role, countsAsAGroup }) => role === 'leader' && countsAsAGroup)
