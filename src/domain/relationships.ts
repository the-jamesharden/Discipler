import type { MinistryId, PersonId, RelationshipId } from './ids'

/**
 * M Leaders and N Participants. A one-to-one is two people -- one Leader, one
 * Participant -- and anything else is a group. There is no separate group entity and
 * no group code path: message copy and state derivation both read how many
 * Participants a relationship has *now*, never the kind recorded when it was formed.
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
   * participation-cap constraints, by the gender constraint -- which binds a
   * one-to-one and not a group -- by the pairing scorer, and by nothing else.
   * See docs/adr/0004-relationship-kind-as-capacity-declaration.md.
   */
  readonly kind: RelationshipKind
  readonly createdAt: Date
  readonly members: readonly NewMembership[]
}

/**
 * Derived once, at formation, and frozen. A one-to-one is one Leader and one
 * Participant; every other shape is a group, including two Leaders over a single
 * Participant. Deriving it from the Participant count alone would have called that
 * shape a one-to-one, and a one-to-one holds exactly one Leader -- so the
 * relationship would have been refused by the cap that describes it.
 */
export const kindFor = (leaderCount: number, participantCount: number): RelationshipKind =>
  leaderCount === 1 && participantCount === 1 ? 'one_to_one' : 'group'
