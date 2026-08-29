import type { MinistryId, PersonId, RelationshipId } from './ids'

/**
 * A condition an Admin has to act on, gathered in the Care Needed view. It is
 * never cleared by the event that raised it and never clears itself; it persists
 * until an Admin acts on it.
 *
 * Two kinds exist so far, both raised by the invitation flow and both by somebody
 * with no session. Ticket 07 gathers them and adds the rest.
 */
export type FollowUpKind =
  /**
   * A Leader said the number Discipler holds is not theirs. The highest-stakes
   * condition in the product: a wrong number sends that Leader's check-ins to a
   * stranger indefinitely, and a notification that scrolls out of view is exactly
   * the failure a Follow-Up Item exists to prevent.
   */
  | 'invitation_number_disputed'
  /**
   * A Participant said the match is not right. A different actor and a different
   * surface from a Leader texting `SWAP`, and without an item it reaches nobody.
   */
  | 'match_declined'

export interface NewFollowUpItem {
  readonly ministryId: MinistryId
  readonly kind: FollowUpKind
  readonly personId: PersonId
  readonly relationshipId: RelationshipId
  readonly raisedAt: Date
}
