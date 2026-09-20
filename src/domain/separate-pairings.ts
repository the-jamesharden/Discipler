import type { Command } from './commands'
import type { PairingRefusal } from './errors'
import type { MinistryId, PersonId } from './ids'

/**
 * Manual pairing, ticket 21. What an Admin who chose one Discipler and several
 * Disciples meant by it: one group of them all, or a one-to-one with each.
 *
 * `together` is what pairing has always done, and is what anything that is not
 * exactly `separate` reads as -- a form that says nothing, and a value somebody
 * typed, both get the behaviour that was there before the mode was.
 */
export type PairingMode = 'together' | 'separate'

export const readPairingMode = (value: unknown): PairingMode =>
  value === 'separate' ? 'separate' : 'together'

type Pairing = Extract<Command, { readonly type: 'relationship.create' }>

export interface SeparateSubmission {
  readonly ministryId: MinistryId
  readonly leaderIds: readonly PersonId[]
  readonly participantIds: readonly PersonId[]
}

/**
 * The one-to-ones a separate submission asks for, one per Disciple in the order
 * they were submitted, or the refusal of the submission as a whole.
 *
 * It decides only what is true of the set and of no pairing in it: that it is one
 * Discipler with two or more Disciples, and that no Disciple is named twice. The
 * second is the one way a pairing in a set can refuse another -- each is checked
 * against the database as it stands, with none of the set formed, so both checks of
 * a Disciple named twice would pass and the second formation would not. Everything
 * else that can refuse a one-to-one is decided where it always is, when each of
 * these is checked and then formed.
 *
 * The submission has no name, declaration or door to give: a one-to-one has nothing
 * a name is for, its gender is implied by its two people, and nobody joins one
 * through a link. A one-to-one handed a declaration is held to it, so what the form
 * said about a group is left behind here rather than applied to each pairing.
 */
export const oneToOnesFor = ({
  ministryId,
  leaderIds,
  participantIds,
}: SeparateSubmission):
  | { readonly refusal: PairingRefusal }
  | { readonly pairings: readonly Pairing[] } => {
  if (new Set(participantIds).size !== participantIds.length) {
    return { refusal: 'relationship.person_listed_twice' }
  }

  const [leader] = leaderIds
  if (leader === undefined || leaderIds.length !== 1 || participantIds.length < 2) {
    return { refusal: 'relationship.separate_needs_one_leader_and_several_participants' }
  }

  return {
    pairings: participantIds.map((participant) => ({
      type: 'relationship.create',
      ministryId,
      leaderIds: [leader],
      participantIds: [participant],
    })),
  }
}
