import type { Gender } from '~/domain/intake'
import { readPairingMode, type PairingMode } from '~/domain/separate-pairings'
import { PAIR_POPUP } from './copy'
import type { GroupDeclaration } from './declared-gender'

/**
 * What two or more ticks become in the Pair popup from a Discipler (Manual pairing,
 * recut tickets 02 and 04): the shape toggle, who is unticked when the shape
 * changes, the Materials each shape holds, and what a Group is asked: what it
 * declares and what it is called. And the one other thing the popup can do from
 * here, which is choose a group that exists for the Discipler to help lead: the
 * popup does one thing at a time, so that and the ticks clear each other.
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
 * and is no shape: nothing is asked and no toggle shows. A Group is a third segment
 * of the one toggle, not a second mechanism (Manual pairing, recut ticket 04).
 */
export type PairShape = 'one_to_two' | 'separate' | typeof GROUP_SHAPE

/**
 * The popup's Group shape, said once. It is the segment an Admin picks and the
 * value the form posts, and not a relationship's kind: what is formed counts
 * against whichever cap its members make it, as ADR-0004 has it. The word is here
 * and nowhere else in `app/`, and every comparison goes through this constant,
 * which is what `tests/domain/relationship-kind-fence.test.ts` allows this file.
 */
export const GROUP_SHAPE = 'group'

/** Why a segment cannot be picked. */
export type ShapeRuledOut =
  /** A 1:2 pair is two Disciples. Struck out, with the hint beneath the toggle. */
  | 'needs_exactly_two'
  /** `leader_one_open_group`: a 1:2 pair and a Group are each a group for that rule, and this Discipler leads one. */
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

/** The segments, in the order they are drawn. */
const SHAPES: readonly PairShape[] = ['one_to_two', 'separate', GROUP_SHAPE]

/**
 * The order the default is looked for in: the first that is not ruled out. A 1:2
 * pair at two, a Group at three or more, where a 1:2 pair is ruled out, and N x 1:1
 * pairs where the Discipler already leads a group and can be given neither.
 */
const DEFAULTS: readonly PairShape[] = ['one_to_two', GROUP_SHAPE, 'separate']

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
      : shape === GROUP_SHAPE || ticked === 2
        ? null
        : 'needs_exactly_two'

/**
 * The toggle, as one function of the ticks, the Admin's pick and what is possible.
 * Null while zero or one Disciple is ticked, which is hidden. What the Admin picked
 * stays picked until it becomes impossible. Untouched, the default follows the
 * count, and passes over a shape that would untick somebody who is ticked where
 * another would not: two who cannot be a 1:2 pair or a Group are 2 x 1:1 until the
 * Admin says otherwise. N x 1:1 pairs is never ruled out at two or more, so
 * something is always selected.
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
      : (DEFAULTS.find((shape) => open(shape) && !facts.wouldUntick.includes(shape)) ?? DEFAULTS.find(open) ?? 'separate')

  return { segments: SHAPES.map((shape) => ({ shape, ruledOut: ruledOut(shape, facts) })), selected }
}

/**
 * What a row is read against. One tick, and each of N x 1:1 pairs, is a one-to-one;
 * a 1:2 pair declares the Discipler's gender and is a group for every rule; a Group
 * declares what its gender toggle says. Named for what the Admin is making and
 * never a relationship's kind, which nothing in `app/` reads (ADR-0004).
 */
export type ReadAs = 'a_one_to_one' | 'a_one_to_two' | 'a_womens_group' | 'a_mens_group' | 'a_coed_group'

/** What a Group's rows are read against, by what it declares. */
export const READ_AS_A_GROUP: Readonly<Record<GroupDeclaration, ReadAs>> = {
  female: 'a_womens_group',
  male: 'a_mens_group',
  mixed: 'a_coed_group',
}

/**
 * A Group nobody has declared anything for, which is one whose Discipler has no
 * gender on file, rules nobody out yet: there is no declaration to read a row
 * against, and its button waits for one.
 */
const readAs = (shape: PairShape | null, declared: GroupDeclaration | null): ReadAs =>
  shape === 'one_to_two'
    ? 'a_one_to_two'
    : shape === GROUP_SHAPE
      ? READ_AS_A_GROUP[declared ?? 'mixed']
      : 'a_one_to_one'

export interface PairSelectionRow {
  readonly id: string
  /** Why this row cannot be ticked, already in words, against each thing it can be read against. */
  readonly greyed: Readonly<Record<ReadAs, string | null>>
}

export interface PairSelectionContext {
  /** The popup's rows, in the order listed. */
  readonly rows: readonly PairSelectionRow[]
  readonly leadsAGroup: boolean
  /**
   * What a Group's gender toggle starts on: the Discipler's gender, or null with
   * none on file, which presets nothing (Manual pairing, recut ticket 04, D1).
   */
  readonly presetGender: Gender | null
  /** The Ministry's live Materials. A choice of anything else is no choice. */
  readonly materialIds: readonly string[]
  /**
   * The groups listed under the Disciples (Manual pairing, recut ticket 04), each
   * with why it cannot be chosen, already in words, or null where it can.
   */
  readonly groups: readonly { readonly id: string; readonly greyed: string | null }[]
}

/** Everything the Admin has chosen in the popup. What is drawn and what is posted both follow from it. */
export interface PairSelection {
  /** In the order listed, whatever order they were ticked in. */
  readonly tickedIds: readonly string[]
  /** The segment the Admin picked, or null while the default stands. Forgotten once impossible. */
  readonly picked: PairShape | null
  /**
   * What the Group's gender toggle says, or null where nobody has said and nothing
   * was preset. It is the toggle's while the shape is a Group, and the preset again
   * whenever it is not: a declaration nobody can see is never held.
   */
  readonly declared: GroupDeclaration | null
  /** What the Admin has typed as the Group's name, as typed. Never the placeholder. */
  readonly name: string
  /** The one Material of a 1:2 pair or of a Group. Empty is *No material*, which is the default. */
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
  /**
   * The group chosen for the Discipler to help lead, or null. Never beside a tick:
   * ticking a Disciple clears it, and choosing it clears every tick.
   */
  readonly groupId: string | null
}

export type PairSelectionChange =
  | { readonly type: 'tick'; readonly id: string }
  | { readonly type: 'untick'; readonly id: string }
  | { readonly type: 'clear' }
  | { readonly type: 'choose_group'; readonly id: string }
  | { readonly type: 'pick'; readonly shape: PairShape }
  | { readonly type: 'declare'; readonly declared: GroupDeclaration }
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'material'; readonly materialId: string }
  | { readonly type: 'material_for'; readonly id: string; readonly materialId: string }

type Ticks = Pick<PairSelection, 'tickedIds' | 'picked' | 'declared'>

/** The toggle as the ticks, the pick and the Group's declaration have it, or null while it is hidden. */
export const shapeOf = (context: PairSelectionContext, { tickedIds, picked, declared }: Ticks): ShapeToggle | null =>
  shapeToggle({
    ticked: tickedIds.length,
    picked,
    leadsAGroup: context.leadsAGroup,
    wouldUntick: SHAPES.filter((shape) =>
      context.rows.some((row) => tickedIds.includes(row.id) && row.greyed[readAs(shape, declared)] !== null),
    ),
  })

/** What the ticks make a row be read against: the selected shape, or a one-to-one while there is none. */
const readAgainst = (context: PairSelectionContext, ticks: Ticks): ReadAs =>
  readAs(shapeOf(context, ticks)?.selected ?? null, ticks.declared)

/**
 * Changing the shape, or what a Group declares, re-checks every row: anybody ticked
 * whom it now greys is unticked, and named, rather than dropped silently. Unticking
 * can move the shape again (two ticked falling to one is a one-to-one), so it goes
 * round until nobody else falls out, which it must, since each round only unticks.
 * A pick that has become impossible is forgotten on the way. What a Group would
 * declare is the same all the way round; whether it is kept is `declaredAfter`'s.
 */
const settled = (
  context: PairSelectionContext,
  ticked: readonly string[],
  pickedBefore: PairShape | null,
  declared: GroupDeclaration | null,
): Pick<PairSelection, 'tickedIds' | 'picked' | 'unticked'> => {
  const listed = context.rows.filter(({ id }) => ticked.includes(id))
  const ticks = { tickedIds: listed.map(({ id }) => id), picked: pickedBefore, declared }
  // Forgotten unless it is what is selected: below two ticks nothing is.
  const picked = pickedBefore !== null && shapeOf(context, ticks)?.selected === pickedBefore ? pickedBefore : null

  const greyedNow = listed.flatMap(({ id, greyed }) => {
    const why = greyed[readAgainst(context, ticks)]
    return why === null ? [] : [{ id, why }]
  })
  if (greyedNow.length === 0) return { tickedIds: ticks.tickedIds, picked, unticked: [] }

  const stillTicked = ticks.tickedIds.filter((id) => !greyedNow.some((gone) => gone.id === id))
  const rest = settled(context, stillTicked, picked, declared)
  return { ...rest, unticked: [...greyedNow, ...rest.unticked] }
}

/**
 * What the gender toggle holds after a change: what it said, while the shape is
 * still a Group, and the preset whenever it is not. So the toggle starts from the
 * Discipler every time the shape becomes a Group, and no row is ever opened or
 * greyed by an answer the screen is not showing.
 */
const declaredAfter = (
  context: PairSelectionContext,
  next: Pick<PairSelection, 'tickedIds' | 'picked'>,
  declared: GroupDeclaration | null,
): GroupDeclaration | null =>
  shapeOf(context, { ...next, declared })?.selected === GROUP_SHAPE ? declared : context.presetGender

/**
 * Why a row cannot be ticked now, or null. **A row is offered only where ticking it
 * would leave it ticked**, so it is read against the shape the ticks would make with
 * it among them, by making them and seeing. That is what *while the shape would
 * make a 1:1* means for a row nobody has ticked yet, and it is the only way
 * somebody already in a one-to-one can come to be ticked for a 1:2 pair: the toggle
 * shows at two, and with one ticked the second would make a 1:2.
 *
 * Asked of the re-check itself and not of one shape, because one tick can move the
 * shape more than once: somebody no shape can hold beside who is ticked would untick
 * them and then be unticked alone, and is never offered for that. Ticking a row may
 * still untick somebody else, which the popup says; it never unticks the row ticked.
 * A row already ticked is never greyed, since the re-check would have unticked it.
 */
export const greyedOnRow = (
  context: PairSelectionContext,
  selection: PairSelection,
  row: PairSelectionRow,
): string | null =>
  selection.tickedIds.includes(row.id)
    ? null
    : (settled(context, [...selection.tickedIds, row.id], selection.picked, selection.declared).unticked.find(
        ({ id }) => id === row.id,
      )?.why ?? null)

/** The shapes that hold one Material for everybody in them: one relationship, one dropdown. */
const holdsOneMaterial = (shape: PairShape | null): boolean => shape === 'one_to_two' || shape === GROUP_SHAPE

/**
 * The Materials that survive a change. No shape's choice is carried into another.
 * The one Material of a 1:2 pair or of a Group is kept only while the shape stays
 * what it was, so its dropdown starts at *No material* every time the shape becomes
 * one of the two, from the other included. Each Disciple's own is kept for as long
 * as they are ticked, whatever the shape does meanwhile: unticking one removes
 * theirs and leaves the others' as they were, even where it is the default, and not
 * the Admin, that moves the shape on the way. Only the selected shape's dropdowns
 * are drawn, so only its choices are posted. Below two ticks there is no shape,
 * nothing is asked, and nothing is kept.
 */
const materialsAfter = (
  context: PairSelectionContext,
  before: Ticks | null,
  next: Ticks,
  held: Pick<PairSelection, 'material' | 'materialFor'>,
): Pick<PairSelection, 'material' | 'materialFor'> => {
  const onTheList = (materialId: string | undefined): materialId is string =>
    materialId !== undefined && context.materialIds.includes(materialId)
  const shape = shapeOf(context, next)?.selected ?? null
  const stayedWhatItWas =
    holdsOneMaterial(shape) && (before === null || shapeOf(context, before)?.selected === shape)

  if (shape === null) return { material: '', materialFor: {} }
  return {
    material: stayedWhatItWas && onTheList(held.material) ? held.material : '',
    materialFor: Object.fromEntries(
      next.tickedIds.flatMap((id) => (onTheList(held.materialFor[id]) ? [[id, held.materialFor[id]]] : [])),
    ),
  }
}

/**
 * What a submission that came back refused had chosen, as its address says it and
 * unchecked: the ticks, the shape, what a Group declared and was called, and every
 * Material. Plain arrays, so the Roster's page can hand it to the popup as it is.
 */
export interface RestoredSelection {
  readonly tickedIds: readonly string[]
  /** What it was submitted as, where the address can say: N x 1:1 pairs or a Group. A 1:2 pair is the default's to say. */
  readonly picked: PairShape | null
  /** What a Group declared, or null where it declared nothing or was no Group. */
  readonly declared: GroupDeclaration | null
  /** What a Group was called, as typed. */
  readonly name: string
  readonly material: string | null
  /** Who each Material was chosen for, and which. */
  readonly materialFor: readonly (readonly [string, string])[]
  /** The group chosen, on a join that came back refused. It carries nothing else. */
  readonly groupId: string | null
}

/** A popup nothing came back to: what it opens with from a row. */
export const NOTHING_RESTORED: RestoredSelection = {
  tickedIds: [],
  picked: null,
  declared: null,
  name: '',
  material: null,
  materialFor: [],
  groupId: null,
}

/** Whether a group is listed and not greyed. A greyed round mark cannot be pressed, with or without the markup. */
const canBeChosen = (context: PairSelectionContext, groupId: string | null): groupId is string =>
  context.groups.some(({ id, greyed }) => id === groupId && greyed === null)

/**
 * The selection a popup opens with: nothing, or what a refused submission sends
 * back. A tick that is greyed now is not restored as ticked, and is named like any
 * other; somebody who is not on the list is restored as nobody. A Material that has
 * left the list is not restored, and the rest of the selection is. A group that
 * came back from a refused join is chosen again unless it is greyed now or is no
 * longer listed, and a chosen group is the whole of a selection.
 */
export const selectionFrom = (context: PairSelectionContext, restored: RestoredSelection): PairSelection => {
  if (canBeChosen(context, restored.groupId)) {
    return { ...selectionFrom(context, NOTHING_RESTORED), groupId: restored.groupId }
  }
  // A Group that came back having declared nothing starts from the preset, as any does.
  const declared = restored.picked === GROUP_SHAPE && restored.declared !== null ? restored.declared : context.presetGender
  const ticks = settled(context, restored.tickedIds, restored.picked, declared)
  const next = { ...ticks, declared: declaredAfter(context, ticks, declared) }
  return {
    ...next,
    groupId: null,
    // Only a Group's, as its declaration is: a name that came back beside anything
    // else is not something the Admin typed here.
    name: restored.picked === GROUP_SHAPE ? restored.name : '',
    // A refused submission chose under one shape, and only that shape's come back.
    ...materialsAfter(context, null, next, {
      material: restored.material ?? '',
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
    return { ...selection, ...materialsAfter(context, selection, selection, held) }
  }
  // What a Group is called greys nobody and moves nothing.
  if (change.type === 'name') return { ...selection, name: change.name }
  // One thing at a time: choosing a group clears every tick, and all that went with them.
  if (change.type === 'choose_group') {
    return canBeChosen(context, change.id)
      ? { ...selectionAfter(context, selection, { type: 'clear' }), groupId: change.id }
      : selection
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
  // Only a Group has a gender toggle to change. Saying what it declares is the Admin
  // at work on a Group, so it stays one as a picked segment does: a row the new
  // answer greys is unticked for that reason, and not by the shape moving under it.
  if (change.type === 'declare' && shapeOf(context, selection)?.selected !== GROUP_SHAPE) return selection
  const picked = change.type === 'pick' ? change.shape : change.type === 'declare' ? GROUP_SHAPE : selection.picked
  const declared = change.type === 'declare' ? change.declared : selection.declared

  const ticks = settled(context, ticked, picked, declared)
  const next = { ...ticks, declared: declaredAfter(context, ticks, declared) }
  return {
    ...next,
    // And ticking a Disciple clears a chosen group, as Clear does.
    groupId: change.type === 'tick' || change.type === 'clear' ? null : selection.groupId,
    // Clear takes the popup back to how it opened, a name typed for a Group included.
    name: change.type === 'clear' ? '' : selection.name,
    ...materialsAfter(context, selection, next, selection),
  }
}

/**
 * Whether there is anything to post. A group chosen is asked nothing more. Nothing
 * ticked makes nothing. A Group is asked two things and its button waits for both:
 * a declaration, which a Discipler with no gender on file presets nothing for, so
 * the screen never posts one nobody made; and a name that is more than spaces,
 * which the placeholder never is.
 */
export const canBePosted = (context: PairSelectionContext, selection: PairSelection): boolean =>
  selection.groupId !== null ||
  (selection.tickedIds.length > 0 &&
    (shapeOf(context, selection)?.selected !== GROUP_SHAPE || (selection.declared !== null && selection.name.trim() !== '')))

/** What the pairing route is told: a 1:2 pair and a Group are each one relationship of them all, which is what it has always made. */
export const modeOf = (shape: PairShape): PairingMode => (shape === 'separate' ? 'separate' : 'together')

/**
 * What a Group posts beside what it asks. The route is told `together` for a 1:2
 * pair and for a Group alike, and needs nothing more to form either; this is for
 * the way back. A refusal returns it with what the Group declared and was called,
 * so the popup reopens on the Group and not on the 1:2 pair two ticks default to,
 * and a 1:2 pair's generated name never comes back as something the Admin typed.
 */
export const SHAPE_FIELD = 'shape'
export const postedByAGroup: Readonly<Record<string, string>> = { [SHAPE_FIELD]: GROUP_SHAPE }
export const wasPostedByAGroup = (field: unknown): boolean => field === postedByAGroup[SHAPE_FIELD]

/** The shape a refused submission's address can say it was: N x 1:1 pairs, a Group, or neither. */
export const pickedFrom = ({ mode, shape }: { readonly mode: unknown; readonly shape: unknown }): PairShape | null =>
  readPairingMode(mode) === 'separate' ? 'separate' : wasPostedByAGroup(shape) ? GROUP_SHAPE : null

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
