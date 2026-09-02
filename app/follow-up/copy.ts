import type {
  CancellationRefusal,
  ConcernRefusal,
  EndingRefusal,
  FollowUpRefusal,
  PauseRefusal,
} from '~/domain/errors'
import type { FollowUpPayload } from '~/domain/follow-up'
import type { CareReason, RelationshipState } from '~/domain/relationship-state'
import type { RelationshipOutcome } from '~/domain/relationships'
import { refusalIn } from '../refusals'

/**
 * Everything Care Needed says in words. The reader deals in kinds, reasons and
 * counts; deciding how to say them is the screen's, the way the Roster owns the
 * wording of an import report.
 *
 * The tone follows the source, which is the prototype's own colour discipline: a
 * Concern reads red, Stalled reads amber, and a Follow-Up Item reads neutral. The
 * prototype's sentence about it is kept under the heading, because it is the
 * product rule said plainly.
 */

export const CARE_NEEDED_HEADING = 'Care needed'

export const CARE_NEEDED_LEAD =
  'Everything currently needing attention: stalled relationships, unresolved '
  + 'concerns, expired pauses, open swap requests, relationships waiting more than '
  + 'five days for their leader to accept, and what people have texted. Pauses, '
  + 'swaps and slow acceptances are ordinary things — they are review conditions, '
  + 'not care flags. Nothing here clears itself.'

export const NOTHING_NEEDS_ATTENTION = 'Nothing needs attention right now.'

export const itemCount = (count: number): string =>
  count === 1 ? '1 item' : `${count} items`

/** The tag on a Follow-Up Item, by kind. Named for the condition, not the remedy. */
export const followUpTag: Record<FollowUpPayload['kind'], string> = {
  relationship_unaccepted: 'Awaiting acceptance',
  pause_expired: 'Pause expired',
  swap_requested: 'Swap requested',
  participant_keyword: 'Texted a keyword',
  invitation_number_disputed: 'Not their number',
  match_declined: 'Match declined',
  group_join_requested: 'Wants to join a group',
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

/**
 * The sentence on a Follow-Up Item. The text is the payload's, said with the
 * names the item carries. `personName` is who the item is about, when it is about
 * one Person; `waitedDays` is how long the relationship has waited as of now.
 */
export const followUpLine = (
  payload: FollowUpPayload,
  personName: string | null,
  waitedDays: number | null,
): string => {
  const who = personName ?? 'Somebody'
  switch (payload.kind) {
    case 'relationship_unaccepted':
      return `${personName ?? 'The leader'} has not accepted this relationship${
        waitedDays === null ? '' : `; it has waited ${waitedDays} ${plural(waitedDays, 'day', 'days')}`
      }. Everyone in it is held out of the suggestion pool until it is accepted or cancelled.`
    case 'pause_expired':
      return `Paused for ${payload.periodWeeks} ${plural(payload.periodWeeks, 'week', 'weeks')}; that period has elapsed and the relationship has not resumed. Still paused, and nobody has moved.`
    case 'swap_requested':
      return payload.requestedBy === 'leader'
        ? `${who} asked to be matched with a different participant. The relationship is unchanged while it waits.`
        : `${who} asked for a different leader. The relationship is unchanged while it waits.`
    case 'participant_keyword':
      return `${who} texted ${payload.keyword}. Nothing was changed on their behalf; it is yours to answer.`
    case 'invitation_number_disputed':
      return `${who} said the number Discipler holds is not theirs. Nothing was changed. Until it is put right, their check-ins reach a stranger.`
    case 'match_declined':
      return `${who} said the match is not right. The relationship is unchanged while it waits.`
    case 'group_join_requested':
      return `${who} asked to join a group you have set to ask first. Admit or decline them from the Roster.`
  }
}

/** The tag and the sentence for a Stalled relationship, per reason. */
export const stalledTag = 'Stalled'
export const needsCareTag = 'Needs care'
export const NEEDS_CARE_LINE = 'A concern was raised in this week’s check-in.'

export const stalledLine = (reason: CareReason): string =>
  reason.kind === 'gone_silent'
    ? `Gone silent — ${reason.days} ${plural(reason.days, 'day', 'days')} since last contact.`
    : `Responding, not meeting — ${reason.weeks} ${plural(reason.weeks, 'week', 'weeks')} reported as no meeting.`

export const concernTag = (count: number): string =>
  count === 1 ? 'Concern' : `${count} concerns`

export const concernLine = (count: number): string =>
  count === 1
    ? 'A concern was raised and has not been resolved.'
    : `${count} concerns raised and not yet resolved.`

export const readConcerns = (count: number): string =>
  count === 1 ? 'Read the concern' : `Read ${count} concerns`

/** The state pill on a care item, where the state is worth naming. */
export const stateLabel: Record<RelationshipState, string> = {
  awaiting_leader_acceptance: 'Awaiting acceptance',
  healthy: 'Healthy',
  stalled: 'Stalled',
  needs_care: 'Needs care',
  paused: 'Paused',
  ended: 'Ended',
}

/** Who a care item is about, said as the prototype says it: leader and the rest. */
export const whoIsInIt = (leaderNames: readonly string[], participantNames: readonly string[]): string => {
  const leaders = leaderNames.length === 0 ? 'Nobody leading' : leaderNames.join(', ')
  const participants = participantNames.length === 0 ? 'nobody else' : participantNames.join(', ')
  return `${leaders} & ${participants}`
}

/** The actions, worded once. */
export const RESOLVE = 'Resolve'
export const SEE_CONTACT_DETAILS = 'See contact details'
export const RESUME = 'Resume relationship'
export const CANCEL = 'Cancel relationship'
export const END = 'End relationship'

/**
 * What the reveal says. One sentence for every way a number can be absent --
 * declined, withdrawn, never asked, no number on file -- because an Admin who
 * could tell them apart would be reading a consent decision by inference.
 */
export const numberNotShared = (fullName: string): string =>
  `${fullName} has not agreed to share their number.`

export const ENDING_EXPLANATION =
  'Ending preserves the history untouched. Everyone in it returns to Ready to Pair '
  + 'unless they have opted out, and you pair them from the Roster as usual.'

export const outcomeLabel: Record<RelationshipOutcome, string> = {
  completed: 'Completed — it finished well',
  discontinued: 'Discontinued — it did not run its course',
}

export const REASON_PLACEHOLDER =
  'Required. In your own words — the outcome above is what gets counted later.'

/** What the redirect back to the page says happened. Codes, never prose. */
export type CareOutcome =
  | 'resolved'
  | 'concern-resolved'
  | 'resumed'
  | 'cancelled'
  | 'ended'

const OUTCOMES: Record<CareOutcome, string> = {
  resolved: 'Item cleared.',
  'concern-resolved': 'Concern resolved and its words cleared.',
  resumed: 'Relationship resumed. Whatever its history says resurfaces; resuming never sets Healthy on its own.',
  cancelled: 'Relationship cancelled. Everyone in it returned to Ready to Pair and re-entered the suggestion pool.',
  ended: 'Relationship ended. Everyone returns to Ready to Pair unless they have opted out.',
}

export const careOutcomeMessage = (code: string | undefined): string | null =>
  refusalIn(OUTCOMES, code)

/**
 * Why an action could not go through, in words an Admin can act on. A `Record`
 * per refusal type, so a code added to any of them and left unworded fails the
 * build rather than falling through to a sentence that names nothing.
 */
const FOLLOW_UP_REFUSALS: Record<FollowUpRefusal, string> = {
  'follow_up.not_found': 'That item is gone.',
  'follow_up.already_resolved': 'Somebody resolved that item before you did.',
  'follow_up.resolver_is_not_in_this_ministry': 'This account cannot resolve items here.',
}

const CONCERN_REFUSALS: Record<ConcernRefusal, string> = {
  'concern.not_found': 'That concern is gone.',
  'concern.already_resolved': 'Somebody resolved that concern before you did.',
  'concern.resolver_is_not_in_this_ministry': 'This account cannot resolve concerns here.',
  'concern.viewer_is_not_in_this_ministry': 'This account cannot read concerns here.',
}

const CANCELLATION_REFUSALS: Record<CancellationRefusal, string> = {
  'relationship.not_found': 'That relationship is not on this Roster any more.',
  'relationship.already_accepted':
    'That relationship has been accepted since, so it cannot be cancelled. End it instead, with a reason.',
  'relationship.already_ended': 'That relationship has already ended.',
  'relationship.canceller_is_not_in_this_ministry': 'This account cannot cancel relationships here.',
}

const ENDING_REFUSALS: Record<EndingRefusal, string> = {
  'ending.relationship_not_found': 'That relationship is not on this Roster any more.',
  'ending.relationship_not_accepted':
    'That relationship has not started, so there is nothing to end. Cancel it instead.',
  'ending.already_ended': 'That relationship has already ended.',
  'ending.reason_is_required': 'Say why it ended. An ending records an outcome and a written reason.',
  'ending.outcome_not_recognised': 'Say whether it completed or was discontinued.',
  'ending.ender_is_not_in_this_ministry': 'This account cannot end relationships here.',
}

const PAUSE_REFUSALS: Record<PauseRefusal, string> = {
  'pause.relationship_not_found': 'That relationship is not on this Roster any more.',
  'pause.relationship_not_accepted': 'That relationship has not started.',
  'pause.relationship_ended': 'That relationship has ended.',
  'pause.already_paused': 'That relationship is already paused.',
  'pause.not_paused': 'That relationship is not paused, so there is nothing to resume.',
  'pause.period_not_selectable': 'That is not one of the pause periods.',
}

export const careRefusalMessage = (code: string | undefined): string | null =>
  refusalIn(FOLLOW_UP_REFUSALS, code)
  ?? refusalIn(CONCERN_REFUSALS, code)
  ?? refusalIn(CANCELLATION_REFUSALS, code)
  ?? refusalIn(ENDING_REFUSALS, code)
  ?? refusalIn(PAUSE_REFUSALS, code)
  ?? (code ? 'That could not be done.' : null)
