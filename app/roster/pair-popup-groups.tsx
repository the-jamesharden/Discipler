'use client'

import { PAIR_POPUP } from './copy'
import { PairRow } from './pair-popup'

/**
 * The Ministry's groups in the Pair popup (Manual pairing, recut ticket 03): a
 * **Groups** heading and one row per group, listed like people, under whichever
 * side's people the popup lists. A file of its own and part of neither side, so
 * each side lists groups with it and edits neither this nor the other side.
 *
 * What choosing a group means is the side's: from a Disciple it puts them straight
 * into it. Which groups are offered and which are greyed is decided before they
 * arrive here (`groupsToJoin` in `./lists`, `./greying`), as it is for people.
 */

/** The field a chosen group posts as, which is what the route that joins one reads. */
export const GROUP_FIELD = 'groupId'

/** One group as the popup lists it. Nothing the Pair document does not already hold for this Admin. */
export interface PairPopupGroup {
  readonly id: string
  /** What the Ministry calls it, or null where nobody has named it. */
  readonly name: string | null
  readonly leaders: readonly { readonly fullName: string }[]
  readonly discipleCount: number
  /** What it declared. Null is the model's mixed, which the screen calls Coed. */
  readonly declaredGender: 'male' | 'female' | null
  /** Null while it is running. */
  readonly state: 'paused' | 'awaiting_leader_acceptance' | null
  /** Why it cannot be chosen, already in words, or null where it can. */
  readonly greyed: string | null
}

/** One group's row: a round mark, its initials on a square, what it is called, and what it is beneath. */
export const PairGroupRow = ({
  group,
  checked,
  onChoose,
}: {
  readonly group: PairPopupGroup
  readonly checked: boolean
  readonly onChoose: () => void
}) => (
  <PairRow
    mark="radio"
    name={GROUP_FIELD}
    avatar="of_a_group"
    person={{ id: group.id, fullName: PAIR_POPUP.groupLabel(group) }}
    details={PAIR_POPUP.groupDetails(group)}
    greyed={group.greyed}
    checked={checked}
    onChange={onChoose}
  />
)

/**
 * The heading and the rows, inside the side's own list so they scroll with it. A
 * Ministry with no groups to offer shows no heading. Exactly one group can be
 * chosen: round marks, on both sides.
 */
export const PairGroups = ({
  groups,
  chosenId,
  onChoose,
}: {
  readonly groups: readonly PairPopupGroup[]
  /** The group chosen, or null. Whether anything else is chosen beside it is the side's to rule. */
  readonly chosenId: string | null
  readonly onChoose: (id: string) => void
}) =>
  groups.length === 0 ? null : (
    <>
      <p className="pair-group-head">{PAIR_POPUP.groupsHeading}</p>
      {groups.map((group) => (
        <PairGroupRow
          key={group.id}
          group={group}
          checked={group.id === chosenId}
          onChoose={() => onChoose(group.id)}
        />
      ))}
    </>
  )
