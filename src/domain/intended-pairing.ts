import type { PairingRefusal } from './errors'
import type { IntendedPairingId, MinistryId, PersonId, RelationshipId } from './ids'
import type { Gender } from './intake'
import type { ParticipationStatus } from './participation'

/**
 * A pairing an import recorded the intention of. Not a relationship: nothing can
 * be sent to either person, no check-in runs, nothing shows on the Overview until
 * it is formed. Not a suggestion: it is an Admin's own statement and ranks nobody.
 * And not a shortcut past the rules: it is formed by the same function the Pair
 * page uses, with the same refusals and the same invitation.
 *
 * It waits on one thing, that both people complete Intake -- pairing requires it
 * on both sides and importing a person is never consent -- and is settled the
 * moment they have: formed, or refused with the reason the pairing rules gave. A
 * refusal raises a Follow-Up Item and is never retried; an Admin pairs by hand or
 * lets it go. See `docs/adr/0022-an-imported-pair-is-a-plan.md`.
 */

export type IntendedPairingOutcome = 'fulfilled' | 'refused'

export interface NewIntendedPairing {
  readonly id: IntendedPairingId
  readonly ministryId: MinistryId
  /** The Discipler and the Disciple, in the model's words. */
  readonly leaderId: PersonId
  readonly participantId: PersonId
  readonly plannedAt: Date
}

/** A plan still standing, as the boundary reads the set of them. */
export interface OpenIntendedPairing {
  readonly id: IntendedPairingId
  readonly leaderId: PersonId
  readonly participantId: PersonId
  readonly plannedAt: Date
}

/** One side of a plan, as settling it needs to know them. */
export interface PairingSideSnapshot {
  readonly personId: PersonId
  readonly fullName: string
  readonly phone: string | null
  readonly participationStatus: ParticipationStatus
  /** From their latest Intake submission, or null where they have never completed one. */
  readonly gender: Gender | null
}

export interface IntendedPairingSnapshot {
  readonly id: IntendedPairingId
  readonly leader: PairingSideSnapshot
  readonly participant: PairingSideSnapshot
  readonly plannedAt: Date
  readonly closedAt: Date | null
  readonly outcome: IntendedPairingOutcome | null
}

export interface IntendedPairingClosure {
  readonly ministryId: MinistryId
  readonly id: IntendedPairingId
  readonly outcome: IntendedPairingOutcome
  readonly closedAt: Date
  /** What it became, on `fulfilled`. */
  readonly relationshipId: RelationshipId | null
  /** Why it could not be, on `refused`. */
  readonly refusal: PairingRefusal | null
}

export type FulfilmentDecision =
  | { readonly kind: 'wait' }
  | { readonly kind: 'refuse'; readonly refusal: PairingRefusal }
  | { readonly kind: 'form' }

/**
 * What settling a plan comes to, from what is known about the two people.
 *
 * Decided here for the ordinary cases so the reason is the domain's, and left to
 * the database for the rest: the participation caps and any race are refused by
 * the same constraints that refuse the Pair page, and the service records that
 * refusal by its code. The order matters. An opt-out is a decision the person
 * made and outranks anything still to come; Intake not yet completed is *wait*,
 * because that is what the plan exists to wait for; and a gender that does not
 * match is refused as soon as both are known, rather than after both people have
 * done the one thing asked of them.
 */
export const fulfilmentDecision = (plan: IntendedPairingSnapshot): FulfilmentDecision => {
  if (plan.leader.participationStatus === 'opted_out') {
    return { kind: 'refuse', refusal: 'relationship.leader_has_opted_out' }
  }
  if (plan.participant.participationStatus === 'opted_out') {
    return { kind: 'refuse', refusal: 'relationship.participant_has_opted_out' }
  }
  if (
    plan.leader.participationStatus === 'no_intake_submitted' ||
    plan.participant.participationStatus === 'no_intake_submitted'
  ) {
    return { kind: 'wait' }
  }
  if (
    plan.leader.gender !== null &&
    plan.participant.gender !== null &&
    plan.leader.gender !== plan.participant.gender
  ) {
    return { kind: 'refuse', refusal: 'relationship.gender_must_match' }
  }
  return { kind: 'form' }
}
