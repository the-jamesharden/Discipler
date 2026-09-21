'use client'

import { PAIR_POPUP, type GroupListed } from './copy'
import { PairRow, useHydrated } from './pair-popup'

/**
 * The Ministry's groups in the Pair popup (Manual pairing, recut ticket 03): a
 * **Groups** heading and one row per group, listed like people, under whichever
 * side's people the popup lists. A file of its own and part of neither side, so
 * each side lists groups with it and edits neither this nor the other side.
 *
 * What choosing a group means is the side's: from a Disciple it puts them straight
 * into it. Which groups are listed is decided before they arrive here
 * (`groupsShownTo` in `./greying`), as it is for people, and so is whether one is
 * greyed: none is from a Disciple, and from a Discipler every one is while they
 * already lead a group.
 */

/** One group as the popup lists it. Nothing the Pair document does not already hold for this Admin. */
export interface PairPopupGroup extends GroupListed {
  readonly id: string
  /** Why it cannot be chosen, already in words, or null where it can. */
  readonly greyed: string | null
}

/** One group's row: a round mark, its initials on a square, what it is called, and what it is beneath. */
export const PairGroupRow = ({
  group,
  checked,
  held,
  onChoose,
}: {
  readonly group: PairPopupGroup
  readonly checked: boolean
  /** Held until script runs: see `PairRow`. */
  readonly held: boolean
  readonly onChoose: () => void
}) => (
  <PairRow
    mark="radio"
    // The field the route that puts somebody into a group reads.
    name="groupId"
    avatar="of_a_group"
    held={held}
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
}) => {
  // Choosing a group points the form at the route that joins, which takes script,
  // so until it runs no group can be marked. One the server sent already chosen is
  // open as it stands: the server pointed the form there too.
  const hydrated = useHydrated()
  return groups.length === 0 ? null : (
    <>
      <p className="pair-group-head">{PAIR_POPUP.groupsHeading}</p>
      {groups.map((group) => (
        <PairGroupRow
          key={group.id}
          group={group}
          checked={group.id === chosenId}
          held={!hydrated && group.id !== chosenId}
          onChoose={() => onChoose(group.id)}
        />
      ))}
    </>
  )
}
