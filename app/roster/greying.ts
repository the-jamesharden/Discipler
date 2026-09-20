import type { Gender } from '~/domain/intake'
import type { RosterEntry } from '~/service/ports'
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
 */

/** What a shape declares: a gender, mixed, or nothing asked at all. */
export type Declaration = Gender | 'mixed' | 'none'

/** Why a row cannot be chosen. */
export type Greyed =
  /** About the candidate and no declaration: the reason their Roster row already gives. */
  | { readonly why: 'not_pairable'; readonly reason: NotPairable }
  | { readonly why: 'gender'; readonly declared: Gender }
  /** `participant_one_open_one_to_one`: one open one-to-one as a participant, any number of groups. */
  | { readonly why: 'already_in_a_one_to_one'; readonly withName: string }

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
  enforced,
  openedFrom,
}: {
  readonly enforced: boolean
  readonly openedFrom: Pick<RosterEntry, 'gender'>
}): Declaration => (enforced && openedFrom.gender !== null ? openedFrom.gender : 'none')

/**
 * Who already disciples somebody one-to-one, or null. One participant is what says
 * one-to-one on the Roster, from the live memberships (ADR-0004), and the popup
 * reads the same document. Leading a one-to-one is not being in one as a Disciple.
 */
export const alreadyInAOneToOneWith = (person: Pick<RosterEntry, 'relationships'>): string | null => {
  const oneToOne = person.relationships.find(
    ({ role, participantCount }) => role === 'participant' && participantCount === 1,
  )
  return oneToOne === undefined ? null : (oneToOne.leaderNames[0] ?? null)
}

/**
 * A Discipler's row in the popup opened from a Disciple. A Disciple already in a
 * one-to-one can be given no second one, so every Discipler is greyed with that,
 * whoever they are. Otherwise the row is read against what a one-to-one declares.
 */
export const greyedForADisciple = ({
  enforced,
  disciple,
  discipler,
}: {
  readonly enforced: boolean
  readonly disciple: Pick<RosterEntry, 'gender' | 'relationships'>
  readonly discipler: Pick<RosterEntry, 'gender' | 'participationStatus'>
}): Greyed | null => {
  const withName = alreadyInAOneToOneWith(disciple)
  return withName !== null
    ? { why: 'already_in_a_one_to_one', withName }
    : greyedAgainst(declaredByAOneToOne({ enforced, openedFrom: disciple }), discipler)
}

/**
 * A Disciple's row in the popup opened from a Discipler, while what is ticked
 * would make a one-to-one. A Disciple already in one can be given no second;
 * they are open again for a shape that makes a group. Otherwise the row is read
 * against what a one-to-one declares, which is this Discipler's gender.
 */
export const greyedForADiscipler = ({
  enforced,
  discipler,
  disciple,
}: {
  readonly enforced: boolean
  readonly discipler: Pick<RosterEntry, 'gender'>
  readonly disciple: Pick<RosterEntry, 'gender' | 'participationStatus' | 'relationships'>
}): Greyed | null => {
  const withName = alreadyInAOneToOneWith(disciple)
  return withName !== null
    ? { why: 'already_in_a_one_to_one', withName }
    : greyedAgainst(declaredByAOneToOne({ enforced, openedFrom: discipler }), disciple)
}
