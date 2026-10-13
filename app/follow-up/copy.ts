import { groupJoinRefusalMessage, pairingRefusalMessage } from '../roster/copy'
import type {
  CancellationRefusal,
  ConcernRefusal,
  EndingRefusal,
  FollowUpRefusal,
  PauseRefusal,
  ReinvitationRefusal,
} from '~/domain/errors'
import type { FollowUpPayload } from '~/domain/follow-up'
import { WEEKDAYS, type AgeBand, type AvailabilitySlot, type Gender, type Weekday } from '~/domain/intake'
import type { FollowUpCareItem, Happening, PlacementWanted } from '~/service/ports'
import { ago, clockTime, onWhichDay, SATISFACTION, weekdayDayMonth } from '../pair-card/copy'
import { weekdayFullLabel } from '../intake/copy'
import { dayMonth } from '../materials/copy'
import { asList } from '~/domain/outbound-copy'
import { daysSince } from '~/domain/clock'
import type { CareReason, RelationshipState } from '~/domain/relationship-state'
import type { RelationshipOutcome } from '~/domain/relationships'
import { refusalIn } from '../refusals'

/**
 * Everything Care Needed says in words. The reader deals in kinds, reasons and
 * counts; deciding how to say them is the screen's, the way the Roster owns the
 * wording of an import report.
 *
 * The tone follows the source, which is the prototype's own colour discipline: a
 * Concern reads red, Stalled reads amber, and a Follow-Up Item reads neutral.
 * Two Follow-Up Items read red as a Concern does, because James asked that they
 * do on 2026-09-21: a Leader who declined, and an invitation withdrawn at two
 * weeks. See `READS_AS_A_CONCERN`.
 *
 * The prototype's paragraph under the heading, which listed every kind of thing
 * the tab can hold, is gone (James, 2026-09-21): the items say what they are.
 */

export const CARE_NEEDED_HEADING = 'Care needed'

export const NOTHING_NEEDS_ATTENTION = 'Nothing needs attention right now.'

/** On a refused plan: the act that answers it. */
export const PAIR_BY_HAND = 'Pair by hand'

export const itemCount = (count: number): string =>
  count === 1 ? '1 item' : `${count} items`

/** The tag on a Follow-Up Item, by kind. Named for the condition, not the remedy. */
export const followUpTag: Record<FollowUpPayload['kind'], string> = {
  relationship_unaccepted: 'Awaiting acceptance',
  pause_expired: 'Pause expired',
  swap_requested: 'Swap requested',
  participant_keyword: 'Texted a keyword',
  invitation_number_disputed: 'Not their number',
  match_declined: 'Invitation declined',
  invitation_expired: 'Invitation expired',
  group_join_requested: 'Wants to join a group',
  intended_pairing_refused: 'Pair not made',
  group_placement_wanted: 'Wants a group',
}

/**
 * The Follow-Up Items drawn red, with the left edge and the tag a Concern has,
 * and not the grey of a review item (Manual pairing, recut ticket 06; James,
 * 2026-09-21). Until then red on this tab meant a Concern and nothing else.
 */
export const READS_AS_A_CONCERN: ReadonlySet<FollowUpPayload['kind']> = new Set([
  'match_declined',
  'invitation_expired',
])

/**
 * What somebody invited to lead is called before their name. *Group leader*,
 * and *Discipler* for a one-to-one, which has no group; the second is a default
 * taken while the ticket was written, and James's to overrule.
 *
 * Decided by who is in it and never by the kind the relationship was formed as,
 * like every other sentence here: several Disciples, or anybody to lead with,
 * is a group.
 */
export const invitedAs = (leadsAGroup: boolean): string =>
  leadsAGroup ? 'Group leader' : 'Discipler'

/** The title of the item a decline raises, in James's words: *Group leader [name] Declined*. */
export const declinedTitle = (personName: string | null, leadsAGroup: boolean): string =>
  `${invitedAs(leadsAGroup)} ${personName ?? 'somebody'} Declined`

export const CONTACT_INFO = 'Contact info'
export const COPY_LINK_TO_REINVITE = 'Copy link to re-invite leader'
const WHAT_THE_LINK_IS = 'It works for two weeks, and nothing was sent to them.'
export const LINK_COPIED = `Link copied. ${WHAT_THE_LINK_IS}`
export const COPY_IT_BY_HAND = `Copy this link and send it to them. ${WHAT_THE_LINK_IS}`

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

/**
 * The sentence on a Follow-Up Item. The text is the payload's, said with the
 * names the item carries. `personName` is who the item is about, when it is about
 * one Person; `waitedDays` is how long the relationship has waited as of now.
 *
 * The band on the item's card says all of it; the item on the list says the
 * reason alone (`followUpParts`), so the list is one line of reason per item
 * (Pastor feedback, ticket 10).
 */
export const followUpLine = (...said: Parameters<typeof followUpParts>): string => {
  const { reason, more } = followUpParts(...said)
  return more === null ? reason : `${reason} ${more}`
}

/** A Follow-Up Item's sentence in two: why it is here, and what else the card says of it. */
export interface LineParts {
  readonly reason: string
  readonly more: string | null
}

export const followUpParts = (
  payload: FollowUpPayload,
  personName: string | null,
  waitedDays: number | null,
  awaiting: { readonly names: readonly string[]; readonly running: boolean } | null = null,
  invited: {
    readonly leadsAGroup: boolean
    readonly running: boolean
    readonly ledByNobody: boolean
  } | null = null,
): LineParts => {
  const who = personName ?? 'Somebody'
  switch (payload.kind) {
    case 'relationship_unaccepted': {
      const awaited = awaiting && awaiting.names.length > 0 ? awaiting.names : null
      // Somebody an Admin added to a group already running. Nothing is held up
      // and there is nothing to cancel, so it says neither.
      if (awaiting?.running && awaited) {
        return {
          reason: `${asList(awaited)} ${awaited.length === 1 ? 'was' : 'were'} invited to help lead this group and ${
            awaited.length === 1 ? 'has' : 'have'
          } not answered.`,
          more: 'The group carries on meanwhile.',
        }
      }
      // Its only Leader declined, or never answered and was withdrawn at two
      // weeks. It does not cancel itself: this is where an Admin cancels it, and
      // the item about the Leader is where they are invited again.
      if (!awaited && !personName && awaiting && !awaiting.running) {
        return {
          reason: `Nobody leads this relationship: whoever was invited to declined or did not answer${
            waitedDays === null ? '' : `; it has waited ${waitedDays} ${plural(waitedDays, 'day', 'days')}`
          }.`,
          more: 'Everyone in it is held out of the suggestion pool until somebody accepts it or it is cancelled.',
        }
      }
      return {
        reason: `${awaited ? asList(awaited) : (personName ?? 'The leader')} ${
          awaited && awaited.length > 1 ? 'have' : 'has'
        } not accepted this relationship${
          waitedDays === null ? '' : `; it has waited ${waitedDays} ${plural(waitedDays, 'day', 'days')}`
        }.`,
        more: 'Everyone in it is held out of the suggestion pool until it is accepted or cancelled.',
      }
    }
    case 'pause_expired':
      return {
        reason: `Paused for ${payload.periodWeeks} ${plural(payload.periodWeeks, 'week', 'weeks')}; that period has elapsed and the relationship has not resumed.`,
        more: 'Still paused, and nobody has moved.',
      }
    case 'swap_requested':
      return {
        reason:
          payload.requestedBy === 'leader'
            ? `${who} asked to be matched with a different participant.`
            : `${who} asked for a different leader.`,
        more: 'The relationship is unchanged while it waits.',
      }
    case 'participant_keyword':
      return {
        reason: `${who} texted ${payload.keyword}.`,
        more: 'Nothing was changed on their behalf; it is yours to answer.',
      }
    case 'invitation_number_disputed':
      return {
        reason: `${who} said the number Discipler holds is not theirs.`,
        more: 'Nothing was changed. Until it is put right, their check-ins reach a stranger.',
      }
    case 'match_declined': {
      const what = invited?.leadsAGroup === false ? 'this pairing' : 'this group'
      if (invited?.running) {
        return {
          reason: `Invited to help lead ${what}.`,
          more: `The invitation has been withdrawn, and ${invited.leadsAGroup ? 'the group' : 'it'} carries on.`,
        }
      }
      return {
        reason: `Invited to lead ${what}.`,
        more: `The invitation has been withdrawn${invited?.ledByNobody ? ', and nobody leads it now' : ''}.`,
      }
    }
    case 'invitation_expired':
      // James's sentence. He wrote *her invite*; the product knows no pronoun for
      // a Leader, so it says *their*, which he has seen and let stand.
      return {
        reason: `${invitedAs(invited?.leadsAGroup ?? true)} ${
          personName ?? 'somebody'
        } has not responded in two weeks, their invite has expired.`,
        more: null,
      }
    case 'group_join_requested':
      return {
        reason: `${who} asked to join a group you have set to ask first.`,
        more: 'Admit or decline them from Intake forms.',
      }
    case 'intended_pairing_refused':
      // The refusal in the Pair popup's own words, so the Admin reads the same
      // sentence they would have read pairing by hand -- and then does that.
      return {
        reason: `${who} was imported paired with somebody, and once both had completed Intake the pairing could not be made.`,
        more: `${pairingRefusalMessage(payload.refusal) ?? ''} Pair them by hand from the Roster, or resolve this.`,
      }
    case 'group_placement_wanted':
      // Said only where the item's Intake could not be read; `placementParts` is
      // the sentence S-8 draws.
      return { reason: `${who} signed up on the group link with no group in mind.`, more: null }
  }
}

/**
 * The line on a *Wants a group* item, as S-8 draws it (Group form exits, ticket
 * 01): *Signed up on the group link on 9 Sep with no group in mind. Men's, 25 to
 * 34, available Tuesday and Thursday evenings.* The date is the day the item was
 * raised, in the Ministry's zone; the rest is the Person's latest Intake, and
 * whatever of it is missing is left out rather than guessed.
 */
export const placementLine = (raisedAt: Date, placement: PlacementWanted): string => {
  const { reason, more } = placementParts(raisedAt, placement)
  return more === null ? reason : `${reason} ${more}`
}

/** The same in two: when they signed up, which the list says, and the rest, which the card adds. */
export const placementParts = (raisedAt: Date, placement: PlacementWanted): LineParts => {
  const about = [
    placement.gender ? GENDER_OF_A_GROUP[placement.gender] : null,
    placement.ageBand ? ageBandWords(placement.ageBand) : null,
    placement.availability.length > 0 ? `available ${availabilityWords(placement.availability)}` : null,
  ].filter((part): part is string => part !== null)

  const signedUp = `Signed up on the group link on ${dayMonth(raisedAt, placement.timeZone)} with no group in mind.`
  const described = about.length === 0 ? null : `${capitalised(about.join(', '))}.`
  // Every group closed to them, or none left: the dropdown is not drawn, so the
  // line says why there is nothing to choose from.
  const nothingOpen = placement.groups.length === 0 ? NO_GROUP_OPEN_TO_THEM : null
  const more = [described, nothingOpen].filter((part): part is string => part !== null).join(' ')
  return { reason: signedUp, more: more === '' ? null : more }
}

export const NO_GROUP_OPEN_TO_THEM = 'No group is open to them right now.'

/** The dropdown and its button on a *Wants a group* item (S-8). */
export const CHOOSE_A_GROUP = 'Choose a group…'
export const PLACE_IN_THIS_GROUP = 'Place in this group'

/** The Person's gender in the words S-8 uses, which are the words a group's declaration is said in. */
const GENDER_OF_A_GROUP: Record<Gender, string> = { male: "Men's", female: "Women's" }

/** *25 to 34*, and *65 and over* for the band with no top. */
export const ageBandWords = (band: AgeBand): string => {
  const [from, to] = band.split('-')
  return to === undefined ? `${band.replace('+', '')} and over` : `${from} to ${to}`
}

const capitalised = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1)

/**
 * The part of the day an hour of the grid falls in: before noon, noon to five,
 * and five until the grid ends at eight. The grid is hourly (ADR-0018); a line
 * an Admin reads at a glance says it in parts of the day.
 */
const PARTS = ['morning', 'afternoon', 'evening'] as const
type PartOfDay = (typeof PARTS)[number]
const partOf = (hour: string): PartOfDay => {
  const at = Number.parseInt(hour, 10)
  return at < 12 ? 'morning' : at < 17 ? 'afternoon' : 'evening'
}

const WEEKDAYS_ONLY: readonly Weekday[] = WEEKDAYS.slice(0, 5)
const WEEKEND: readonly Weekday[] = WEEKDAYS.slice(5)
const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((each, at) => each === b[at])

/**
 * *Tuesday and Thursday evenings*: the days, gathered by the parts of the day
 * they are free in, in the order of the week. Seven days alike are *every
 * evening* (or *any time*), Monday to Friday alike *weekday evenings*, Saturday
 * and Sunday alike *weekend evenings*, and a day free in every part is free
 * *all day*.
 */
export const availabilityWords = (slots: readonly AvailabilitySlot[]): string => {
  const partsOn = new Map<Weekday, PartOfDay[]>()
  for (const day of WEEKDAYS) {
    const parts = PARTS.filter((part) =>
      slots.some((slot) => slot.day === day && partOf(slot.hour) === part),
    )
    if (parts.length > 0) partsOn.set(day, parts)
  }

  // Days that share exactly the same parts, in the order the first of them falls.
  const gathered: { parts: PartOfDay[]; days: Weekday[] }[] = []
  for (const [day, parts] of partsOn) {
    const alike = gathered.find((each) => same(each.parts, parts))
    if (alike) alike.days.push(day)
    else gathered.push({ parts, days: [day] })
  }

  return gathered
    .map(({ parts, days }) => {
      const allDay = parts.length === PARTS.length
      const partWords = asList(parts.map((part) => `${part}s`))
      if (same(days, WEEKDAYS)) return allDay ? 'any time' : `every ${asList(parts)}`
      if (same(days, WEEKDAYS_ONLY)) return allDay ? 'weekdays all day' : `weekday ${partWords}`
      if (same(days, WEEKEND)) return allDay ? 'weekends all day' : `weekend ${partWords}`
      const named = asList(days.map((day) => weekdayFullLabel[day]))
      return allDay ? `${named} all day` : `${named} ${partWords}`
    })
    .join(', ')
}

/** The tag and the sentence for a Stalled relationship, per reason. */
export const stalledTag = 'Stalled'
export const needsCareTag = 'Needs care'
export const NEEDS_CARE_LINE = 'A concern was raised in this week’s check-in.'

export const stalledLine = (reason: CareReason): string =>
  reason.kind === 'gone_silent'
    ? `Gone silent: ${reason.days} ${plural(reason.days, 'day', 'days')} since last contact.`
    : `Answering, not meeting: ${reason.weeks} ${plural(reason.weeks, 'week', 'weeks')} reported as no meeting.`

/** How long a stall has held, in the unit its condition reports, for the list's right-hand edge. */
export const stallHeld = (reason: CareReason): string =>
  reason.kind === 'gone_silent'
    ? `${reason.days} ${plural(reason.days, 'day', 'days')}`
    : `${reason.weeks} ${plural(reason.weeks, 'week', 'weeks')}`

/**
 * How long an item has stood, for the list's right-hand edge: *today*,
 * *3 days*, *5 weeks*, *2 months*. The pair card's `ago` without the *ago*, on
 * the same steps, so the list and the card cannot round one item two ways.
 */
export const heldFor = (since: Date, now: Date): string => {
  const days = daysSince(since, now)
  if (days <= 0) return 'today'
  if (days < 14) return `${days} ${plural(days, 'day', 'days')}`
  if (days < 63) return `${Math.floor(days / 7)} weeks`
  const months = Math.floor(days / 30)
  return `${months} ${plural(months, 'month', 'months')}`
}

export const concernTag = (count: number): string =>
  count === 1 ? 'Concern' : `${count} concerns`

export const concernLine = (count: number): string =>
  count === 1
    ? 'A concern was raised and has not been resolved.'
    : `${count} concerns raised and not yet resolved.`

/** The state pill on a care item, where the state is worth naming. */
export const stateLabel: Record<RelationshipState, string> = {
  awaiting_leader_acceptance: 'Awaiting acceptance',
  healthy: 'Healthy',
  stalled: 'Stalled',
  needs_care: 'Needs care',
  paused: 'Paused',
  ended: 'Ended',
}

/**
 * Who a care item is about: the Discipler, then who they disciple, as the
 * Follow-Up list James settled draws it (*Rachel Adams → Emily Davis*; Pastor
 * feedback, ticket 10).
 */
export const whoIsInIt = (leaderNames: readonly string[], participantNames: readonly string[]): string => {
  const leaders = leaderNames.length === 0 ? 'Nobody leading' : leaderNames.join(', ')
  const participants = participantNames.length === 0 ? 'nobody else' : participantNames.join(', ')
  return `${leaders} → ${participants}`
}

/** The actions, worded once. */
export const RESOLVE = 'Resolve'
export const RESUME = 'Resume relationship'
export const CANCEL = 'Cancel relationship'
export const END = 'End relationship'

/** What a Follow-Up Item says on the list: its reason alone. */
export const itemReason = (item: FollowUpCareItem): string =>
  item.placement
    ? placementParts(item.raisedAt, item.placement).reason
    : followUpParts(item.payload, item.personName, item.waitedDays, item.awaiting, item.invited).reason

/** What a Follow-Up Item says in its band on the card: all of it. */
export const itemLine = (item: FollowUpCareItem): string =>
  item.placement
    ? placementLine(item.raisedAt, item.placement)
    : followUpLine(item.payload, item.personName, item.waitedDays, item.awaiting, item.invited)

/**
 * The label over an item's band: its tag, and who it is about where the card
 * does not already show them (*Invitation declined · Claire Martinez*).
 */
export const itemBandLabel = (kind: FollowUpPayload['kind'], who: string | null): string =>
  who ? `${followUpTag[kind]} · ${who}` : followUpTag[kind]

/** *Follow-Up · raised 9 Oct, 3 days ago*, over an item's own card. */
export const itemCardLine = (raisedAt: Date, now: Date, timeZone: string): string =>
  `Follow-Up · raised ${dayMonth(raisedAt, timeZone)}, ${ago(raisedAt, now)}`

// ---------------------------------------------------------------------------
// What has happened (Pastor feedback, ticket 10)
// ---------------------------------------------------------------------------

export const WHAT_HAS_HAPPENED = 'What has happened'

/** The day a line of *What has happened* is dated: *Mon 12 Oct*. */
export const happenedOn = (at: Date, timeZone: string): string => weekdayDayMonth(at, timeZone)

/**
 * One line of *What has happened*. Never the words of a Concern: an earlier
 * one's were cleared when it was resolved, and the line says so.
 */
export const happeningLine = (entry: Happening, now: Date, timeZone: string): string => {
  const resolved = (by: string | null, at: Date) =>
    `resolved ${by ? `by ${by} ` : ''}${onWhichDay(at, now, timeZone)}`
  switch (entry.kind) {
    case 'item_raised': {
      // Named where the reason does not name them: a decline says only what
      // they were invited to.
      const reason = itemReason(entry.item)
      const about = entry.item.personName
      return about && !reason.includes(about) ? `Raised about ${about}: ${reason}` : `Raised: ${reason}`
    }
    case 'concern_raised':
      return entry.by
        ? `${entry.by} raised a concern in the weekly check-in.`
        : 'A concern was raised in the weekly check-in.'
    case 'stalled':
      return entry.reason === 'gone_silent'
        ? `Stalled: ${entry.weeks} check-ins in a row went unanswered.`
        : `Stalled: ${entry.weeks} weeks running reported as no meeting.`
    case 'check_in':
      return entry.outcome === 'unanswered'
        ? 'Check-in not answered.'
        : entry.outcome === 'did_not_meet'
          ? 'Check-in answered: did not meet.'
          : `Check-in answered: ${SATISFACTION.concern}.`
    case 'concern_read':
      return `${entry.by ?? 'An Admin'} read the concern at ${clockTime(entry.at, timeZone)}.`
    case 'earlier_item':
      return `${followUpTag[entry.itemKind]}${entry.personName ? ` (${entry.personName})` : ''}, ${resolved(
        entry.resolvedBy,
        entry.resolvedAt,
      )}.`
    case 'earlier_concern':
      return `Concern${entry.raisedBy ? ` raised by ${entry.raisedBy}` : ''}, ${resolved(
        entry.resolvedBy,
        entry.resolvedAt,
      )} and its words cleared.`
  }
}

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

const REINVITATION_REFUSALS: Record<ReinvitationRefusal, string> = {
  'reinvite.not_found': 'That relationship, or that person, is not on this Roster any more.',
  'reinvite.relationship_has_ended': 'That relationship has ended, so there is nothing to invite them to.',
  'reinvite.already_accepted': 'They have accepted since, so there is nobody to invite. Resolve this item.',
  'reinvite.already_in_it': 'They are being discipled in that relationship, so they cannot be invited to lead it.',
  'reinvite.never_invited': 'They were never invited to that relationship. Pair them from the Roster instead.',
}

export const SIGN_IN_AGAIN = 'You have been signed out. Sign in again, then copy the link.'

export const careRefusalMessage = (code: string | undefined): string | null =>
  refusalIn(FOLLOW_UP_REFUSALS, code)
  ?? refusalIn(CONCERN_REFUSALS, code)
  ?? refusalIn(CANCELLATION_REFUSALS, code)
  ?? refusalIn(ENDING_REFUSALS, code)
  ?? refusalIn(PAUSE_REFUSALS, code)
  ?? refusalIn(REINVITATION_REFUSALS, code)
  // What the database refuses of a Leader put back on a relationship, in the
  // words the Roster already says it in when one is first added. Only for the
  // codes that are its own: it answers anything else with a sentence about a
  // group, and whatever arrives in an address is whatever somebody typed there.
  ?? (code && /^(joining|relationship)\.[a-z_]+$/.test(code)
    ? (groupJoinRefusalMessage(code) ?? null)
    : null)
  ?? (code ? 'That could not be done.' : null)
