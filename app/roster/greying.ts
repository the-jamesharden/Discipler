import type { Gender } from '~/domain/intake'
import type { GroupToJoin, RosterEntry } from '~/service/ports'
import type { NotPairable } from './copy'
import { whyNotPairable } from './lists'

/**
 * Who is greyed in the Pair popup, and why (Manual pairing, ticket 23). One rule
 * both sides of the popup read, so a row is shown unavailable with its reason
 * instead of being offered and then refused.
 *
 * **Greying is computed against the declaration the shape implies, never against
 * one person.** The rules are the database's own and the screen invents none: it
 * removes no rule underneath, and the database still refuses what it refused.
 *
 * Who is listed at all is each side's own (`disciplersFor`, `disciplesFor`); a row
 * that is listed and cannot be chosen is greyed here, and never hidden.
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

export const greyedAgainst = (
  declaration: Declaration,
  candidate: Pick<RosterEntry, 'gender' | 'participationStatus'>,
): Greyed | null => {
  // Said in place of a gender reason where both hold: nothing about the shape
  // would open this row, so the shape's reason would be the wrong thing to act on.
  const reason = whyNotPairable(candidate)
  if (reason !== null) return { why: 'not_pairable', reason }

  // No gender on file is never a mismatch: both database triggers return early on
  // a null gender, so that the readiness rules refuse the row with something the
  // Admin can act on, and the screen shows the same restraint.
  return declaration !== 'mixed' &&
    declaration !== 'none' &&
    candidate.gender !== null &&
    candidate.gender !== declaration
    ? { why: 'gender', declared: declaration }
    : null
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
 * Every Discipler is listed, so one who cannot be paired is greyed and never hidden.
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
 * A group's row in the popup opened from a Disciple (Manual pairing, recut ticket
 * 03). A group being joined already has its declaration, and a Disciple it rules
 * out is greyed with it. A declaration binds its members whatever the Ministry says
 * of a one-to-one, so this is not read off `suggest_gender_match`; a Coed group,
 * which is the model's mixed, greys nobody, and neither does no gender on file.
 *
 * Being in a one-to-one already is no reason here: `participant_one_open_one_to_one`
 * is one open one-to-one and any number of groups, so the groups stay open.
 */
export const greyedForAGroupJoined = ({
  group,
  joiner,
}: {
  readonly group: Pick<GroupToJoin, 'declaredGender'>
  readonly joiner: Pick<RosterEntry, 'gender' | 'participationStatus'>
}): Greyed | null => greyedAgainst(group.declaredGender ?? 'mixed', joiner)

/**
 * Whether somebody already leads a group, which is what `leader_one_open_group`
 * caps: one open group led at a time, and any number of one-to-ones. Counted
 * whether or not they have accepted it yet, as the index counts it, and however
 * many Disciples it has left: a group that has fallen to one is still the one
 * group they lead.
 */
export const leadsAGroup = (person: Pick<RosterEntry, 'relationships'>): boolean =>
  person.relationships.some(({ role, countsAsAGroup }) => role === 'leader' && countsAsAGroup)
