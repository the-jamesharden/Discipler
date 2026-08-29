import type { FollowUpItemId, MinistryId, PersonId, RelationshipId } from './ids'

/**
 * A condition an Admin has to act on, gathered in the Care Needed view. It is
 * never cleared by the event that raised it and never clears itself; it persists
 * until an Admin acts on it. That single property is what makes Care Needed
 * trustworthy: nothing needing a decision disappears before somebody makes it.
 *
 * Six kinds, named for the condition rather than the remedy, and every one of them
 * is an act or a condition no later event undoes -- which is the test for
 * belonging here. Derived states are excluded by the same test: `Stalled` clears on
 * an answered check-in, so it could never satisfy *never clears itself*. A Concern
 * is excluded too, and gets a table of its own in ticket 10.
 */
export const FOLLOW_UP_KINDS = [
  /** Raised by the tick, five days after a relationship nobody has accepted was created. */
  'relationship_unaccepted',
  /** Raised by the tick at the end of a Pause period. Ticket 12 raises it. */
  'pause_expired',
  /** A Leader texting `SWAP`. Ticket 17 raises it. */
  'swap_requested',
  /** A Participant texting a recognized keyword. Ticket 17 raises it. */
  'participant_keyword',
  /**
   * A Leader said the number Discipler holds is not theirs. The highest-stakes
   * condition in the product: a wrong number sends that Leader's check-ins to a
   * stranger indefinitely, and a notification that scrolls out of view is exactly
   * the failure a Follow-Up Item exists to prevent.
   */
  'invitation_number_disputed',
  /**
   * A Participant said the match is not right. A different actor and a different
   * surface from a Leader texting `SWAP`, and without an item it reaches nobody.
   */
  'match_declined',
] as const

export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number]

/**
 * How long a Leader may pause their check-ins. Owned by ticket 12, which builds
 * the Pause itself; it is named here because `pause_expired` carries the period it
 * expired from, and a payload that could not say which period would be the thing
 * the check constraint below exists to refuse.
 */
export type PausePeriodWeeks = 1 | 2 | 4 | 8 | 12

/**
 * The kind and what it carries, as one discriminated union, so a `pause_expired`
 * without its period is not a value TypeScript will construct. The database
 * repeats the rule as a check constraint: only two of six kinds carry anything,
 * and a future writer that bypasses this boundary must still be refused.
 *
 * `relationship_unaccepted` carries nothing, though the Admin is shown how long it
 * has waited. That duration is read from the relationship's `created_at` at the
 * moment the view is drawn, because a number frozen into the payload would say
 * *five days* for as long as the item stood -- including on the twentieth day.
 */
export type FollowUpPayload =
  | { readonly kind: 'relationship_unaccepted' }
  | { readonly kind: 'pause_expired'; readonly periodWeeks: PausePeriodWeeks }
  | { readonly kind: 'swap_requested' }
  | { readonly kind: 'participant_keyword'; readonly keyword: string }
  | { readonly kind: 'invitation_number_disputed' }
  | { readonly kind: 'match_declined' }

/**
 * What the item is about: a relationship, a Person, or both. Two nullable typed
 * columns rather than the polymorphic pair `ministry_event` uses, because that
 * table is append-only history whose subjects may be deleted and this one is
 * operational state an Admin acts on -- a polymorphic column cannot be a foreign
 * key, so nothing would stop an item pointing at a deleted row or across a
 * Ministry boundary.
 *
 * Written as a union so that *at least one* is a rule the compiler holds as well
 * as the database. Several kinds want both; `participant_keyword` has a Person and
 * no relationship.
 */
export type FollowUpSubject =
  | { readonly relationshipId: RelationshipId; readonly personId: PersonId | null }
  | { readonly relationshipId: RelationshipId | null; readonly personId: PersonId }

export type NewFollowUpItem = {
  readonly ministryId: MinistryId
  readonly raisedAt: Date
} & FollowUpSubject &
  FollowUpPayload

/**
 * An Admin acting on an item, which is the only thing that closes one. Who and
 * when, and deliberately no note: resolving is one click inline, and a note field
 * would add a writing task to a surface designed not to have one -- while the
 * actions an Admin actually took are recorded as facts of their own.
 */
export interface FollowUpResolution {
  readonly ministryId: MinistryId
  readonly itemId: FollowUpItemId
  /** The Admin's account. History keeps the fact even if the account later goes. */
  readonly resolvedBy: string
  readonly resolvedAt: Date
}

/**
 * What a kind carries, as the row stores it. Only two kinds carry anything, so
 * every other one is the default -- adding a kind that carries nothing needs no
 * edit here, and adding one that does will not compile without a case.
 */
export const followUpPayload = (
  item: FollowUpPayload,
): Readonly<Record<string, unknown>> => {
  switch (item.kind) {
    case 'pause_expired':
      return { periodWeeks: item.periodWeeks }
    case 'participant_keyword':
      return { keyword: item.keyword }
    default:
      return {}
  }
}

const PAUSE_PERIODS: readonly PausePeriodWeeks[] = [1, 2, 4, 8, 12]

const isPausePeriod = (value: unknown): value is PausePeriodWeeks =>
  PAUSE_PERIODS.some((period) => period === value)

/**
 * The same rule read back the other way, checked rather than cast. A row is a
 * promise about a shape this module did not write -- the check constraint, a
 * future migration and this union can each drift from the others -- so a payload
 * that has lost its period is refused here rather than rendered as a blank. It
 * throws for one row; the Care Needed reader catches it and drops that row, so a
 * drifted item never takes the rest of an Admin's list with it.
 */
export const readFollowUpPayload = (kind: FollowUpKind, raw: unknown): FollowUpPayload => {
  const payload = (raw ?? {}) as Record<string, unknown>

  switch (kind) {
    case 'pause_expired': {
      const periodWeeks = payload.periodWeeks
      if (!isPausePeriod(periodWeeks)) {
        throw new Error('A pause_expired follow-up item arrived without its period')
      }
      return { kind, periodWeeks }
    }
    case 'participant_keyword': {
      const keyword = payload.keyword
      if (typeof keyword !== 'string' || keyword.trim() === '') {
        throw new Error('A participant_keyword follow-up item arrived without its keyword')
      }
      return { kind, keyword }
    }
    default:
      return { kind }
  }
}

/** Narrows a string off a database row to a kind, or says plainly that it is not one. */
export const isFollowUpKind = (value: unknown): value is FollowUpKind =>
  FOLLOW_UP_KINDS.some((kind) => kind === value)
