import type { CareNeededItem, ConcernCareItem } from '~/service/ports'
import { pairTitle } from '../pair-card/copy'
import {
  concernLine,
  concernTag,
  declinedTitle,
  followUpTag,
  heldFor,
  itemReason,
  NEEDS_CARE_LINE,
  needsCareTag,
  READS_AS_A_CONCERN,
  stallHeld,
  stalledLine,
  stalledTag,
  whoIsInIt,
} from './copy'

/**
 * One item on the Follow-Up list, as the button it is (Pastor feedback, ticket
 * 10): its tag, the names, one line of reason and how long it has held, and
 * the card it opens. Nothing else to press: every action is on the card. A
 * Concern's words are never here.
 *
 * The tone follows the source, as it always has: a Concern reads red, Stalled
 * amber, and a Follow-Up Item the grey of something to review, except the two
 * James asked to read red (`READS_AS_A_CONCERN`).
 */
export interface FrontItem {
  /** What `?card=` names: the relationship's id, or the item's own where it has no live relationship. */
  readonly card: string
  readonly tone: 'care-concern' | 'care-stalled' | 'review'
  readonly tagTone: 'concern' | 'stalled' | 'review'
  readonly tag: string
  readonly who: string
  readonly line: string
  /** How long it has held; null where nothing says since when. */
  readonly held: string | null
}

/**
 * Which card an item opens. Everything about a live relationship opens that
 * relationship's card, so a pair with a Concern, a stall and a swap request is
 * one card with three bands, whichever of the three was pressed. An item about a
 * Person alone, or about a relationship that has since ended, opens its own.
 */
export const cardOf = (item: CareNeededItem, live: ReadonlySet<string>): string =>
  item.source !== 'follow_up'
    ? item.relationshipId
    : item.relationshipId !== null && live.has(item.relationshipId)
      ? item.relationshipId
      : item.id

/**
 * The anchor of the first item on the list that opens a card, which the card
 * closes back to: `relationship-<id>` for a relationship's, which the
 * Materials tab already links to, and `item-<id>` for an item's own.
 */
export const anchorOf = (card: string, ownCard: boolean): string =>
  ownCard ? `item-${card}` : `relationship-${card}`

/**
 * Who a Concern is about, on the list and on its card. Ending a pair ends its
 * memberships, so who was in it is usually gone from the history; who raised
 * the Concerns is not.
 */
export const concernWho = (item: ConcernCareItem): string => {
  const leaders = item.members.filter((member) => member.role === 'leader').map((member) => member.fullName)
  const raisers = [...new Set(item.concerns.flatMap((concern) => (concern.raisedByName ? [concern.raisedByName] : [])))]
  return item.members.length === 0 && raisers.length > 0 ? pairTitle(raisers) : whoIsInIt(leaders, item.participantNames)
}

export const frontOf = (
  item: CareNeededItem,
  items: readonly CareNeededItem[],
  live: ReadonlySet<string>,
  now: Date,
): FrontItem => {
  const card = cardOf(item, live)

  if (item.source === 'follow_up') {
    const kind = item.payload.kind
    const red = READS_AS_A_CONCERN.has(kind)
    const leaders = item.members.filter((member) => member.role === 'leader').map((member) => member.fullName)
    const disciples = item.members.filter((member) => member.role === 'participant').map((member) => member.fullName)
    // The pair the item is about, unless it is about somebody who is not one of
    // them: a Leader whose invitation was withdrawn, or somebody asking to join.
    const aboutThePair =
      item.members.length > 0 &&
      (item.personId === null || item.members.some((member) => member.personId === item.personId))
    const who =
      kind === 'match_declined'
        ? declinedTitle(item.personName, item.invited?.leadsAGroup ?? true)
        : aboutThePair
          ? whoIsInIt(leaders, disciples)
          : (item.personName ?? whoIsInIt(leaders, disciples))
    return {
      card,
      tone: red ? 'care-concern' : 'review',
      tagTone: red ? 'concern' : 'review',
      tag: followUpTag[kind],
      who,
      line: itemReason(item),
      held: heldFor(item.raisedAt, now),
    }
  }

  if (item.source === 'relationship') {
    const stalled = item.state === 'stalled'
    const reason = item.reasons[0]
    // Needs Care is a Concern raised this week: it has held since the newest one.
    const newest = items.find(
      (each) => each.source === 'concern' && each.relationshipId === item.relationshipId,
    )
    const since = newest?.source === 'concern' ? newest.concerns[0]?.raisedAt : undefined
    return {
      card,
      tone: stalled ? 'care-stalled' : 'care-concern',
      tagTone: stalled ? 'stalled' : 'concern',
      tag: stalled ? stalledTag : needsCareTag,
      who: whoIsInIt(item.leaderNames, item.participantNames),
      line: stalled && reason ? stalledLine(reason) : NEEDS_CARE_LINE,
      held: stalled && reason ? stallHeld(reason) : since ? heldFor(since, now) : null,
    }
  }

  // Unresolved since the oldest of them was raised; the list is newest first.
  const oldest = item.concerns[item.concerns.length - 1]
  return {
    card,
    tone: 'care-concern',
    tagTone: 'concern',
    tag: concernTag(item.concerns.length),
    who: concernWho(item),
    line: concernLine(item.concerns.length),
    held: oldest ? heldFor(oldest.raisedAt, now) : null,
  }
}
