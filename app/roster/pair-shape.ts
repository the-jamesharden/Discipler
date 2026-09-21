import type { PairingMode } from '~/domain/separate-pairings'
import { PAIR_POPUP } from './copy'

/**
 * What two or more ticks become in the Pair popup from a Discipler (Manual pairing,
 * recut ticket 02): the shape toggle, who is unticked when the shape changes, and
 * the Materials each shape holds.
 *
 * All of it is pure and none of it is the component's. The repository has no
 * harness for client script, so what the popup does is decided here, where a test
 * can drive it, and `pair-popup-from-a-discipler.tsx` draws what this answers. Not a
 * `'use client'` module, so the server may read it too.
 *
 * It decides no pairing rule. Why a row is greyed arrives already in words, from
 * `./greying`, once for each thing a row can be read against; this only says which
 * of them the ticks have made current.
 */

/**
 * What two or more ticked Disciples can be made into. One ticked is a one-to-one
 * and is no shape: nothing is asked and no toggle shows. The Group shape is a
 * third segment here when its ticket lands, not a second mechanism.
 */
export type PairShape = 'one_to_two' | 'separate'

/** Why a segment cannot be picked. */
export type ShapeRuledOut =
  /** A 1:2 pair is two Disciples. Struck out, with the hint beneath the toggle. */
  | 'needs_exactly_two'
  /** `leader_one_open_group`: a 1:2 pair is a group for every rule, and this Discipler leads one. */
  | 'already_leads_a_group'

export interface ShapeSegment {
  readonly shape: PairShape
  readonly ruledOut: ShapeRuledOut | null
}

export interface ShapeToggle {
  /** In the order they are drawn. */
  readonly segments: readonly ShapeSegment[]
  readonly selected: PairShape
}

/**
 * The segments, in the order they are drawn, which is also the order the default
 * is looked for in: the first that is not ruled out.
 */
const SHAPES: readonly PairShape[] = ['one_to_two', 'separate']

const ruledOut = (
  shape: PairShape,
  { ticked, leadsAGroup }: { readonly ticked: number; readonly leadsAGroup: boolean },
): ShapeRuledOut | null =>
  shape === 'separate'
    ? null
    : // Said first where both hold: nothing about the ticks would open the segment,
      // so the count would be the wrong thing to act on.
      leadsAGroup
      ? 'already_leads_a_group'
      : ticked === 2
        ? null
        : 'needs_exactly_two'

/**
 * The toggle, as one function of the ticks, the Admin's pick and what is possible.
 * Null while zero or one Disciple is ticked, which is hidden. What the Admin picked
 * stays picked until it becomes impossible. Untouched, the default follows the
 * count, and passes over a shape that would untick somebody who is ticked where
 * another would not: two who cannot be a 1:2 pair are 2 x 1:1 until the Admin says
 * otherwise. N x 1:1 pairs is never ruled out at two or more, so something is
 * always selected.
 */
export const shapeToggle = (facts: {
  /** How many Disciples are ticked. */
  readonly ticked: number
  readonly picked: PairShape | null
  /** Whether the Discipler the popup is for already leads a group. */
  readonly leadsAGroup: boolean
  /** The shapes that grey somebody who is ticked, and so would untick them. */
  readonly wouldUntick: readonly PairShape[]
}): ShapeToggle | null => {
  if (facts.ticked < 2) return null

  const open = (shape: PairShape): boolean => ruledOut(shape, facts) === null
  const selected =
    facts.picked !== null && open(facts.picked)
      ? facts.picked
      : (SHAPES.find((shape) => open(shape) && !facts.wouldUntick.includes(shape)) ?? SHAPES.find(open) ?? 'separate')

  return { segments: SHAPES.map((shape) => ({ shape, ruledOut: ruledOut(shape, facts) })), selected }
}

/**
 * What a row is read against. One tick, and each of N x 1:1 pairs, is a one-to-one;
 * a 1:2 pair declares the Discipler's gender and is a group for every rule. Named
 * for what the Admin is making and never a relationship's kind, which nothing in
 * `app/` reads (ADR-0004).
 */
export type ReadAs = 'a_one_to_one' | 'a_one_to_two'

const readAs = (shape: PairShape | null): ReadAs => (shape === 'one_to_two' ? 'a_one_to_two' : 'a_one_to_one')

export interface PairSelectionRow {
  readonly id: string
  /** Why this row cannot be ticked, already in words, against each thing it can be read against. */
  readonly greyed: Readonly<Record<ReadAs, string | null>>
}

export interface PairSelectionContext {
  /** The popup's rows, in the order listed. */
  readonly rows: readonly PairSelectionRow[]
  readonly leadsAGroup: boolean
  /** The Ministry's live Materials. A choice of anything else is no choice. */
  readonly materialIds: readonly string[]
}

/** Everything the Admin has chosen in the popup. What is drawn and what is posted both follow from it. */
export interface PairSelection {
  /** In the order listed, whatever order they were ticked in. */
  readonly tickedIds: readonly string[]
  /** The segment the Admin picked, or null while the default stands. Forgotten once impossible. */
  readonly picked: PairShape | null
  /** The 1:2 pair's one Material. Empty is *No material*, which is the default. */
  readonly material: string
  /** A Material per ticked Disciple for N x 1:1 pairs. No entry is *No material*. */
  readonly materialFor: Readonly<Record<string, string>>
  /**
   * Who the last change unticked because the shape it made greys them, and why, in
   * the words their row was greyed with at that moment. The reason is kept here and
   * not left to the row: unticking can move the shape again, and the row then reads
   * against what the ticks would make now, which may be nothing that greys them.
   */
  readonly unticked: readonly { readonly id: string; readonly why: string }[]
}

export type PairSelectionChange =
  | { readonly type: 'tick'; readonly id: string }
  | { readonly type: 'untick'; readonly id: string }
  | { readonly type: 'clear' }
  | { readonly type: 'pick'; readonly shape: PairShape }
  | { readonly type: 'material'; readonly materialId: string }
  | { readonly type: 'material_for'; readonly id: string; readonly materialId: string }

type Ticks = Pick<PairSelection, 'tickedIds' | 'picked'>

/** The toggle as the ticks and the pick have it, or null while it is hidden. */
export const shapeOf = (context: PairSelectionContext, { tickedIds, picked }: Ticks): ShapeToggle | null =>
  shapeToggle({
    ticked: tickedIds.length,
    picked,
    leadsAGroup: context.leadsAGroup,
    wouldUntick: SHAPES.filter((shape) =>
      context.rows.some((row) => tickedIds.includes(row.id) && row.greyed[readAs(shape)] !== null),
    ),
  })

/** What the ticks make a row be read against: the selected shape, or a one-to-one while there is none. */
const readAgainst = (context: PairSelectionContext, ticks: Ticks): ReadAs =>
  readAs(shapeOf(context, ticks)?.selected ?? null)

/**
 * Why a row cannot be ticked now, or null. **A row is read against the shape the
 * ticks would make with it ticked**: a ticked row against the shape there is, and
 * an unticked one against the shape one more tick would make. That is what *while
 * the shape would make a 1:1* means for a row nobody has ticked yet, and it is the
 * only way somebody already in a one-to-one can come to be ticked for a 1:2 pair:
 * the toggle shows at two, and with one ticked the second would make a 1:2.
 */
export const greyedOnRow = (
  context: PairSelectionContext,
  selection: PairSelection,
  row: PairSelectionRow,
): string | null => {
  const tickedIds = selection.tickedIds.includes(row.id) ? selection.tickedIds : [...selection.tickedIds, row.id]
  return row.greyed[readAgainst(context, { tickedIds, picked: selection.picked })]
}

/**
 * Changing the shape re-checks every row: anybody ticked whom the shape now greys is
 * unticked, and named, rather than dropped silently. Unticking can move the shape
 * again (two ticked falling to one is a one-to-one), so it goes round until nobody
 * else falls out, which it must, since each round only unticks. A pick that has
 * become impossible is forgotten on the way.
 */
const settled = (
  context: PairSelectionContext,
  ticked: readonly string[],
  pickedBefore: PairShape | null,
): Pick<PairSelection, 'tickedIds' | 'picked' | 'unticked'> => {
  const listed = context.rows.filter(({ id }) => ticked.includes(id))
  const ticks = { tickedIds: listed.map(({ id }) => id), picked: pickedBefore }
  // Forgotten unless it is what is selected: below two ticks nothing is.
  const picked = pickedBefore !== null && shapeOf(context, ticks)?.selected === pickedBefore ? pickedBefore : null

  const greyedNow = listed.flatMap(({ id, greyed }) => {
    const why = greyed[readAgainst(context, ticks)]
    return why === null ? [] : [{ id, why }]
  })
  if (greyedNow.length === 0) return { tickedIds: ticks.tickedIds, picked, unticked: [] }

  const stillTicked = ticks.tickedIds.filter((id) => !greyedNow.some((gone) => gone.id === id))
  const rest = settled(context, stillTicked, picked)
  return { ...rest, unticked: [...greyedNow, ...rest.unticked] }
}

/**
 * The Materials that survive a change. Each shape keeps its own and neither is
 * carried into the other: the 1:2 pair's one Material is never any Disciple's, and
 * theirs are never its. Only the selected shape's dropdowns are drawn, so only its
 * choices are posted. Unticking somebody removes their choice and leaves the
 * others' as they were, whether or not the default moved the shape on the way.
 * Below two ticks there is no shape, nothing is asked, and nothing is kept.
 */
const materialsAfter = (
  context: PairSelectionContext,
  next: Ticks,
  held: Pick<PairSelection, 'material' | 'materialFor'>,
): Pick<PairSelection, 'material' | 'materialFor'> => {
  const onTheList = (materialId: string | undefined): materialId is string =>
    materialId !== undefined && context.materialIds.includes(materialId)

  if (shapeOf(context, next) === null) return { material: '', materialFor: {} }
  return {
    material: onTheList(held.material) ? held.material : '',
    materialFor: Object.fromEntries(
      next.tickedIds.flatMap((id) => (onTheList(held.materialFor[id]) ? [[id, held.materialFor[id]]] : [])),
    ),
  }
}

/**
 * What a submission that came back refused had chosen, as its address says it and
 * unchecked: the ticks, the shape and every Material. Plain arrays, so the Roster's
 * page can hand it to the popup as it is.
 */
export interface RestoredSelection {
  readonly tickedIds: readonly string[]
  /** Whether it was submitted as N x 1:1 pairs. Anything else is the default's to say. */
  readonly separate: boolean
  readonly material: string | null
  /** Who each Material was chosen for, and which. */
  readonly materialFor: readonly (readonly [string, string])[]
}

/**
 * The selection a popup opens with: nothing, or what a refused submission sends
 * back. A tick that is greyed now is not restored as ticked, and is named like any
 * other; somebody who is not on the list is restored as nobody. A Material that has
 * left the list is not restored, and the rest of the selection is.
 */
export const selectionFrom = (context: PairSelectionContext, restored: RestoredSelection): PairSelection => {
  const next = settled(context, restored.tickedIds, restored.separate ? 'separate' : null)
  return {
    ...next,
    // A refused submission chose under one shape, and only that shape's come back.
    ...materialsAfter(context, next, {
      material: (shapeOf(context, next)?.selected === 'one_to_two' ? restored.material : null) ?? '',
      materialFor: shapeOf(context, next)?.selected === 'separate' ? Object.fromEntries(restored.materialFor) : {},
    }),
  }
}

export const selectionAfter = (
  context: PairSelectionContext,
  selection: PairSelection,
  change: PairSelectionChange,
): PairSelection => {
  if (change.type === 'material' || change.type === 'material_for') {
    const held =
      change.type === 'material'
        ? { material: change.materialId, materialFor: selection.materialFor }
        : { material: selection.material, materialFor: { ...selection.materialFor, [change.id]: change.materialId } }
    return { ...selection, ...materialsAfter(context, selection, held) }
  }

  if (change.type === 'tick') {
    const row = context.rows.find(({ id }) => id === change.id)
    // A greyed box cannot be ticked, and this is where that is true with or without the markup.
    if (row === undefined || greyedOnRow(context, selection, row) !== null) return selection
  }
  if (change.type === 'pick') {
    const segment = shapeOf(context, selection)?.segments.find(({ shape }) => shape === change.shape)
    if (segment === undefined || segment.ruledOut !== null) return selection
  }

  const ticked =
    change.type === 'tick'
      ? [...selection.tickedIds, change.id]
      : change.type === 'untick'
        ? selection.tickedIds.filter((id) => id !== change.id)
        : change.type === 'clear'
          ? []
          : selection.tickedIds
  const next = settled(context, ticked, change.type === 'pick' ? change.shape : selection.picked)
  return { ...next, ...materialsAfter(context, next, selection) }
}

/** What the pairing route is told: a 1:2 pair is one relationship of them all, which is what it has always made. */
export const modeOf = (shape: PairShape): PairingMode => (shape === 'separate' ? 'separate' : 'together')

/**
 * What a 1:2 pair posts without being asked: its name, and the Discipler's gender
 * as its declaration, in the words the declaration's own field uses. A 1:2 is a
 * group for every rule, which is why it carries both. A Discipler with no gender on
 * file posts no declaration, and the refusal is the domain's to give: the popup
 * does not answer a safeguarding question with a guess.
 */
export const postedByAOneToTwo = ({
  discipler,
  disciples,
  declaredGender,
}: {
  readonly discipler: string
  readonly disciples: readonly [string, string]
  readonly declaredGender: string | null
}): Readonly<Record<string, string>> => ({
  name: PAIR_POPUP.nameOfAOneToTwo(discipler, disciples),
  ...(declaredGender === null ? {} : { declaredGender }),
})
