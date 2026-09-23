import type { FollowUpItemId, IntendedPairingId, MinistryId, PersonId, RelationshipId } from './ids'

/**
 * Removing a Person from the Roster (Remove from the Roster, ticket 01; James,
 * 2026-09-22).
 *
 * A removal is a dated fact beside the Person, never a delete: they leave every
 * live list an Admin works from, are sent nothing further and cannot be paired,
 * and everything they were part of still names them. A later Intake from them is
 * what brings them back, as the same Person with the same history.
 *
 * Their pairings are not this command's. Each one ends, or goes on without them,
 * by the Unpair act their page would give it, in the same transaction and before
 * this runs, so a removal refuses anybody still holding one rather than doing a
 * second copy of four acts with rules of their own.
 */

/** Why a removal did not happen. Codes, never prose, as every refusal is. */
export type RemovalRefusal =
  /** Nobody on this Ministry's Roster answers to that Person: never here, or already removed. */
  | 'removal.not_on_the_roster'
  /** An Admin is never removed, so a Ministry cannot lose its last one from a screen. */
  | 'removal.person_is_an_admin'
  /** A pairing of theirs is still open: it changed while the Admin was looking. */
  | 'removal.still_in_a_pairing'

export const REMOVAL_REFUSALS: readonly RemovalRefusal[] = [
  'removal.not_on_the_roster',
  'removal.person_is_an_admin',
  'removal.still_in_a_pairing',
]

export const isRemovalRefusal = (value: unknown): value is RemovalRefusal =>
  REMOVAL_REFUSALS.some((refusal) => refusal === value)

/**
 * The Person a removal names, as the database holds them now, read inside the
 * removal's own transaction after its pairings have been dealt with.
 */
export interface PersonToRemove {
  readonly personId: PersonId
  readonly fullName: string
  /** Their own account holds this Ministry's Admin tier. */
  readonly isAdmin: boolean
  /** They hold an account, which the removal lets go of. */
  readonly holdsAnAccount: boolean
  /** Open memberships of either role. Anything but zero is a refusal. */
  readonly openMemberships: number
  /** Every open Follow-Up item that names them, which the removal resolves. */
  readonly openFollowUpItems: readonly FollowUpItemId[]
  /** Every plan an import made that names them and is still standing, which the removal closes. */
  readonly openPlans: readonly {
    readonly id: IntendedPairingId
    readonly side: 'leader' | 'participant'
  }[]
}

/** The removal itself: the open row, and the account and queued texts it lets go of. */
export interface PersonRemoval {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly removedAt: Date
  /** The Admin's account, as the session named it. */
  readonly removedBy: string
}

/** A removed Person back on the Roster, because they filled in Intake again. */
export interface PersonRestoration {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly restoredAt: Date
}

/** The sentence every pairing a removal ends records as its reason. */
export const REMOVED_FROM_THE_ROSTER = 'Removed from the Roster.'

/**
 * One pairing a removal lets go of, and the Unpair act it takes: whatever the
 * person's page would do to that line (`app/roster/unpair.ts`), decided from the
 * Roster as Unpair decides it. Each act is refused by its own command where the
 * pairing has changed since, and a refusal rolls the whole removal back.
 */
export interface PairingToLetGo {
  readonly relationshipId: RelationshipId
  readonly act: 'cancel' | 'end' | 'leave' | 'withdraw'
}
