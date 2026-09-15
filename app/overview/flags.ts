import type { RelationshipId } from '~/domain/ids'
import type { CareNeededItem } from '~/service/ports'
import { shortConcern, shortFollowUp, shortReason } from './copy'

/**
 * The care items about one relationship, as the short words a card carries.
 *
 * Shared by the Overview's cards and the Materials folders' cards, so the two
 * cannot word the same item differently: the flag line comes from the Care
 * Needed list and not from the state, which is what keeps an unresolved Concern
 * on a relationship that has since answered.
 */
export const flagsFor = (
  relationship: RelationshipId,
  care: readonly CareNeededItem[],
): { readonly flags: readonly string[]; readonly tone: 'needscare' | 'stalled' | 'review' } => {
  const mine = care.filter((item) => item.relationshipId === relationship)
  const flags = mine
    .map((item) =>
      item.source === 'follow_up'
        ? shortFollowUp[item.payload.kind](item.waitedDays)
        : item.source === 'relationship'
          ? item.reasons.map(shortReason).join(' · ')
          : shortConcern(item.concerns.length),
    )
    // A Needs Care relationship carries no reason of its own; its Concern is the
    // flag, and it is on the list as a badge already.
    .filter((flag) => flag !== '')
  const tone = mine.some((item) => item.source === 'concern')
    ? 'needscare'
    : mine.some((item) => item.source === 'relationship')
      ? 'stalled'
      : 'review'
  return { flags, tone }
}

/** The relationships with something on the Care Needed list, whose cards link to it. */
export const flaggedIn = (care: readonly CareNeededItem[]): ReadonlySet<RelationshipId> =>
  new Set(care.flatMap((item) => (item.relationshipId ? [item.relationshipId] : [])))
