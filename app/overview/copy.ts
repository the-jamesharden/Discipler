import type { FollowUpPayload } from '~/domain/follow-up'
import type { GrowthMeasure, GrowthScale } from '~/domain/growth'
import type { CareReason, RelationshipState } from '~/domain/relationship-state'
import { calendarDayOf } from '~/domain/week'

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

/** The growth chart (Pastor feedback, ticket 05), as James named its three counts on 2026-10-12. */
export const GROWTH_TITLE = 'Growth in discipleship'

export const GROWTH_MEASURE: Record<GrowthMeasure, string> = {
  total: 'Total discipled',
  mentorship: 'People in mentorship',
  groups: 'People in groups',
}

export const GROWTH_SCALE: Record<GrowthScale, string> = {
  weeks: 'Weeks',
  months: 'Months',
}

/** What the dropdown and the toggle are, to somebody who cannot see them. */
export const GROWTH_MEASURE_PICKER = 'What the chart counts'
export const GROWTH_SCALE_PICKER = 'Weeks or months'

/** Beside the figure: *27 people discipled now*. */
export const growthNow = (measure: GrowthMeasure, count: number): string => {
  const people = count === 1 ? 'person' : 'people'
  return measure === 'total'
    ? `${people} discipled now`
    : `${people} in ${measure === 'mentorship' ? 'mentorship' : 'groups'} now`
}

const span = (scale: GrowthScale, count: number): string =>
  `${count} ${scale === 'weeks' ? (count === 1 ? 'week' : 'weeks') : count === 1 ? 'month' : 'months'}`

/**
 * The change across the chart: *+13 in 12 weeks*, *−2 in 4 months*, *No change
 * in 12 weeks*, over the weeks or months it draws. A Ministry with one point has
 * no change to speak of, and says how new it is instead.
 */
export const growthChange = (scale: GrowthScale, first: number, last: number, points: number): string => {
  if (points <= 1) return scale === 'weeks' ? 'Opened this week' : 'Opened this month'
  const change = last - first
  if (change === 0) return `No change in ${span(scale, points)}`
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} in ${span(scale, points)}`
}

/** *Total discipled over the last 12 weeks: 14 to 27*, said for the whole line at once. */
export const growthSummary = (measure: GrowthMeasure, scale: GrowthScale, first: number, last: number, points: number): string =>
  points <= 1
    ? `${GROWTH_MEASURE[measure]} now: ${last}`
    : `${GROWTH_MEASURE[measure]} over the last ${span(scale, points)}: ${first} to ${last}`

/** Under a week's point: the Monday it opens on, *27 Jul*. Under a month's: *Jul*, or *Jan 2027* at a year's turn. */
export const growthLabel = (scale: GrowthScale, opensAt: Date, timeZone: string): string => {
  const [year, month, day] = calendarDayOf(opensAt, timeZone).split('-').map(Number)
  const name = MONTHS[month! - 1]!
  if (scale === 'weeks') return `${day} ${name}`
  return month === 1 ? `${name} ${year}` : name
}

/** A point's own words, for a pointer resting on it: *Week of 27 Jul: 14*, *Jul 2026: 14*, *Now: 27*. */
export const growthPointTitle = (scale: GrowthScale, opensAt: Date, timeZone: string, count: number, now: boolean): string => {
  if (now) return `Now: ${count}`
  const [year, month, day] = calendarDayOf(opensAt, timeZone).split('-').map(Number)
  const name = MONTHS[month! - 1]!
  return `${scale === 'weeks' ? `Week of ${day} ${name}` : `${name} ${year}`}: ${count}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
