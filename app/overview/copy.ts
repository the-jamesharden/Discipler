import type { FollowUpPayload } from '~/domain/follow-up'
import type { CareReason, RelationshipState } from '~/domain/relationship-state'

/**
 * Everything the Overview says in words. The reader deals in counts and states;
 * the tiles, the rows and the cards decide how to say them.
 */

export const OVERVIEW_SUBTITLE = 'Discipleship relationships, week by week'

/**
 * The five tiles, in the prototype's order. The sub-line says what the number is,
 * and for a rate which week it is over.
 */
export const TILES = {
  active: { label: 'Active Relationships', sub: 'Pairs and groups' },
  activeWithPaused: (paused: number) => `${paused} paused, not counted`,
  meeting: { label: 'Meeting Rate', sub: 'Last week · held / answered' },
  response: { label: 'Response Rate', sub: 'Last week · answered / sent' },
  thisWeek: { label: 'This Week', sub: 'Check-ins completed' },
  followUp: { label: 'Needs Follow-Up', sub: 'Stalled, concerns, pauses, swaps, unaccepted' },
} as const

export const MEETING_COMPLETION = 'Meeting Completion'
export const CHECK_IN_RATINGS = 'Check-In Ratings'
export const QUICK_STATS = 'Quick Stats'
export const ALL_RELATIONSHIPS = 'All relationships'

/** Beside each chart's title: the rates and both rings are over last week alone. */
export const LAST_WEEK = 'Last week'

export const NO_RELATIONSHIPS = 'No relationships yet. Pair someone from the Roster to begin.'
export const NO_CHECK_INS_LAST_WEEK = 'No check-ins last week'

/** *N active · M awaiting acceptance, not yet surfaced*, the prototype's count line. */
export const relationshipCount = (active: number, hidden: number): string =>
  `${active} active${hidden > 0 ? ` · ${hidden} awaiting acceptance, not yet surfaced` : ''}`

/**
 * The pill naming a card's state. The Overview names every state, Healthy
 * included, because its cards are coloured and a colour needs its word beside it
 * (Pastor feedback, ticket 02); the Materials folders name all but Healthy.
 */
export const statePill: Record<RelationshipState, string> = {
  healthy: 'Healthy',
  awaiting_leader_acceptance: 'Awaiting acceptance',
  stalled: 'Stalled',
  needs_care: 'Needs care',
  paused: 'Paused',
  ended: 'Ended',
}

/** The short form of each condition on a card's flag line. */
export const shortReason = (reason: CareReason): string =>
  reason.kind === 'gone_silent' ? `Silent · ${reason.days}d` : `Not meeting · ${reason.weeks} wks`

export const shortConcern = (count: number): string =>
  count === 1 ? 'Concern' : `${count} concerns`

export const shortFollowUp: Record<FollowUpPayload['kind'], (waitedDays: number | null) => string> = {
  relationship_unaccepted: (days) => (days === null ? 'Unaccepted' : `Unaccepted · ${days}d`),
  pause_expired: () => 'Pause expired',
  swap_requested: () => 'Swap requested',
  participant_keyword: () => 'Texted a keyword',
  invitation_number_disputed: () => 'Number disputed',
  match_declined: () => 'Declined to lead',
  invitation_expired: () => 'Invitation expired',
  group_join_requested: () => 'Wants to join',
  intended_pairing_refused: () => 'Pair not made',
  // About a Person and no relationship, so never on a card; here because every kind is.
  group_placement_wanted: () => 'Wants a group',
}

export const withPeople = (participantNames: readonly string[]): string =>
  participantNames.length === 0 ? 'with nobody yet' : `with ${participantNames.join(', ')}`
