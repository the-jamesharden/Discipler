'use client'

import { useState } from 'react'
import type { Gender } from '~/domain/intake'
import { displayPhone, firstTimeLabel, PAIR_POPUP, type GroupOnARow, type RosterList } from './copy'
import { GROUP_DECLARATIONS } from './declared-gender'
import { CLEAR } from './import-copy'
import { AS_A_LEADER, JOIN_AS_FIELD } from './pair/join-as'
import { materialFieldFor } from './pair/material-per-disciple'
import { PairList, PairPopupShell, PairRow, useHydrated } from './pair-popup'
import { PairGroups, type PairPopupGroup } from './pair-popup-groups'
import {
  canBePosted,
  greyedOnRow,
  GROUP_SHAPE,
  modeOf,
  postedByAGroup,
  postedByAOneToTwo,
  selectionAfter,
  selectionFrom,
  shapeOf,
  type PairSelectionChange,
  type PairSelectionContext,
  type ReadAs,
  type RestoredSelection,
} from './pair-shape'

/**
 * The Pair popup, from a Discipler (Manual pairing, ticket 23, and recut tickets
 * 02 and 04): the list of Disciples with boxes. One tick makes the one-to-one the
 * other side makes, in the same sentence and on the same button, and nothing else
 * is asked: no gender, no name, no Material.
 *
 * Two or more ticked, and a toggle asks what to make of them: a 1:2 pair, which is
 * named and declared without asking; N x 1:1 pairs, all of them or none; or a
 * Group, which is asked what it is, Women's, Men's or Coed, preset from the
 * Discipler, and what it is called. Then the Material: one for a 1:2 pair or a
 * Group, and one per Disciple for N x 1:1. No join-approval control: a group formed
 * here takes the default, off, and that switch stays on the Intake forms page
 * (ADR-0017). What the ticks, the toggles and the dropdowns do is `./pair-shape`,
 * pure and tested there; this file draws what it answers.
 *
 * Under the Disciples, the Ministry's groups (recut ticket 04). Choosing one adds
 * the Discipler to it as another leader, by invitation, and the popup does one
 * thing at a time: ticking a Disciple clears a chosen group, and choosing a group
 * clears every tick, so nothing a shape asks is on screen beside one.
 *
 * This file is the Discipler's side and nothing else. What it shares with the
 * Disciple's side is `./pair-popup`, and the groups are `./pair-popup-groups`. No
 * row opens it yet: it is reached by its
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
  /** The readings under which they are not shown at all: the ones gender rules them out of. */
  readonly leftOut: readonly ReadAs[]
}

export const PairPopupFromADiscipler = ({
  person,
  list,
  disciples,
  groups,
  leadsAGroup,
  declaredGender,
  presetGender,
  materials,
  refusal,
  restored,
}: {
  /** Whose popup this is: the Discipler being paired. */
  readonly person: { readonly id: string; readonly fullName: string }
  readonly list: RosterList
  readonly disciples: readonly PairPopupDisciple[]
  /**
   * The groups this Discipler could help lead: every one the Ministry has that they
   * are not already in and whose declaration does not rule them out. Every one is
   * greyed while they already lead a group.
   */
  readonly groups: readonly PairPopupGroup[]
  /** Whether they already lead a group, which rules a 1:2 pair and a Group out: each is a group for that rule. */
  readonly leadsAGroup: boolean
  /** What a 1:2 pair declares, as the declaration's field says it: their gender, or null with none on file. */
  readonly declaredGender: string | null
  /** What a Group's gender toggle starts on: their gender, or null with none on file, which presets nothing. */
  readonly presetGender: Gender | null
  /** The Ministry's live Materials, in title order. None, and no dropdown is drawn at all. */
  readonly materials: readonly { readonly id: string; readonly title: string }[]
  readonly refusal: string | undefined
  /** What a submission that came back refused had chosen: the ticks, the shape, a Group's answers and every Material. */
  readonly restored: RestoredSelection
}) => {
  const context: PairSelectionContext = {
    rows: disciples,
    leadsAGroup,
    presetGender,
    materialIds: materials.map(({ id }) => id),
    groups,
  }
  const [selection, setSelection] = useState(() => selectionFrom(context, restored))
  const change = (next: PairSelectionChange) => setSelection((before) => selectionAfter(context, before, next))

  const hydrated = useHydrated()
  // Why each row cannot be ticked now, if it cannot, and whether it is shown at all.
  const greyedNow = new Map(disciples.map((each) => [each.id, greyedOnRow(context, selection, each)]))
  const shown = disciples.filter((each) => !greyedNow.get(each.id)?.leftOut)
  const group = groups.find(({ id }) => id === selection.groupId) ?? null
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

  // The sentence and the button are the same act: a group to help lead, one tick's
  // one-to-one, or whatever the toggle has two or more ticks become.
  const sentenceFor = (): { readonly summary: string; readonly label: string } | null => {
    if (group !== null) return { summary: PAIR_POPUP.coLead(person.fullName, group), label: PAIR_POPUP.addAsCoDiscipler }
    if (toggle === null) {
      return first === undefined
        ? null
        : { summary: PAIR_POPUP.oneToOne(person.fullName, first), label: PAIR_POPUP.createOneToOne }
    }
    if (toggle.selected === 'one_to_two') {
      return { summary: PAIR_POPUP.oneToTwo(person.fullName, names), label: PAIR_POPUP.createOneToTwo }
    }
    if (toggle.selected === GROUP_SHAPE) {
      return { summary: PAIR_POPUP.group(person.fullName, selection.declared, names), label: PAIR_POPUP.createGroup(names.length) }
    }
    return { summary: PAIR_POPUP.separately(person.fullName, names), label: PAIR_POPUP.createSeparately(names.length) }
  }
  const making = sentenceFor()

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
      // What is chosen decides the act, and so the route and what it is told: a
      // group that exists is joined, by this Discipler, as another leader of it.
      postsTo={group ? 'join' : 'create'}
      posts={
        group
          ? { personId: person.id, [JOIN_AS_FIELD]: AS_A_LEADER }
          : {
              leaderId: person.id,
              // Named and declared without asking, and neither is shown.
              ...(oneToTwo ? postedByAOneToTwo({ discipler: person.fullName, disciples: [first, second], declaredGender }) : {}),
              // A Group is asked both, in the open. It says only that it is one, for the way back from a refusal.
              ...(toggle?.selected === GROUP_SHAPE ? postedByAGroup : {}),
            }
      }
      summary={making?.summary ?? null}
      submit={{
        label: making?.label ?? PAIR_POPUP.nothingChosen,
        // Nothing ticked is disabled only where script runs, so an Admin without it
        // can still tick and post. A Group waits for its declaration and its name too.
        disabled: hydrated && !canBePosted(context, selection),
      }}
      grows
    >
      <p className="pair-intro">{PAIR_POPUP.chooseDisciples(person.fullName)}</p>

      {shown.length === 0 && groups.length === 0 ? (
        // Where gender is why nobody is listed, how somebody comes to be listed is not why.
        <p className="empty">{disciples.length === 0 ? PAIR_POPUP.noDisciples : PAIR_POPUP.nobodyToChoose}</p>
      ) : (
        <>
          <div className="pair-toolbar">
            {/* Whoever is shown, so the number follows the rows as Coed opens them. */}
            <span>{PAIR_POPUP.counts(PAIR_POPUP.disciples(shown.length), groups.length)}</span>
            {/* Unticks everything, and clears a chosen group. There is no Select all. */}
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
                greyed={greyedNow.get(disciple.id)?.why ?? null}
                leftOut={greyedNow.get(disciple.id)?.leftOut ?? false}
                // With a group the server sent chosen, a refused join restored, the
                // form points at the route that joins, and a Disciple ticked beside
                // it would be posted there and ignored. Held until script runs.
                held={!hydrated && group !== null}
                checked={selection.tickedIds.includes(disciple.id)}
                onChange={(checked) => change({ type: checked ? 'tick' : 'untick', id: disciple.id })}
              />
            ))}
            <PairGroups
              groups={groups}
              chosenId={group?.id ?? null}
              onChoose={(id) => change({ type: 'choose_group', id })}
            />
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

      {toggle?.selected === GROUP_SHAPE ? (
        <>
          {/* What the group is, directly under the shape toggle (D1): answered on the
              Admin's behalf from the Discipler, in the open, in words, and theirs to
              change before anything is formed. With no gender on file nothing is
              checked, and nothing is posted that nobody said. The declaration's own
              field, as real radios, like the segments above. */}
          <div className="pair-shape pair-declares" role="radiogroup" aria-label={PAIR_POPUP.whatKindOfGroup}>
            {GROUP_DECLARATIONS.map((declared) => (
              <label key={declared} className={selection.declared === declared ? 'on' : undefined}>
                <input
                  type="radio"
                  name="declaredGender"
                  value={declared}
                  checked={selection.declared === declared}
                  onChange={() => change({ type: 'declare', declared })}
                />
                {PAIR_POPUP.declares(declared)}
              </label>
            ))}
          </div>

          <label className="pair-label" htmlFor="pair-group-name">{PAIR_POPUP.groupName}</label>
          {/* The placeholder is a hint and is never submitted: an empty field posts
              an empty name, and the button waits for a real one. */}
          <input
            id="pair-group-name"
            type="text"
            name="name"
            value={selection.name}
            onChange={(event) => change({ type: 'name', name: event.target.value })}
            placeholder={PAIR_POPUP.groupNamePlaceholder(person.fullName)}
            autoComplete="off"
            required
          />
        </>
      ) : null}

      {/* A Ministry with no live Materials is asked nothing, and no empty label
          stands where the dropdowns would have been. */}
      {toggle && materials.length > 0 ? (
        toggle.selected !== 'separate' ? (
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
