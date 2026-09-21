'use client'

import { useState } from 'react'
import { displayPhone, firstTimeLabel, PAIR_POPUP, type GroupOnARow, type RosterList } from './copy'
import { CLEAR } from './import-copy'
import { materialFieldFor } from './pair/material-per-disciple'
import { PairList, PairPopupShell, PairRow, useHydrated } from './pair-popup'
import {
  greyedOnRow,
  modeOf,
  postedByAOneToTwo,
  selectionAfter,
  selectionFrom,
  shapeOf,
  type PairSelectionChange,
  type PairSelectionContext,
  type ReadAs,
} from './pair-shape'

/**
 * The Pair popup, from a Discipler (Manual pairing, ticket 23, and recut ticket
 * 02): the list of Disciples with boxes. One tick makes the one-to-one the other
 * side makes, in the same sentence and on the same button, and nothing else is
 * asked: no gender, no name, no Material.
 *
 * Two or more ticked, and a toggle asks what to make of them: a 1:2 pair, which is
 * named and declared without asking, or N x 1:1 pairs, all of them or none. Then
 * the Material: one for a 1:2 pair, and one per Disciple for N x 1:1. What the
 * ticks, the toggle and the dropdowns do is `./pair-shape`, pure and tested there;
 * this file draws what it answers.
 *
 * This file is the Discipler's side and nothing else. What it shares with the
 * Disciple's side is `./pair-popup`. No row opens it yet: it is reached by its
 * address, and a Discipler's row keeps opening the old Pair page.
 */

/** One Disciple as the popup lists them. Nothing the Roster behind it does not already show this Admin. */
export interface PairPopupDisciple {
  readonly id: string
  readonly fullName: string
  readonly email: string | null
  readonly phone: string | null
  /** What they said about whether this is their first time, or null where nobody asked. Ranks and filters nobody. */
  readonly firstTime: boolean | null
  /** The groups they are already in, which hides nobody and greys nobody. */
  readonly groups: readonly GroupOnARow[]
  /**
   * Why they cannot be ticked, already in words, against each thing the ticks can
   * make, or null where they can. Which of them the row shows follows the ticks.
   */
  readonly greyed: Readonly<Record<ReadAs, string | null>>
}

export const PairPopupFromADiscipler = ({
  person,
  list,
  disciples,
  leadsAGroup,
  declaredGender,
  materials,
  refusal,
  restored,
}: {
  /** Whose popup this is: the Discipler being paired. */
  readonly person: { readonly id: string; readonly fullName: string }
  readonly list: RosterList
  readonly disciples: readonly PairPopupDisciple[]
  /** Whether they already lead a group, which rules a 1:2 pair out: a 1:2 is a group for every rule. */
  readonly leadsAGroup: boolean
  /** What a 1:2 pair declares, as the declaration's field says it: their gender, or null with none on file. */
  readonly declaredGender: string | null
  /** The Ministry's live Materials, in title order. None, and no dropdown is drawn at all. */
  readonly materials: readonly { readonly id: string; readonly title: string }[]
  readonly refusal: string | undefined
  /** What a submission that came back refused had chosen: the ticks, the shape and every Material. */
  readonly restored: {
    readonly tickedIds: readonly string[]
    readonly separate: boolean
    readonly material: string | null
    readonly materialFor: readonly (readonly [string, string])[]
  }
}) => {
  const context: PairSelectionContext = {
    rows: disciples,
    leadsAGroup,
    materialIds: materials.map(({ id }) => id),
  }
  const [selection, setSelection] = useState(() =>
    selectionFrom(context, { ...restored, materialFor: new Map(restored.materialFor) }),
  )
  const change = (next: PairSelectionChange) => setSelection((before) => selectionAfter(context, before, next))

  const hydrated = useHydrated()
  const ticked = disciples.filter((each) => selection.tickedIds.includes(each.id))
  const names = ticked.map(({ fullName }) => fullName)
  const toggle = shapeOf(context, selection)
  const [first, second] = names
  // A 1:2 pair is exactly two, which is what the toggle selecting it means.
  const oneToTwo = toggle?.selected === 'one_to_two' && first !== undefined && second !== undefined
  const hint = toggle?.segments.find(({ ruledOut }) => ruledOut !== null)?.ruledOut ?? null
  const unticked = selection.unticked.flatMap(({ id, why }) => {
    const gone = disciples.find((each) => each.id === id)
    return gone ? [PAIR_POPUP.unticked(gone.fullName, why)] : []
  })

  const making =
    toggle === null
      ? first === undefined
        ? null
        : { summary: PAIR_POPUP.oneToOne(person.fullName, first), label: PAIR_POPUP.createOneToOne }
      : toggle.selected === 'one_to_two'
        ? { summary: PAIR_POPUP.oneToTwo(person.fullName, names), label: PAIR_POPUP.createOneToTwo }
        : { summary: PAIR_POPUP.separately(person.fullName, names), label: PAIR_POPUP.createSeparately(names.length) }

  const materialOptions = (
    <>
      {/* First, and the default: nothing is assumed about what anybody is running. */}
      <option value="">{PAIR_POPUP.noMaterial}</option>
      {materials.map((material) => (
        <option key={material.id} value={material.id}>{material.title}</option>
      ))}
    </>
  )

  return (
    <PairPopupShell
      person={person}
      list={list}
      refusal={refusal}
      posts={{
        leaderId: person.id,
        // Named and declared without asking, and neither is shown.
        ...(oneToTwo ? postedByAOneToTwo({ discipler: person.fullName, disciples: [first, second], declaredGender }) : {}),
      }}
      summary={making?.summary ?? null}
      submit={{
        label: making?.label ?? PAIR_POPUP.nothingChosen,
        // Nothing ticked is disabled only where script runs, so an Admin without it
        // can still tick and post.
        disabled: hydrated && making === null,
      }}
      grows
    >
      <p className="pair-intro">{PAIR_POPUP.chooseDisciples(person.fullName)}</p>

      {disciples.length === 0 ? (
        <p className="empty">{PAIR_POPUP.noDisciples}</p>
      ) : (
        <>
          <div className="pair-toolbar">
            <span>{PAIR_POPUP.disciples(disciples.length)}</span>
            {/* Unticks everything. There is no Select all. */}
            {hydrated ? (
              <button type="button" className="link-btn" onClick={() => change({ type: 'clear' })}>
                {CLEAR}
              </button>
            ) : null}
          </div>

          <PairList exactlyOne={false}>
            {disciples.map((disciple) => (
              <PairRow
                key={disciple.id}
                mark="checkbox"
                name="participantId"
                person={disciple}
                details={[
                  disciple.email,
                  disciple.phone ? displayPhone(disciple.phone) : null,
                  disciple.firstTime === null ? null : firstTimeLabel(disciple.firstTime),
                  ...disciple.groups.map((group) => PAIR_POPUP.inGroup(group)),
                ]}
                greyed={greyedOnRow(context, selection, disciple)}
                checked={selection.tickedIds.includes(disciple.id)}
                onChange={(checked) => change({ type: checked ? 'tick' : 'untick', id: disciple.id })}
              />
            ))}
          </PairList>
        </>
      )}

      {/* Whoever a change of shape unticked, said rather than dropped silently. The
          region is always there, so a screen reader hears the line arrive. */}
      <p className="pair-hint pair-unticked" role="status">
        {unticked.join(' ')}
      </p>

      {toggle ? (
        <>
          <div className="pair-label" id="pair-shape-label">{PAIR_POPUP.pairThemAs}</div>
          <div className="pair-shape" role="radiogroup" aria-labelledby="pair-shape-label">
            {toggle.segments.map(({ shape, ruledOut }) => (
              <label
                key={shape}
                className={[
                  toggle.selected === shape ? 'on' : '',
                  ruledOut === 'needs_exactly_two' ? 'struck' : ruledOut === null ? '' : 'off',
                ].join(' ').trim() || undefined}
              >
                {/* The route's own field: a 1:2 pair is one relationship of them all,
                    and N x 1:1 pairs is `separate`. A real radio, so the arrow keys
                    move between segments and a ruled-out one takes no press. */}
                <input
                  type="radio"
                  name="mode"
                  value={modeOf(shape)}
                  checked={toggle.selected === shape}
                  onChange={() => change({ type: 'pick', shape })}
                  disabled={ruledOut !== null}
                  aria-describedby={ruledOut === null ? undefined : 'pair-shape-hint'}
                />
                {PAIR_POPUP.segment(shape, names.length)}
              </label>
            ))}
          </div>
          {hint ? (
            <p className="pair-hint" id="pair-shape-hint">{PAIR_POPUP.ruledOut(hint, person.fullName)}</p>
          ) : null}
        </>
      ) : null}

      {/* A Ministry with no live Materials is asked nothing, and no empty label
          stands where the dropdowns would have been. */}
      {toggle && materials.length > 0 ? (
        toggle.selected === 'one_to_two' ? (
          <>
            <label className="pair-label" htmlFor="pair-material">{PAIR_POPUP.whatTheyAreRunning}</label>
            <select
              id="pair-material"
              name="materialId"
              value={selection.material}
              onChange={(event) => change({ type: 'material', materialId: event.target.value })}
            >
              {materialOptions}
            </select>
          </>
        ) : (
          <>
            <div className="pair-label" id="pair-materials-label">{PAIR_POPUP.whatEachIsRunning}</div>
            {/* A panel of its own that scrolls, so five dropdowns never push the
                sentence and the buttons off the screen. Inside it a fieldset, which
                is the grouping role natively, as the list of boxes is. */}
            <div className="pair-per">
            <fieldset className="pair-per-rows" aria-labelledby="pair-materials-label">
              {ticked.map((disciple) => (
                <div key={disciple.id} className="pair-per-row">
                  <label htmlFor={`pair-material-${disciple.id}`}>{disciple.fullName}</label>
                  <select
                    id={`pair-material-${disciple.id}`}
                    name={materialFieldFor(disciple.id)}
                    value={selection.materialFor[disciple.id] ?? ''}
                    onChange={(event) =>
                      change({ type: 'material_for', id: disciple.id, materialId: event.target.value })
                    }
                  >
                    {materialOptions}
                  </select>
                </div>
              ))}
            </fieldset>
            </div>
          </>
        )
      ) : null}
    </PairPopupShell>
  )
}
