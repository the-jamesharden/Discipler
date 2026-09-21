import { describe, expect, it } from 'vitest'
import {
  greyedOnRow,
  modeOf,
  postedByAOneToTwo,
  selectionAfter,
  selectionFrom,
  shapeOf,
  shapeToggle,
  type PairSelection,
  type PairSelectionContext,
} from '../../app/roster/pair-shape'

/**
 * Manual pairing, recut ticket 02. What two or more ticks become in the Pair popup
 * from a Discipler: the shape toggle, who is unticked when the shape changes, and
 * the Materials each shape holds. All of it is pure, because the repository has no
 * harness for client script, so the popup's behaviour is driven here and the
 * component only draws it.
 */

describe('the shape toggle', () => {
  const toggle = (
    ticked: number,
    picked: 'one_to_two' | 'separate' | null = null,
    leadsAGroup = false,
    wouldUntick: readonly ('one_to_two' | 'separate')[] = [],
  ) => shapeToggle({ ticked, picked, leadsAGroup, wouldUntick })

  it('is hidden while zero or one Disciple is ticked', () => {
    expect(toggle(0)).toBeNull()
    expect(toggle(1)).toBeNull()
    expect(toggle(1, 'separate')).toBeNull()
  })

  it('offers 1:2 pair and N x 1:1 pairs at two, defaulting to 1:2 pair', () => {
    expect(toggle(2)).toEqual({
      segments: [
        { shape: 'one_to_two', ruledOut: null },
        { shape: 'separate', ruledOut: null },
      ],
      selected: 'one_to_two',
    })
  })

  it('strikes 1:2 pair out at three or more, and the default follows the count', () => {
    for (const ticked of [3, 4, 9]) {
      expect(toggle(ticked), String(ticked)).toEqual({
        segments: [
          { shape: 'one_to_two', ruledOut: 'needs_exactly_two' },
          { shape: 'separate', ruledOut: null },
        ],
        selected: 'separate',
      })
    }
  })

  it('keeps what the Admin picked for as long as it is possible', () => {
    expect(toggle(2, 'separate')?.selected).toBe('separate')
    expect(toggle(5, 'separate')?.selected).toBe('separate')
    expect(toggle(2, 'one_to_two')?.selected).toBe('one_to_two')
    // Impossible at three, so the pick gives way to the default.
    expect(toggle(3, 'one_to_two')?.selected).toBe('separate')
  })

  it('defaults past a shape that would untick somebody who is ticked, and still lets the Admin pick it', () => {
    // What is possible is part of what the default follows: these two cannot be a
    // 1:2 pair, so untouched they are 2 x 1:1. Picking 1:2 is the Admin's to do.
    expect(toggle(2, null, false, ['one_to_two'])).toEqual({
      segments: [
        { shape: 'one_to_two', ruledOut: null },
        { shape: 'separate', ruledOut: null },
      ],
      selected: 'separate',
    })
    expect(toggle(2, 'one_to_two', false, ['one_to_two'])?.selected).toBe('one_to_two')
    // Where every shape would untick somebody, the default is the first as ever.
    expect(toggle(2, null, false, ['one_to_two', 'separate'])?.selected).toBe('one_to_two')
  })

  it('greys 1:2 pair for a Discipler who already leads a group, and the default moves to N x 1:1', () => {
    expect(toggle(2, null, true)).toEqual({
      segments: [
        { shape: 'one_to_two', ruledOut: 'already_leads_a_group' },
        { shape: 'separate', ruledOut: null },
      ],
      selected: 'separate',
    })
    expect(toggle(2, 'one_to_two', true)?.selected).toBe('separate')
    // Nothing about the ticks would open it, so that is the reason given at any count.
    expect(toggle(3, null, true)?.segments[0]?.ruledOut).toBe('already_leads_a_group')
  })
})

/**
 * Five Disciples under a woman Discipler in a Ministry that enforces the match:
 * three open rows, one already in a one-to-one, and one of another gender.
 */
const OPEN = { a_one_to_one: null, a_one_to_two: null }
const context: PairSelectionContext = {
  rows: [
    { id: 'sam', greyed: OPEN },
    { id: 'ana', greyed: OPEN },
    { id: 'rosa', greyed: OPEN },
    { id: 'brianna', greyed: { a_one_to_one: 'Already in a 1:1 with David Chen', a_one_to_two: null } },
    { id: 'tom', greyed: { a_one_to_one: 'Women’s only: a 1:1 is same-gender', a_one_to_two: 'Women’s only: a 1:2 is same-gender' } },
  ],
  leadsAGroup: false,
  materialIds: ['mark', 'romans'],
}

const nothing = selectionFrom(context, { tickedIds: [], separate: false, material: null, materialFor: [] })

const after = (selection: PairSelection, ...changes: Parameters<typeof selectionAfter>[2][]): PairSelection =>
  changes.reduce((each, change) => selectionAfter(context, each, change), selection)

const tick = (id: string) => ({ type: 'tick', id }) as const
const untick = (id: string) => ({ type: 'untick', id }) as const
const pick = (shape: 'one_to_two' | 'separate') => ({ type: 'pick', shape }) as const

describe('what is ticked, and what the ticks would make', () => {
  it('starts with nothing ticked, no shape, and no Material', () => {
    expect(nothing).toEqual({ tickedIds: [], picked: null, material: '', materialFor: {}, unticked: [] })
    expect(shapeOf(context, nothing)).toBeNull()
  })

  it('reads a row against the shape the ticks would make with it ticked', () => {
    const row = (id: string) => context.rows.find((each) => each.id === id)!

    // Nothing ticked: ticking anybody would make a one-to-one.
    expect(greyedOnRow(context, nothing, row('brianna'))).toBe('Already in a 1:1 with David Chen')
    expect(greyedOnRow(context, nothing, row('tom'))).toBe('Women’s only: a 1:1 is same-gender')

    // One ticked: ticking a second would make a 1:2 pair, which somebody already
    // in a one-to-one can be in. That is how they come to be ticked for one at all.
    const one = after(nothing, tick('sam'))
    expect(greyedOnRow(context, one, row('brianna'))).toBeNull()
    expect(greyedOnRow(context, one, row('tom'))).toBe('Women’s only: a 1:2 is same-gender')
    // The row already ticked is read against what is ticked now, a one-to-one.
    expect(greyedOnRow(context, one, row('sam'))).toBeNull()

    // Two ticked as a 1:2: a third would make them N x 1:1 pairs.
    const two = after(one, tick('ana'))
    expect(greyedOnRow(context, two, row('brianna'))).toBe('Already in a 1:1 with David Chen')
    expect(greyedOnRow(context, two, row('rosa'))).toBeNull()
  })

  it('reads a second row against N x 1:1 where the Discipler already leads a group', () => {
    const leading = { ...context, leadsAGroup: true }
    const one = selectionAfter(leading, nothing, tick('sam'))

    expect(greyedOnRow(leading, one, leading.rows[3]!)).toBe('Already in a 1:1 with David Chen')
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

    // 1:2 picked, then a third ticked: impossible, so forgotten, and two again is the default's 1:2.
    const pickedOneToTwo = after(separately, pick('one_to_two'), tick('rosa'))
    expect(pickedOneToTwo.picked).toBeNull()
    expect(shapeOf(context, pickedOneToTwo)?.selected).toBe('separate')
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

  it('re-checks when the default moves the shape, not only when the Admin picks', () => {
    const third = after(underOneToTwo, tick('ana'))

    // Three ticked is N x 1:1, which greys Brianna; two are left, which is a 1:2 again.
    expect(third.tickedIds).toEqual(['sam', 'ana'])
    expect(third.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
    expect(shapeOf(context, third)?.selected).toBe('one_to_two')
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

/**
 * A Ministry that does not enforce the match: a man can be in a one-to-one with a
 * woman Discipler, and cannot be in her 1:2 pair, which declares her gender whatever
 * the Ministry's setting says of a one-to-one.
 */
describe('two who can be N x 1:1 pairs and cannot be a 1:2 pair', () => {
  const relaxed: PairSelectionContext = {
    ...context,
    rows: [
      { id: 'sam', greyed: OPEN },
      { id: 'ana', greyed: OPEN },
      { id: 'tom', greyed: { a_one_to_one: null, a_one_to_two: 'Women’s only: a 1:2 is same-gender' } },
    ],
  }
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
    // A third tick would make 3 x 1:1, which he can be one of.
    expect(greyedOnRow(relaxed, two, tom)).toBeNull()
  })

  it('never offers a row whose tick would not stay: somebody no shape can hold beside who is ticked', () => {
    // She is already in a one-to-one, so she can only be in a 1:2 pair, and he can
    // only be one of N x 1:1. No shape holds the two of them. Offered and ticked,
    // she would untick him under the 1:2 and then herself as a lone one-to-one.
    const withHer: PairSelectionContext = {
      ...relaxed,
      rows: [...relaxed.rows, { id: 'brianna', greyed: { a_one_to_one: 'Already in a 1:1 with David Chen', a_one_to_two: null } }],
    }
    const her = withHer.rows[3]!
    const him = selectionAfter(withHer, nothing, tick('tom'))

    expect(greyedOnRow(withHer, him, her)).toBe('Already in a 1:1 with David Chen')
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
    const three = after(nothing, tick('sam'), tick('ana'), tick('rosa'))
    const chosen = after(three, materialFor('sam', 'mark'), materialFor('ana', 'romans'), materialFor('rosa', 'mark'))

    // Untouched, two ticked is a 1:2 pair: Rosa's choice goes with her tick, and
    // Sam's and Ana's are still theirs when the Admin asks for 2 x 1:1.
    const two = after(chosen, untick('rosa'))
    expect(shapeOf(context, two)?.selected).toBe('one_to_two')
    expect(after(two, pick('separate')).materialFor).toEqual({ sam: 'mark', ana: 'romans' })
  })

  it('keeps a choice through a change that leaves the shape as it was', () => {
    // A third tick that the re-check takes out again: 1:2 before and 1:2 after.
    const kept = after(nothing, tick('sam'), tick('brianna'), material('mark'), tick('ana'))
    expect(shapeOf(context, kept)?.selected).toBe('one_to_two')
    expect(kept.material).toBe('mark')
  })

  it('holds none below two ticks: a one-to-one from a single tick asks nothing', () => {
    expect(after(two, material('mark'), untick('ana')).material).toBe('')
  })
})

describe('what comes back from a refusal', () => {
  it('restores the ticks, the shape and every Material choice', () => {
    const restored = selectionFrom(context, {
      tickedIds: ['sam', 'ana'],
      separate: true,
      material: 'mark',
      materialFor: [['sam', 'mark'], ['ana', 'romans'], ['rosa', 'romans']],
    })

    expect(restored).toEqual({
      tickedIds: ['sam', 'ana'],
      picked: 'separate',
      // The one Material is the other shape's, and Rosa is not ticked.
      material: '',
      materialFor: { sam: 'mark', ana: 'romans' },
      unticked: [],
    })
  })

  it('restores a 1:2 pair with its one Material', () => {
    const restored = selectionFrom(context, {
      tickedIds: ['sam', 'ana'],
      separate: false,
      material: 'romans',
      materialFor: [['sam', 'mark']],
    })

    expect(shapeOf(context, restored)?.selected).toBe('one_to_two')
    expect(restored).toMatchObject({ picked: null, material: 'romans', materialFor: {} })
  })

  it('does not restore a Material that has left the list, and keeps the rest', () => {
    const restored = selectionFrom(context, {
      tickedIds: ['sam', 'ana'],
      separate: true,
      material: null,
      materialFor: [['sam', 'mark'], ['ana', 'removed-since']],
    })

    expect(restored.tickedIds).toEqual(['sam', 'ana'])
    expect(restored.materialFor).toEqual({ sam: 'mark' })
  })

  it('does not restore a tick that is greyed now, and says who; somebody not listed is nobody', () => {
    const restored = selectionFrom(context, {
      tickedIds: ['sam', 'brianna', 'stranger'],
      separate: true,
      material: null,
      materialFor: [],
    })

    expect(restored.tickedIds).toEqual(['sam'])
    expect(restored.unticked).toEqual([{ id: 'brianna', why: 'Already in a 1:1 with David Chen' }])
  })

  it('restores in the list’s order, whatever order the address said them in', () => {
    const restored = selectionFrom(context, {
      tickedIds: ['ana', 'sam'],
      separate: false,
      material: null,
      materialFor: [],
    })
    expect(restored.tickedIds).toEqual(['sam', 'ana'])
  })
})

describe('what each shape posts to the pairing route', () => {
  it('posts a 1:2 pair as one relationship of them all, and N x 1:1 pairs as separate', () => {
    expect(modeOf('one_to_two')).toBe('together')
    expect(modeOf('separate')).toBe('separate')
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
