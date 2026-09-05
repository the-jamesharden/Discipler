import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import {
  goalWording,
  type OfferedGoal,
  type StatedGoal,
} from '~/domain/discipleship-goals'
import type { Effect } from '~/domain/effects'
import { GoalRefused } from '~/domain/errors'
import {
  createSequentialIds,
  intakeSubmissionId,
  ministryId,
  personId,
} from '~/domain/ids'
import { discipleshipGoalId } from '~/domain/intake'

/**
 * The list of Discipleship Goals a Ministry offers at Intake is the Ministry's
 * own. Four acts change it, and the difference between them is the whole point:
 * three cost nobody anything and the fourth loses answers that cannot be got back.
 *
 * Renaming is the one worth stating plainly. An option is a row and the answers
 * point at the row, so rewording it keeps every one of them -- a Ministry that
 * decides *Career* should read *Career and calling* has not asked anybody a new
 * question.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')

const basics = discipleshipGoalId('00000000-0000-4000-8000-0000000000b1')
const career = discipleshipGoalId('00000000-0000-4000-8000-0000000000b2')
const marriage = discipleshipGoalId('00000000-0000-4000-8000-0000000000b3')

const at = new Date('2026-09-14T10:00:00Z')

const theList: readonly OfferedGoal[] = [
  { id: basics, label: goalWording('Growing in the basics of faith'), position: 1, chosenBy: 4 },
  { id: career, label: goalWording('Career and calling'), position: 2, chosenBy: 0 },
  { id: marriage, label: goalWording('Marriage and family'), position: 3, chosenBy: 7 },
]

/**
 * Seven people chose *Marriage and family*, and one of them said so twice --
 * answering once in the spring and again in the autumn. The count an Admin is
 * warned with is people, so it is seven; the rows a removal blanks are eight.
 */
const marriageAnswers: readonly StatedGoal[] = [
  ...Array.from({ length: 7 }, (_unused, index) => ({
    submissionId: intakeSubmissionId(`00000000-0000-4000-8000-0000000000${10 + index}`),
    personId: personId(`00000000-0000-4000-8000-0000000000${20 + index}`),
    submittedAt: new Date('2026-09-01T09:00:00Z'),
  })),
  // The same Person as the first row above, answering a second time. Superseded,
  // so it is not in the count -- and blanked all the same, so it is in the record.
  {
    submissionId: intakeSubmissionId('00000000-0000-4000-8000-000000000019'),
    personId: personId('00000000-0000-4000-8000-000000000020'),
    submittedAt: new Date('2026-03-01T09:00:00Z'),
  },
]

const edit = (
  command: Command,
  goals: readonly OfferedGoal[] = theList,
  goalAnswers: readonly StatedGoal[] = marriageAnswers,
) =>
  handleCommand(command, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    goals,
    goalAnswers,
  } satisfies CommandContext)

const added = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'goal.add' ? [effect.goal] : []))

const renamed = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'goal.rename' ? [effect.renaming] : []))

const reordered = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'goal.reorder' ? [effect.order] : []))

const removed = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'goal.remove' ? [effect.removal] : []))

const history = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

describe('adding a Discipleship Goal option', () => {
  it('puts it last, where the Ministry can then move it', () => {
    const { effects } = edit({ type: 'goal.add', ministryId: ministry, label: 'Healing' })

    expect(added(effects)).toEqual([
      {
        id: discipleshipGoalId('00000000-0000-4000-8000-000000000001'),
        ministryId: ministry,
        label: 'Healing',
        position: 4,
        createdAt: at,
      },
    ])
  })

  it('lands after the highest position rather than after the count', () => {
    // A removal leaves a gap. Counting the options instead would put the new one
    // on a position something else already holds.
    const gapped: readonly OfferedGoal[] = [
      { id: basics, label: goalWording('Growing in the basics of faith'), position: 1, chosenBy: 0 },
      { id: marriage, label: goalWording('Marriage and family'), position: 3, chosenBy: 0 },
    ]

    const { effects } = edit(
      { type: 'goal.add', ministryId: ministry, label: 'Healing' },
      gapped,
    )

    expect(added(effects)[0]?.position).toBe(4)
  })

  it('records it in history, so a list that changed mid-semester is legible', () => {
    const { effects } = edit({ type: 'goal.add', ministryId: ministry, label: 'Healing' })

    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'discipleship_goal.added',
        subjectType: 'discipleship_goal',
        subjectId: discipleshipGoalId('00000000-0000-4000-8000-000000000001'),
        payload: { label: 'Healing' },
      },
    ])
  })

  it('tidies the wording it was given, because two spaces is a typo', () => {
    const { effects } = edit({
      type: 'goal.add',
      ministryId: ministry,
      label: '  Healing  and   recovery ',
    })

    expect(added(effects)[0]?.label).toBe('Healing and recovery')
  })

  it('refuses an option with nothing written on it', () => {
    expect(() => edit({ type: 'goal.add', ministryId: ministry, label: '   ' })).toThrow(
      new GoalRefused('goal.needs_wording'),
    )
  })

  it('refuses one this Ministry already offers, however it is capitalised', () => {
    expect(() =>
      edit({ type: 'goal.add', ministryId: ministry, label: 'career and CALLING' }),
    ).toThrow(new GoalRefused('goal.already_offered'))
  })
})

describe('renaming a Discipleship Goal option', () => {
  it('keeps the option, so everybody who chose it still has', () => {
    const { effects } = edit({
      type: 'goal.rename',
      ministryId: ministry,
      goalId: career,
      label: 'Work and vocation',
    })

    // No removal and no addition: one row, reworded.
    expect(renamed(effects)).toEqual([
      { ministryId: ministry, goalId: career, label: 'Work and vocation' },
    ])
    expect(removed(effects)).toEqual([])
    expect(added(effects)).toEqual([])
  })

  it('records what it used to say, which nothing else keeps', () => {
    const { effects } = edit({
      type: 'goal.rename',
      ministryId: ministry,
      goalId: career,
      label: 'Work and vocation',
    })

    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'discipleship_goal.renamed',
        subjectType: 'discipleship_goal',
        subjectId: career,
        payload: { from: 'Career and calling', to: 'Work and vocation' },
      },
    ])
  })

  it('lets an Admin correct the capitalisation of the option itself', () => {
    // Compared against every other option and never against itself, or fixing
    // `career and calling` would be refused as a duplicate of `career and calling`.
    const { effects } = edit({
      type: 'goal.rename',
      ministryId: ministry,
      goalId: career,
      label: 'Career and Calling',
    })

    expect(renamed(effects)[0]?.label).toBe('Career and Calling')
  })

  it('refuses wording another option already carries', () => {
    expect(() =>
      edit({
        type: 'goal.rename',
        ministryId: ministry,
        goalId: career,
        label: 'Marriage and family',
      }),
    ).toThrow(new GoalRefused('goal.already_offered'))
  })

  it('refuses an option this Ministry does not offer', () => {
    expect(() =>
      edit({
        type: 'goal.rename',
        ministryId: ministry,
        goalId: discipleshipGoalId('00000000-0000-4000-8000-0000000000ff'),
        label: 'Anything',
      }),
    ).toThrow(new GoalRefused('goal.not_found'))
  })

  it('refuses to leave an option with nothing written on it', () => {
    expect(() =>
      edit({ type: 'goal.rename', ministryId: ministry, goalId: career, label: ' ' }),
    ).toThrow(new GoalRefused('goal.needs_wording'))
  })
})

describe('moving a Discipleship Goal option', () => {
  it('gives back the whole list in its new order', () => {
    const { effects } = edit({
      type: 'goal.move',
      ministryId: ministry,
      goalId: marriage,
      direction: 'up',
    })

    expect(reordered(effects)).toEqual([
      { ministryId: ministry, order: [basics, marriage, career] },
    ])
  })

  it('moves one down as the same act with the other direction', () => {
    const { effects } = edit({
      type: 'goal.move',
      ministryId: ministry,
      goalId: basics,
      direction: 'down',
    })

    expect(reordered(effects)[0]?.order).toEqual([career, basics, marriage])
  })

  it('rewrites positions that had drifted, rather than carrying the gaps forward', () => {
    const gapped: readonly OfferedGoal[] = [
      { id: basics, label: goalWording('Growing in the basics of faith'), position: 2, chosenBy: 0 },
      { id: career, label: goalWording('Career and calling'), position: 9, chosenBy: 0 },
    ]

    const { effects } = edit(
      { type: 'goal.move', ministryId: ministry, goalId: career, direction: 'up' },
      gapped,
    )

    expect(reordered(effects)[0]?.order).toEqual([career, basics])
  })

  it('does nothing at all when the option is already where it was asked to go', () => {
    // An Admin pressing up on the top option has asked for the list they are
    // looking at. Nothing happened, so nothing is written and history says nothing.
    const { effects } = edit({
      type: 'goal.move',
      ministryId: ministry,
      goalId: basics,
      direction: 'up',
    })

    expect(effects).toEqual([])
  })

  it('records which option moved and where it went', () => {
    const { effects } = edit({
      type: 'goal.move',
      ministryId: ministry,
      goalId: marriage,
      direction: 'up',
    })

    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'discipleship_goal.moved',
        subjectType: 'discipleship_goal',
        subjectId: marriage,
        payload: { direction: 'up', order: [basics, marriage, career] },
      },
    ])
  })

  it('refuses an option this Ministry does not offer', () => {
    expect(() =>
      edit({
        type: 'goal.move',
        ministryId: ministry,
        goalId: discipleshipGoalId('00000000-0000-4000-8000-0000000000ff'),
        direction: 'up',
      }),
    ).toThrow(new GoalRefused('goal.not_found'))
  })
})

describe('dragging a Discipleship Goal option to a new place', () => {
  it('gives back the whole list in the order it was dragged into', () => {
    const { effects } = edit({
      type: 'goal.reorder',
      ministryId: ministry,
      order: [marriage, basics, career],
    })

    expect(reordered(effects)).toEqual([
      { ministryId: ministry, order: [marriage, basics, career] },
    ])
  })

  it('does nothing at all when the option was let go where it was picked up', () => {
    const { effects } = edit({
      type: 'goal.reorder',
      ministryId: ministry,
      order: [basics, career, marriage],
    })

    expect(effects).toEqual([])
  })

  it('records both orders, because the one overwritten is what nothing else keeps', () => {
    const { effects } = edit({
      type: 'goal.reorder',
      ministryId: ministry,
      order: [career, marriage, basics],
    })

    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'discipleship_goal.reordered',
        subjectType: 'ministry',
        subjectId: ministry,
        payload: { from: [basics, career, marriage], to: [career, marriage, basics] },
      },
    ])
  })

  it('refuses an order that is not this list, however it differs', () => {
    const stranger = discipleshipGoalId('00000000-0000-4000-8000-0000000000ff')

    // One missing, one repeated, and one this Ministry does not offer: a page
    // drawn before somebody else edited the list, in each of the ways it can be.
    for (const order of [
      [basics, career],
      [basics, career, career],
      [basics, career, marriage, stranger],
      [basics, career, stranger],
    ]) {
      expect(() => edit({ type: 'goal.reorder', ministryId: ministry, order })).toThrow(
        new GoalRefused('goal.list_changed'),
      )
    }
  })
})

describe('removing a Discipleship Goal option', () => {
  it('carries what it cost, because nothing else will be able to say', () => {
    const { effects } = edit({ type: 'goal.remove', ministryId: ministry, goalId: marriage })

    expect(removed(effects)).toEqual([
      {
        ministryId: ministry,
        goalId: marriage,
        label: 'Marriage and family',
        chosenBy: 7,
      },
    ])
  })

  it('writes the loss into history, which is the only record that survives it', () => {
    const { effects } = edit({ type: 'goal.remove', ministryId: ministry, goalId: marriage })

    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'discipleship_goal.removed',
        subjectType: 'discipleship_goal',
        subjectId: marriage,
        payload: {
          label: 'Marriage and family',
          answersLost: 7,
          blankedAnswers: marriageAnswers.map((answer) => ({
            submissionId: answer.submissionId,
            personId: answer.personId,
            submittedAt: answer.submittedAt.toISOString(),
          })),
        },
      },
    ])
  })

  it('records every row the delete blanks, not only the people it was counted as', () => {
    // The warning is about people and the delete is about rows, and the two are
    // different numbers wherever anybody answered twice. The larger set is the one
    // written down -- a superseded answer is still an answer that pointed here, and
    // after the removal nothing else can say it did.
    const { effects } = edit({ type: 'goal.remove', ministryId: ministry, goalId: marriage })
    const [event] = history(effects)
    const payload = event!.payload as {
      answersLost: number
      blankedAnswers: readonly { personId: string }[]
    }

    expect(payload.answersLost).toBe(7)
    expect(payload.blankedAnswers).toHaveLength(8)
    expect(new Set(payload.blankedAnswers.map((answer) => answer.personId)).size).toBe(7)
  })

  it('will not record a removal whose answers were never read', () => {
    // Absent and empty are opposite facts. A removal that recorded *it cost
    // nothing* because the read never happened is the one record nobody can go
    // back for, so this fails loudly rather than writing an empty list.
    expect(() =>
      handleCommand(
        { type: 'goal.remove', ministryId: ministry, goalId: marriage },
        {
          ministryId: ministry,
          clock: createTestClock(at),
          ids: createSequentialIds(),
          goals: theList,
        } satisfies CommandContext,
      ),
    ).toThrow('No answers were loaded for the Discipleship Goal being removed')
  })

  it('refuses the last one, because Intake could not then be served', () => {
    const one: readonly OfferedGoal[] = [
      { id: basics, label: goalWording('Growing in the basics of faith'), position: 1, chosenBy: 4 },
    ]

    expect(() =>
      edit({ type: 'goal.remove', ministryId: ministry, goalId: basics }, one),
    ).toThrow(new GoalRefused('goal.last_one'))
  })

  it('refuses an option this Ministry does not offer', () => {
    expect(() =>
      edit({
        type: 'goal.remove',
        ministryId: ministry,
        goalId: discipleshipGoalId('00000000-0000-4000-8000-0000000000ff'),
      }),
    ).toThrow(new GoalRefused('goal.not_found'))
  })
})

describe('every edit to the list', () => {
  const commands: readonly Command[] = [
    { type: 'goal.add', ministryId: ministry, label: 'Healing' },
    { type: 'goal.rename', ministryId: ministry, goalId: career, label: 'Healing' },
    { type: 'goal.move', ministryId: ministry, goalId: career, direction: 'up' },
    { type: 'goal.remove', ministryId: ministry, goalId: career },
  ]

  it.each(commands.map((command) => [command.type, command] as const))(
    'refuses to decide %s with no list loaded',
    (_type, command) => {
      // Absent and empty are the same value and opposite facts here. A Ministry
      // whose list did not load would look like one with no options at all --
      // which would let a duplicate through, and would refuse a removal that was
      // perfectly safe.
      expect(() =>
        handleCommand(command, {
          ministryId: ministry,
          clock: createTestClock(at),
          ids: createSequentialIds(),
        } satisfies CommandContext),
      ).toThrow(/list of Discipleship Goal/)
    },
  )
})
