import type { MinistryId, PersonId, RelationshipId } from './ids'

/**
 * One Leader and N Participants. A relationship with one Participant is one-to-one;
 * with more than one it is a group. There is no separate group entity and no group
 * code path -- message copy and state derivation both read how many Participants a
 * relationship has *now*, never the kind recorded when it was formed.
 */

export type RelationshipKind = 'one_to_one' | 'group'

export type MemberRole = 'leader' | 'participant'

export interface NewMembership {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly startedAt: Date
}

export interface NewRelationship {
  readonly id: RelationshipId
  readonly ministryId: MinistryId
  /**
   * A capacity declaration, fixed at formation and immutable afterwards. Read by the
   * participation-cap constraints and by the pairing scorer, and by nothing else.
   * See docs/adr/0004-relationship-kind-as-capacity-declaration.md.
   */
  readonly kind: RelationshipKind
  readonly createdAt: Date
  readonly members: readonly NewMembership[]
}

export const kindForParticipantCount = (count: number): RelationshipKind =>
  count > 1 ? 'group' : 'one_to_one'

/** Everyone in the relationship, whatever their role. Copy and state read this. */
export const participantCount = (relationship: NewRelationship): number =>
  relationship.members.filter((member) => member.role === 'participant').length
