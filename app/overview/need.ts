import type { RelationshipState } from '~/domain/relationship-state'
import type { OverviewRelationship } from '~/service/ports'
import { statePill } from './copy'

/**
 * What an Overview card is coloured by (Pastor feedback, ticket 02): what the
 * relationship needs from an Admin, read off the state and the Concern badge the
 * reader already derives. Green is healthy, the default; yellow is stalled; red
 * is an unresolved Concern; grey is inactive, paused or awaiting acceptance.
 *
 * Red follows the badge and not the state. Needs Care lasts the week a Concern
 * was raised and the badge lasts until an Admin resolves it, so a card read off
 * the state alone would go back to green the Monday after somebody said their
 * marriage was in trouble, with nobody having done anything about it. Red wins
 * over yellow for the same reason, and over grey: a Pause stops the check-ins
 * and resolves nothing, and grey would hide the one thing on the card that still
 * needs an Admin.
 */
export type CardNeed = 'healthy' | 'stalled' | 'concern' | 'inactive'

type Card = Pick<OverviewRelationship, 'state' | 'openConcerns'>

const BY_STATE: Record<RelationshipState, CardNeed> = {
  healthy: 'healthy',
  stalled: 'stalled',
  // Unreachable without an open Concern, which is checked first; said for the
  // record rather than left to fall through.
  needs_care: 'concern',
  paused: 'inactive',
  awaiting_leader_acceptance: 'inactive',
  // The Overview gives an ended relationship no card.
  ended: 'inactive',
}

export const needOf = ({ state, openConcerns }: Card): CardNeed =>
  openConcerns > 0 ? 'concern' : BY_STATE[state]

/**
 * The word on the card, so no meaning rests on its colour alone. Every state is
 * named, Healthy included, except Healthy on a card that is red: the card's flag
 * line already says *Concern* there, and a green *Healthy* on a red card would
 * be the colour and the word disagreeing.
 */
export const cardPill = (card: Card): { readonly state: RelationshipState; readonly label: string } | null =>
  card.state === 'healthy' && needOf(card) !== 'healthy'
    ? null
    : { state: card.state, label: statePill[card.state] }
