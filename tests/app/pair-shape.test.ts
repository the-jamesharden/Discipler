import { describe, expect, it } from 'vitest'
import {
  canBePosted,
  greyedOnRow,
  modeOf,
  NOTHING_RESTORED,
  pickedFrom,
  postedByAGroup,
  postedByAOneToTwo,
  selectionAfter,
  selectionFrom,
  shapeOf,
  shapeToggle,
  type PairSelection,
  type PairSelectionContext,
  type PairShape,
} from '../../app/roster/pair-shape'
import type { GroupDeclaration } from '../../app/roster/declared-gender'

/**
 * Manual pairing, recut tickets 02 and 04. What two or more ticks become in the
 * Pair popup from a Discipler: the shape toggle, who is unticked when the shape
 * changes, the Materials each shape holds, and what a Group declares and is called.
 * All of it is pure, because the repository has no harness for client script, so
 * the popup's behaviour is driven here and the component only draws it.
 */

describe('the shape toggle', () => {
  const toggle = (
    ticked: number,
    picked: PairShape | null = null,
    leadsAGroup = false,
    wouldUntick: readonly PairShape[] = [],
  ) => shapeToggle({ ticked, picked, leadsAGroup, wouldUntick })

  it('is hidden while zero or one Disciple is ticked', () => {
    expect(toggle(0)).toBeNull()
    expect(toggle(1)).toBeNull()
    expect(toggle(1, 'separate')).toBeNull()
  })

  it('offers 1:2 pair, N x 1:1 pairs and Group at two, in that order, defaulting to 1:2 pair', () => {
    expect(toggle(2)).toEqual({
      segments: [
        { shape: 'one_to_two', ruledOut: null },
        { shape: 'separate', ruledOut: null },
        { shape: 'group', ruledOut: null },
      ],
      selected: 'one_to_two',
    })
  })

  it('strikes 1:2 pair out at three or more, and the default moves to Group', () => {
    for (const ticked of [3, 4, 9]) {
      expect(toggle(ticked), String(ticked)).toEqual({
        segments: [
          { shape: 'one_to_two', ruledOut: 'needs_exactly_two' },
          { shape: 'separate', ruledOut: null },
          { shape: 'group', ruledOut: null },
        ],
        selected: 'group',
      })
    }
  })

  it('keeps what the Admin picked for as long as it is possible: one sticky pick, Group included', () => {
    expect(toggle(2, 'separate')?.selected).toBe('separate')
    expect(toggle(5, 'separate')?.selected).toBe('separate')
    expect(toggle(2, 'one_to_two')?.selected).toBe('one_to_two')
    expect(toggle(2, 'group')?.selected).toBe('group')
    expect(toggle(7, 'group')?.selected).toBe('group')
    // Impossible at three, so the pick gives way to the default.
    expect(toggle(3, 'one_to_two')?.selected).toBe('group')
  })

  it('defaults past a shape that would untick somebody who is ticked, and still lets the Admin pick it', () => {
    // What is possible is part of what the default follows: these two cannot be a
    // 1:2 pair or a Group as it is declared, so untouched they are 2 x 1:1. Picking
    // either is the Admin's to do.
    expect(toggle(2, null, false, ['one_to_two', 'group'])?.selected).toBe('separate')
    expect(toggle(2, 'one_to_two', false, ['one_to_two', 'group'])?.selected).toBe('one_to_two')
    expect(toggle(2, 'group', false, ['one_to_two', 'group'])?.selected).toBe('group')
    // Two a Coed Group can hold and a 1:2 pair cannot stay a Group at two.
    expect(toggle(2, null, false, ['one_to_two'])?.selected).toBe('group')
    // Three a Group would untick one of are 3 x 1:1.
    expect(toggle(3, null, false, ['group'])?.selected).toBe('separate')
    // Where every shape would untick somebody, the default is the first as ever.
    expect(toggle(2, null, false, ['one_to_two', 'separate', 'group'])?.selected).toBe('one_to_two')
  })

  it('greys 1:2 pair and Group for a Discipler who already leads a group, and the default moves to N x 1:1', () => {
    expect(toggle(2, null, true)).toEqual({
      segments: [
        { shape: 'one_to_two', ruledOut: 'already_leads_a_group' },
        { shape: 'separate', ruledOut: null },
        { shape: 'group', ruledOut: 'already_leads_a_group' },
      ],
      selected: 'separate',
    })
    expect(toggle(2, 'one_to_two', true)?.selected).toBe('separate')
    expect(toggle(4, 'group', true)?.selected).toBe('separate')
    // Nothing about the ticks would open it, so that is the reason given at any count.
    expect(toggle(3, null, true)?.segments[0]?.ruledOut).toBe('already_leads_a_group')
  })
})

/**
 * Five Disciples under a woman Discipler in a Ministry that enforces the match:
 * three open rows, one already in a one-to-one, and one of another gender.
 */
const MENS_GROUP = 'Men’s group: choose Coed to include'
const WOMENS_GROUP = 'Women’s group: choose Coed to include'
/** A woman nothing else is true of: open for everything but a men's group. */
const OPEN = { a_one_to_one: null, a_one_to_two: null, a_womens_group: null, a_mens_group: MENS_GROUP, a_coed_group: null }
const IN_A_ONE_TO_ONE = { ...OPEN, a_one_to_one: 'Already in a 1:1 with David Chen' }
const A_MAN = {
  a_one_to_one: 'Women’s only: a 1:1 is same-gender',
  a_one_to_two: 'Women’s only: a 1:2 is same-gender',
  a_womens_group: WOMENS_GROUP,
  a_mens_group: null,
  a_coed_group: null,
}
/**
 * The readings gender rules each of them out of, under which the row is not shown
 * at all. *Already in a 1:1* is never one: that row is greyed, and says why.
 */
type Readings = PairSelectionContext['rows'][number]['greyed']
const woman = (id: string, greyed: Readings = OPEN) => ({ id, greyed, leftOut: ['a_mens_group'] as const })
const man = (id: string, greyed: Readings = A_MAN) => ({
  id,
  greyed,
  leftOut: (['a_one_to_one', 'a_one_to_two', 'a_womens_group'] as const).filter((readAs) => greyed[readAs] !== null),
})
const context: PairSelectionContext = {
  rows: [
    woman('sam'),
    woman('ana'),
    woman('rosa'),
    woman('brianna', IN_A_ONE_TO_ONE),
    man('tom'),
  ],
  leadsAGroup: false,
  presetGender: 'female',
  materialIds: ['mark', 'romans'],
  groups: [
    { id: 'graces-group', greyed: null },
    { id: 'thursday-table', greyed: null },
  ],
}

/**
 * A Ministry that does not enforce the match: a man can be in a one-to-one with a
 * woman Discipler, and cannot be in her 1:2 pair, which declares her gender whatever
 * the Ministry's setting says of a one-to-one, nor in her Group until it is Coed.
 */
const relaxed: PairSelectionContext = {
  ...context,
  rows: [
    woman('sam'),
    woman('ana'),
    man('tom', { ...A_MAN, a_one_to_one: null }),
  ],
}

const nothing = selectionFrom(context, NOTHING_RESTORED)

const after = (selection: PairSelection, ...changes: Parameters<typeof selectionAfter>[2][]): PairSelection =>
  changes.reduce((each, change) => selectionAfter(context, each, change), selection)

const tick = (id: string) => ({ type: 'tick', id }) as const
const untick = (id: string) => ({ type: 'untick', id }) as const
const pick = (shape: PairShape) => ({ type: 'pick', shape }) as const
const declare = (declared: GroupDeclaration) => ({ type: 'declare', declared }) as const
const named = (name: string) => ({ type: 'name', name }) as const

describe('what is ticked, and what the ticks would make', () => {
  it('starts with nothing ticked, no shape, and no Material', () => {
    expect(nothing).toEqual({
      tickedIds: [],
      picked: null,
      declared: 'female',
      name: '',
      material: '',
      materialFor: {},
      unticked: [],
      groupId: null,
    })
    expect(shapeOf(context, nothing)).toBeNull()
  })

  it('reads a row against the shape the ticks would make with it ticked', () => {
    const row = (id: string) => context.rows.find((each) => each.id === id)!

    // Nothing ticked: ticking anybody would make a one-to-one.
    expect(greyedOnRow(context, nothing, row('brianna'))?.why).toBe('Already in a 1:1 with David Chen')
    expect(greyedOnRow(context, nothing, row('tom'))?.why).toBe('Women’s only: a 1:1 is same-gender')

    // One ticked: ticking a second would make a 1:2 pair, which somebody already
    // in a one-to-one can be in. That is how they come to be ticked for one at all.
    const one = after(nothing, tick('sam'))
    expect(greyedOnRow(context, one, row('brianna'))).toBeNull()
    expect(greyedOnRow(context, one, row('tom'))?.why).toBe('Women’s only: a 1:2 is same-gender')
    // The row already ticked is read against what is ticked now, a one-to-one.
    expect(greyedOnRow(context, one, row('sam'))).toBeNull()

    // Two ticked as a 1:2: a third would make them a Group, which she can be in
    // too, and which is a women's group until somebody says otherwise.
    const two = after(one, tick('ana'))
    expect(greyedOnRow(context, two, row('brianna'))).toBeNull()
    expect(greyedOnRow(context, two, row('rosa'))).toBeNull()
    expect(greyedOnRow(context, two, row('tom'))?.why).toBe(WOMENS_GROUP)

    // Two ticked as 2 x 1:1: a third would make 3 x 1:1, which she cannot be one of.
    expect(greyedOnRow(context, after(two, pick('separate')), row('brianna'))?.why).toBe('Already in a 1:1 with David Chen')
  })

  it('reads a second row against N x 1:1 where the Discipler already leads a group', () => {
    const leading = { ...context, leadsAGroup: true }
    const one = selectionAfter(leading, nothing, tick('sam'))

    expect(greyedOnRow(leading, one, leading.rows[3]!)?.why).toBe('Already in a 1:1 with David Chen')
  })

  it('never ticks a row that is greyed for what ticking it would make', () => {
    expect(after(nothing, tick('brianna'))).toEqual(nothing)
    expect(after(nothing, tick('sam'), tick('tom')).tickedIds).toEqual(['sam'])
    expect(after(nothing, tick('nobody-listed')).tickedIds).toEqual([])
  })

  it('ticks and unticks, and Clear unticks everything', () => {
    const three = after(nothing, tick('sam'), tick('ana'), tick('rosa'))
    expect(three.tickedIds).toEqual(['sam', 'ana', 'rosa'])
    expect(after(three, untick('ana')).tickedIds).toEqual(['sam', 'rosa'])
    expect(after(three, tick('ana')).tickedIds).toEqual(['sam', 'ana', 'rosa'])
    expect(after(three, { type: 'clear' })).toEqual(nothing)
  })

  it('keeps the segment the Admin picked until it becomes impossible, and then forgets it', () => {
    const separately = after(nothing, tick('sam'), tick('ana'), pick('separate'))
    expect(shapeOf(context, separately)?.selected).toBe('separate')
    expect(shapeOf(context, after(separately, tick('rosa'), untick('rosa')))?.selected).toBe('separate')

    // Below two there is no shape to have picked; ticking a second again starts from the default.
    const again = after(separately, untick('ana'), tick('ana'))
    expect(again.picked).toBeNull()
    expect(shapeOf(context, again)?.selected).toBe('one_to_two')

    // 1:2 picked, then a third ticked: impossible, so forgotten, and three are the default's Group.
    const pickedOneToTwo = after(separately, pick('one_to_two'), tick('rosa'))
    expect(pickedOneToTwo.picked).toBeNull()
    expect(shapeOf(context, pickedOneToTwo)?.selected).toBe('group')

    // Group is a segment of the same toggle, and as sticky as the others.
    const group = after(nothing, tick('sam'), tick('ana'), pick('group'))
    expect(shapeOf(context, group)?.selected).toBe('group')
    expect(shapeOf(context, after(group, tick('rosa'), untick('rosa')))?.selected).toBe('group')
    expect(after(group, untick('ana'), tick('ana')).picked).toBeNull()
  })

  it('cannot pick a segment that is ruled out', () => {
    const three = after(nothing, tick('sam'), tick('ana'), tick('rosa'))
    expect(after(three, pick('one_to_two'))).toEqual(three)
  })
})

describe('re-checking every row when the shape changes', () => {
  // The case that proves it: already in a one-to-one, ticked under 1:2, then moved to N x 1:1.
  const underOneToTwo = after(nothing, tick('sam'), tick('brianna'))

  it('lets somebody already in a one-to-one be ticked for a 1:2 pair', () => {
    expect(underOneToTwo.tickedIds).toEqual(['sam', 'brianna'])
    expect(underOneToTwo.unticked).toEqual([])
    expect(shapeOf(context, underOneToTwo)?.selected).toBe('one_to_two')
  })

  it('unticks whoever the new shape greys, says who, and hides the toggle below two', () => {
    const moved = after(underOneToTwo, pick('separate'))

    expect(moved.tickedIds).toEqual(['sam'])
    expect(moved.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
    // The count fell below two, so the toggle hides and the one-tick sentence returns.
    expect(shapeOf(context, moved)).toBeNull()
    expect(moved.picked).toBeNull()
    // Her row is open again, since a second tick would make a 1:2 pair, which is
    // why the reason travels with who was unticked and is not left to the row.
    expect(greyedOnRow(context, moved, context.rows[3]!)).toBeNull()
  })

  it('keeps her when a third tick makes them a Group, and unticks her when the Admin makes it 3 x 1:1', () => {
    const third = after(underOneToTwo, tick('ana'))
    expect(shapeOf(context, third)?.selected).toBe('group')
    expect(third.tickedIds).toEqual(['sam', 'ana', 'brianna'])
    expect(third.unticked).toEqual([])

    const apart = after(third, pick('separate'))
    expect(apart.tickedIds).toEqual(['sam', 'ana'])
    expect(apart.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
    expect(shapeOf(context, apart)?.selected).toBe('separate')
  })

  it('re-checks when unticking moves the shape', () => {
    const left = after(underOneToTwo, untick('sam'))

    // One tick is a one-to-one, which Brianna cannot be given a second of.
    expect(left.tickedIds).toEqual([])
    expect(left.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
  })

  it('says who only until the Admin does something else', () => {
    const moved = after(underOneToTwo, pick('separate'))
    expect(after(moved, tick('ana')).unticked).toEqual([])
  })
})

describe('two who can be N x 1:1 pairs and cannot be a 1:2 pair', () => {
  const from = (...changes: Parameters<typeof selectionAfter>[2][]) =>
    changes.reduce((each, change) => selectionAfter(relaxed, each, change), nothing)
  const tom = relaxed.rows[2]!

  it('can be ticked in either order, and untouched they are 2 x 1:1', () => {
    for (const order of [['sam', 'tom'], ['tom', 'sam']]) {
      const two = from(...order.map(tick))
      expect(two.tickedIds, order.join()).toEqual(['sam', 'tom'])
      expect(two.unticked, order.join()).toEqual([])
      expect(shapeOf(relaxed, two)?.selected, order.join()).toBe('separate')
    }
    expect(greyedOnRow(relaxed, from(tick('sam')), tom)).toBeNull()
  })

  it('still defaults to a 1:2 pair for two who can be one, with him open beside them', () => {
    const two = from(tick('sam'), tick('ana'))
    expect(shapeOf(relaxed, two)?.selected).toBe('one_to_two')
    // A third tick would make a women's Group, which would untick him, so the
    // default passes over it to 3 x 1:1, which he can be one of.
    expect(greyedOnRow(relaxed, two, tom)).toBeNull()
    const three = from(tick('sam'), tick('ana'), tick('tom'))
    expect(three.tickedIds).toEqual(['sam', 'ana', 'tom'])
    expect(shapeOf(relaxed, three)?.selected).toBe('separate')
  })

  it('never offers a row whose tick would not stay: somebody no shape can hold beside who is ticked', () => {
    // She is already in a one-to-one, so she can only be in a 1:2 pair, and he can
    // only be one of N x 1:1. No shape holds the two of them. Offered and ticked,
    // she would untick him under the 1:2 and then herself as a lone one-to-one.
    const withHer: PairSelectionContext = {
      ...relaxed,
      rows: [...relaxed.rows, woman('brianna', IN_A_ONE_TO_ONE)],
    }
    const her = withHer.rows[3]!
    const him = selectionAfter(withHer, nothing, tick('tom'))

    expect(greyedOnRow(withHer, him, her)?.why).toBe('Already in a 1:1 with David Chen')
    expect(selectionAfter(withHer, him, tick('brianna'))).toEqual(him)
    // Beside somebody she can be in a 1:2 pair with, she is offered as ever.
    expect(greyedOnRow(withHer, selectionAfter(withHer, nothing, tick('sam')), her)).toBeNull()
  })

  it('unticks him, and says so, where the Admin picks 1:2 pair all the same', () => {
    const picked = from(tick('sam'), tick('tom'), pick('one_to_two'))
    expect(picked.tickedIds).toEqual(['sam'])
    expect(picked.unticked).toEqual([{ id: 'tom', why: 'Women’s only: a 1:2 is same-gender' }])
  })
})

describe('the Materials each shape holds', () => {
  const material = (materialId: string) => ({ type: 'material', materialId }) as const
  const materialFor = (id: string, materialId: string) => ({ type: 'material_for', id, materialId }) as const

  const two = after(nothing, tick('sam'), tick('ana'))
  const separately = after(two, pick('separate'))

  it('holds one for a 1:2 pair, from the Ministry’s live list only', () => {
    expect(after(two, material('mark')).material).toBe('mark')
    expect(after(two, material('mark'), material('')).material).toBe('')
    expect(after(two, material('removed-since')).material).toBe('')
  })

  it('holds one per ticked Disciple for N x 1:1 pairs, each at No material until chosen', () => {
    const chosen = after(separately, materialFor('sam', 'mark'))
    expect(chosen.materialFor).toEqual({ sam: 'mark' })

    // Ticking another adds theirs at No material and leaves the others' as they were.
    const third = after(chosen, tick('rosa'))
    expect(third.materialFor).toEqual({ sam: 'mark' })

    // Unticking one removes theirs, so ticking them again starts at No material.
    const without = after(after(third, materialFor('rosa', 'romans')), untick('sam'))
    expect(without.materialFor).toEqual({ rosa: 'romans' })
    expect(after(without, tick('sam')).materialFor).toEqual({ rosa: 'romans' })
  })

  it('takes no choice for somebody who is not ticked, or that is not on the list', () => {
    expect(after(separately, materialFor('rosa', 'mark')).materialFor).toEqual({})
    expect(after(separately, materialFor('sam', 'removed-since')).materialFor).toEqual({})
  })

  it('carries no choice from one shape into the other: a 1:2 pair’s dropdown always starts at No material', () => {
    const chosen = after(separately, materialFor('sam', 'mark'), materialFor('ana', 'romans'))
    // Moving from N x 1:1 to 1:2 starts the 1:2's dropdown at No material.
    const together = after(chosen, pick('one_to_two'))
    expect(together.material).toBe('')

    // And it does every time, a round trip through N x 1:1 included.
    const roundTrip = after(together, material('mark'), pick('separate'), pick('one_to_two'))
    expect(roundTrip.material).toBe('')

    // What was chosen for the 1:2 is never any Disciple's, and theirs are as they were.
    expect(after(together, material('mark'), pick('separate')).materialFor).toEqual({ sam: 'mark', ana: 'romans' })
  })

  it('leaves the others’ choices as they were when the default, and not the Admin, moves the shape', () => {
    // Three a Group would untick one of are 3 x 1:1 untouched.
    const among = (selection: PairSelection, ...changes: Parameters<typeof selectionAfter>[2][]) =>
      changes.reduce((each, change) => selectionAfter(relaxed, each, change), selection)
    const three = among(nothing, tick('sam'), tick('ana'), tick('tom'))
    expect(shapeOf(relaxed, three)?.selected).toBe('separate')
    const chosen = among(three, materialFor('sam', 'mark'), materialFor('ana', 'romans'), materialFor('tom', 'mark'))

    // Untouched, the two left are a 1:2 pair: Tom's choice goes with his tick, and
    // Sam's and Ana's are still theirs when the Admin asks for 2 x 1:1.
    const two = among(chosen, untick('tom'))
    expect(shapeOf(relaxed, two)?.selected).toBe('one_to_two')
    expect(among(two, pick('separate')).materialFor).toEqual({ sam: 'mark', ana: 'romans' })
  })

  it('keeps a choice through a change that leaves the shape as it was', () => {
    // A tick that is refused, and a fourth in a Group: the shape before and after is the same.
    const kept = after(two, material('mark'), tick('tom'))
    expect(shapeOf(context, kept)?.selected).toBe('one_to_two')
    expect(kept.material).toBe('mark')

    const group = after(nothing, tick('sam'), tick('ana'), tick('rosa'), material('romans'), tick('brianna'))
    expect(shapeOf(context, group)?.selected).toBe('group')
    expect(group.material).toBe('romans')
  })

  it('holds one for a Group, the same dropdown, and starts it at No material each time the shape becomes one', () => {
    // From a 1:2 pair to a Group, by the Admin's pick or by a third tick.
    expect(after(two, material('mark'), pick('group')).material).toBe('')
    expect(after(two, material('mark'), tick('rosa')).material).toBe('')
    // And back again.
    const group = after(two, pick('group'), material('romans'))
    expect(group.material).toBe('romans')
    expect(after(group, pick('one_to_two')).material).toBe('')
    // Changing what it declares or what it is called leaves it a Group, and its Material alone.
    expect(after(group, declare('mixed'), named('Thursday Table')).material).toBe('romans')
  })

  it('holds none below two ticks: a one-to-one from a single tick asks nothing', () => {
    expect(after(two, material('mark'), untick('ana')).material).toBe('')
  })
})

describe('what a Group declares (Manual pairing, recut ticket 04, D1)', () => {
  const row = (id: string) => context.rows.find((each) => each.id === id)!
  const three = after(nothing, tick('sam'), tick('ana'), tick('rosa'))

  it('is preset from the Discipler, and other-gender rows are greyed until Coed is chosen', () => {
    expect(shapeOf(context, three)?.selected).toBe('group')
    expect(three.declared).toBe('female')
    expect(greyedOnRow(context, three, row('tom'))?.why).toBe(WOMENS_GROUP)

    const coed = after(three, declare('mixed'))
    expect(coed.declared).toBe('mixed')
    expect(greyedOnRow(context, coed, row('tom'))).toBeNull()
    expect(after(coed, tick('tom')).tickedIds).toEqual(['sam', 'ana', 'rosa', 'tom'])
  })

  it('re-checks every row when it changes: whoever it greys is unticked, and said', () => {
    const mixed = after(three, declare('mixed'), tick('tom'))
    const womens = after(mixed, declare('female'))

    expect(womens.tickedIds).toEqual(['sam', 'ana', 'rosa'])
    expect(womens.unticked).toEqual([{ id: 'tom', why: WOMENS_GROUP }])
    // And the other way: a men's group unticks the three women. That leaves him
    // alone, which is a one-to-one with a woman, so it goes round once more.
    const mens = after(mixed, declare('male'))
    expect(mens.tickedIds).toEqual([])
    expect(mens.unticked.map(({ id, why }) => [id, why])).toEqual([
      ['sam', MENS_GROUP],
      ['ana', MENS_GROUP],
      ['rosa', MENS_GROUP],
      ['tom', 'Women’s only: a 1:1 is same-gender'],
    ])
  })

  it('stays a Group when the answer changes, where the default alone would have moved the shape', () => {
    // A woman and a man as a Coed Group of two. Untouched, a women's group would
    // send the default looking for another shape; the Admin is at work on a Group.
    const two = after(nothing, tick('sam'), tick('ana'), pick('group'), declare('mixed'), tick('tom'), untick('ana'))
    expect(two.tickedIds).toEqual(['sam', 'tom'])
    expect(shapeOf(context, two)?.selected).toBe('group')

    const womens = after(two, declare('female'))
    expect(womens.unticked).toEqual([{ id: 'tom', why: WOMENS_GROUP }])
  })

  it('keeps two a Coed Group holds a Group when a tick goes, without the Admin having picked it', () => {
    // Three by default a Group, made Coed, with a man: down to a woman and a man, a
    // 1:2 pair would untick him and the Group would not, so it is still a Group.
    const coed = after(three, declare('mixed'), tick('tom'), untick('ana'), untick('rosa'))
    expect(coed.tickedIds).toEqual(['sam', 'tom'])
    expect(shapeOf(context, coed)?.selected).toBe('group')
    expect(coed.declared).toBe('mixed')
  })

  it('is the preset again whenever the shape is not a Group: no answer is held that the screen does not show', () => {
    const coed = after(three, declare('mixed'))
    expect(after(coed, pick('separate')).declared).toBe('female')
    expect(after(coed, pick('separate'), pick('group')).declared).toBe('female')
    expect(after(coed, untick('ana'), untick('rosa')).declared).toBe('female')
    expect(after(coed, { type: 'clear' })).toEqual(nothing)
    // There is no toggle to change while the shape is anything else.
    const pair = after(nothing, tick('sam'), tick('ana'))
    expect(after(pair, declare('mixed'))).toEqual(pair)
  })

  it('never greys somebody with no gender on file, under any of the three', () => {
    const noGender = { a_one_to_one: null, a_one_to_two: null, a_womens_group: null, a_mens_group: null, a_coed_group: null }
    const withThem: PairSelectionContext = { ...context, rows: [...context.rows, { id: 'jo', greyed: noGender, leftOut: [] }] }
    const group = [tick('sam'), tick('ana'), tick('jo')].reduce(
      (each, change) => selectionAfter(withThem, each, change),
      selectionFrom(withThem, NOTHING_RESTORED),
    )
    for (const declared of ['female', 'male', 'mixed'] as const) {
      const said = selectionAfter(withThem, group, declare(declared))
      expect(said.tickedIds, declared).toContain('jo')
    }
  })

  it('lets somebody already in a one-to-one be ticked for a Group, as the first tick never and the third always', () => {
    expect(greyedOnRow(context, three, row('brianna'))).toBeNull()
    expect(after(three, tick('brianna')).tickedIds).toEqual(['sam', 'ana', 'rosa', 'brianna'])
  })

  it('presets nothing for a Discipler with no gender on file, greys nobody, and waits to be told', () => {
    const noPreset: PairSelectionContext = { ...context, presetGender: null }
    const among = (...changes: Parameters<typeof selectionAfter>[2][]) =>
      changes.reduce((each, change) => selectionAfter(noPreset, each, change), selectionFrom(noPreset, NOTHING_RESTORED))

    const group = among(tick('sam'), tick('ana'), tick('rosa'), named('Thursday Table'))
    expect(shapeOf(noPreset, group)?.selected).toBe('group')
    expect(group.declared).toBeNull()
    expect(canBePosted(noPreset, group)).toBe(false)
    // Nothing is declared, so nothing rules him out yet.
    expect(greyedOnRow(noPreset, group, row('tom'))).toBeNull()

    expect(canBePosted(noPreset, selectionAfter(noPreset, group, declare('female')))).toBe(true)
  })
})

describe('one thing at a time: a group to help lead, or Disciples to pair (Manual pairing, recut ticket 04)', () => {
  const choose = (id: string) => ({ type: 'choose_group', id }) as const

  it('chooses one group, and another in its place', () => {
    const chosen = after(nothing, choose('graces-group'))
    expect(chosen.groupId).toBe('graces-group')
    expect(after(chosen, choose('thursday-table')).groupId).toBe('thursday-table')
    expect(canBePosted(context, chosen)).toBe(true)
  })

  it('clears every tick, and all that went with them, when a group is chosen', () => {
    const group = after(nothing, tick('sam'), tick('ana'), tick('rosa'), declare('mixed'), named('Thursday Table'), { type: 'material', materialId: 'mark' })
    const chosen = after(group, choose('graces-group'))

    expect(chosen).toEqual({ ...nothing, groupId: 'graces-group' })
    // So the shape toggle, the gender toggle, the name and every dropdown are hidden.
    expect(shapeOf(context, chosen)).toBeNull()
  })

  it('clears a chosen group when a Disciple is ticked, and leaves it where the tick is refused', () => {
    const chosen = after(nothing, choose('graces-group'))
    expect(after(chosen, tick('sam'))).toEqual(after(nothing, tick('sam')))
    // A greyed box cannot be ticked, so nothing has been chosen in its place.
    expect(after(chosen, tick('brianna'))).toEqual(chosen)
  })

  it('clears a chosen group with Clear, as it clears the ticks', () => {
    expect(after(nothing, choose('graces-group'), { type: 'clear' })).toEqual(nothing)
  })

  it('never chooses a group that is greyed, or that is not listed', () => {
    const leading: PairSelectionContext = {
      ...context,
      leadsAGroup: true,
      groups: context.groups.map((each) => ({ ...each, greyed: 'Claire already leads a group' })),
    }
    const opened = selectionFrom(leading, NOTHING_RESTORED)
    expect(selectionAfter(leading, opened, choose('graces-group'))).toEqual(opened)
    expect(after(nothing, choose('no-such-group'))).toEqual(nothing)
    // And the ticks somebody had are left alone by a press that chose nothing.
    const ticked = selectionAfter(leading, opened, tick('sam'))
    expect(selectionAfter(leading, ticked, choose('graces-group'))).toEqual(ticked)
  })

  it('restores the group a refused join chose, and nothing beside it', () => {
    const restored = selectionFrom(context, { ...NOTHING_RESTORED, tickedIds: ['sam'], groupId: 'thursday-table' })
    expect(restored).toEqual({ ...nothing, groupId: 'thursday-table' })

    // One that is greyed now, or gone from the list, is not restored as chosen.
    const gone = selectionFrom(context, { ...NOTHING_RESTORED, groupId: 'ended-since' })
    expect(gone).toEqual(nothing)
  })
})

describe('who is not shown at all (James, 2026-09-21)', () => {
  const row = (id: string) => context.rows.find((each) => each.id === id)!

  it('leaves a row off the list where gender is why it cannot be ticked, and greys it for any other reason', () => {
    // Nothing ticked is a one-to-one: he is not shown, and she is shown greyed.
    expect(greyedOnRow(context, nothing, row('tom'))).toEqual({ why: 'Women’s only: a 1:1 is same-gender', leftOut: true })
    expect(greyedOnRow(context, nothing, row('brianna'))).toEqual({
      why: 'Already in a 1:1 with David Chen',
      leftOut: false,
    })
  })

  it('shows him once the Group is Coed, and leaves him off again when it is not', () => {
    const three = after(nothing, tick('sam'), tick('ana'), tick('rosa'))
    expect(greyedOnRow(context, three, row('tom'))).toEqual({ why: WOMENS_GROUP, leftOut: true })

    const coed = after(three, declare('mixed'))
    expect(greyedOnRow(context, coed, row('tom'))).toBeNull()

    // Ticked and then ruled out again, he is unticked and named, and his row goes.
    const womens = after(coed, tick('tom'), declare('female'))
    expect(womens.unticked).toEqual([{ id: 'tom', why: WOMENS_GROUP }])
    expect(greyedOnRow(context, womens, row('tom'))?.leftOut).toBe(true)
  })

  it('never leaves out somebody it is not gender that stops', () => {
    // Beside two ticked as 2 x 1:1, she is greyed for her one-to-one and still shown.
    const apart = after(nothing, tick('sam'), tick('ana'), pick('separate'))
    expect(greyedOnRow(context, apart, row('brianna'))?.leftOut).toBe(false)
  })

  it('keeps who was unticked as the words alone, which is what the popup’s line says', () => {
    const moved = after(nothing, tick('sam'), tick('brianna'), pick('separate'))
    expect(moved.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
  })
})

describe('whether there is anything to post', () => {
  it('is nothing with nothing ticked, and a one-to-one, a 1:2 pair and N x 1:1 pairs as they stand', () => {
    expect(canBePosted(context, nothing)).toBe(false)
    expect(canBePosted(context, after(nothing, tick('sam')))).toBe(true)
    expect(canBePosted(context, after(nothing, tick('sam'), tick('ana')))).toBe(true)
    expect(canBePosted(context, after(nothing, tick('sam'), tick('ana'), pick('separate')))).toBe(true)
  })

  it('waits for a Group’s name, which spaces are not and the placeholder never is', () => {
    const group = after(nothing, tick('sam'), tick('ana'), tick('rosa'))
    expect(group.name).toBe('')
    expect(canBePosted(context, group)).toBe(false)
    expect(canBePosted(context, after(group, named('   ')))).toBe(false)
    expect(canBePosted(context, after(group, named('Claire’s Group')))).toBe(true)
    // Held as typed: what counts as a name is the boundary's.
    expect(after(group, named(' Thursday Table ')).name).toBe(' Thursday Table ')
  })

  it('keeps the name through ticks and shapes, where it is asked again, and Clear forgets it', () => {
    const group = after(nothing, tick('sam'), tick('ana'), tick('rosa'), named('Thursday Table'))
    expect(after(group, pick('separate'), pick('group')).name).toBe('Thursday Table')
    // A name nobody is asked for holds nothing back.
    expect(canBePosted(context, after(group, named(''), pick('separate')))).toBe(true)
    expect(after(group, { type: 'clear' })).toEqual(nothing)
  })
})

describe('what comes back from a refusal', () => {
  it('restores the ticks, the shape and every Material choice', () => {
    const restored = selectionFrom(context, {
      ...NOTHING_RESTORED,
      tickedIds: ['sam', 'ana'],
      picked: 'separate',
      material: 'mark',
      materialFor: [['sam', 'mark'], ['ana', 'romans'], ['rosa', 'romans']],
    })

    expect(restored).toEqual({
      tickedIds: ['sam', 'ana'],
      picked: 'separate',
      declared: 'female',
      name: '',
      // The one Material is the other shape's, and Rosa is not ticked.
      material: '',
      materialFor: { sam: 'mark', ana: 'romans' },
      unticked: [],
      groupId: null,
    })
  })

  it('restores a 1:2 pair with its one Material', () => {
    const restored = selectionFrom(context, {
      ...NOTHING_RESTORED,
      tickedIds: ['sam', 'ana'],
      material: 'romans',
      materialFor: [['sam', 'mark']],
    })

    expect(shapeOf(context, restored)?.selected).toBe('one_to_two')
    expect(restored).toMatchObject({ picked: null, material: 'romans', materialFor: {} })
  })

  it('restores a Group with its ticks, what it declared, what it was called and its Material', () => {
    const restored = selectionFrom(context, {
      ...NOTHING_RESTORED,
      tickedIds: ['sam', 'tom'],
      picked: 'group',
      declared: 'mixed',
      name: 'Thursday Table',
      material: 'mark',
    })

    // Two ticked, and still the Group it was, not the 1:2 pair two default to.
    expect(shapeOf(context, restored)?.selected).toBe('group')
    expect(restored).toEqual({
      tickedIds: ['sam', 'tom'],
      picked: 'group',
      declared: 'mixed',
      name: 'Thursday Table',
      material: 'mark',
      materialFor: {},
      unticked: [],
      groupId: null,
    })
  })

  it('restores a Group that declared nothing from the preset, and a declaration that is no Group’s not at all', () => {
    const undeclared = selectionFrom(context, { ...NOTHING_RESTORED, tickedIds: ['sam', 'ana'], picked: 'group' })
    expect(undeclared.declared).toBe('female')

    // Nor a name: a 1:2 pair's is generated, and is never something the Admin typed.
    const notAGroup = selectionFrom(context, {
      ...NOTHING_RESTORED,
      tickedIds: ['sam', 'ana'],
      declared: 'mixed',
      name: 'Claire with Sam & Ana',
    })
    expect(shapeOf(context, notAGroup)?.selected).toBe('one_to_two')
    expect(notAGroup.declared).toBe('female')
    expect(notAGroup.name).toBe('')
  })

  it('does not restore a Material that has left the list, and keeps the rest', () => {
    const restored = selectionFrom(context, {
      ...NOTHING_RESTORED,
      tickedIds: ['sam', 'ana'],
      picked: 'separate',
      materialFor: [['sam', 'mark'], ['ana', 'removed-since']],
    })

    expect(restored.tickedIds).toEqual(['sam', 'ana'])
    expect(restored.materialFor).toEqual({ sam: 'mark' })
  })

  it('does not restore a tick that is greyed now, and says who; somebody not listed is nobody', () => {
    const restored = selectionFrom(context, {
      ...NOTHING_RESTORED,
      tickedIds: ['sam', 'brianna', 'stranger'],
      picked: 'separate',
    })

    expect(restored.tickedIds).toEqual(['sam'])
    expect(restored.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
  })

  it('restores in the list’s order, whatever order the address said them in', () => {
    const restored = selectionFrom(context, { ...NOTHING_RESTORED, tickedIds: ['ana', 'sam'] })
    expect(restored.tickedIds).toEqual(['sam', 'ana'])
  })
})

describe('what each shape posts to the pairing route', () => {
  it('posts a 1:2 pair and a Group as one relationship of them all, and N x 1:1 pairs as separate', () => {
    expect(modeOf('one_to_two')).toBe('together')
    expect(modeOf('group')).toBe('together')
    expect(modeOf('separate')).toBe('separate')
  })

  it('posts that it is a Group, so a refusal can come back as one, and reads the shape an address says', () => {
    expect(postedByAGroup).toEqual({ shape: 'group' })
    expect(pickedFrom({ mode: 'together', shape: 'group' })).toBe('group')
    expect(pickedFrom({ mode: 'separate', shape: undefined })).toBe('separate')
    // A 1:2 pair says nothing of itself, and neither does anything somebody typed.
    expect(pickedFrom({ mode: 'together', shape: undefined })).toBeNull()
    expect(pickedFrom({ mode: undefined, shape: 'a-circle' })).toBeNull()
  })

  it('posts a 1:2 pair’s generated name and the Discipler’s gender as its declaration, unasked', () => {
    expect(
      postedByAOneToTwo({ discipler: 'Claire Martinez', disciples: ['Sam Lee', 'Ana Ruiz'], declaredGender: 'female' }),
    ).toEqual({ name: 'Claire with Sam & Ana', declaredGender: 'female' })
  })

  it('posts no declaration for a Discipler with no gender on file, and leaves the refusal to the domain', () => {
    const posted = postedByAOneToTwo({ discipler: 'Claire Martinez', disciples: ['Sam Lee', 'Ana Ruiz'], declaredGender: null })
    expect(posted).toEqual({ name: 'Claire with Sam & Ana' })
    expect(posted).not.toHaveProperty('declaredGender')
  })
})
