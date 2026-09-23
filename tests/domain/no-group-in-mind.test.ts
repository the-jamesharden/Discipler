import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import {
  FOLLOW_UP_KINDS,
  followUpPayload,
  readFollowUpPayload,
} from '~/domain/follow-up'
import { createSequentialIds, ministryId, type PersonId } from '~/domain/ids'
import {
  answersNoGroupInMind,
  GROUP_PATH,
  NO_GROUP_IN_MIND,
  readIntakeForm,
  type IntakeFormFields,
} from '~/domain/intake'

/**
 * Group form exits, ticket 01: "I don't have a group in mind", the last option
 * on the group form's step three. The submission records a null group, and the
 * `group_placement_wanted` Follow-Up Item is raised carrying the Person.
 *
 * Placing them is `group.add_participant`, covered with the rest of that act in
 * `an-admin-puts-somebody-into-a-group.test.ts`.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const now = new Date('2026-09-09T19:00:00Z')

const noGroupForm: IntakeFormFields = {
  fullName: 'Jonah Fields',
  phone: '(555) 234-9912',
  email: null,
  ageBand: '25-34',
  gender: 'male',
  goalId: null,
  availability: ['tuesday:18', 'thursday:18'],
  smsConsent: true,
  contactSharing: 'granted',
  source: 'pastor_link',
  intakePath: GROUP_PATH,
  declaredSide: null,
  experience: null,
  groupId: NO_GROUP_IN_MIND,
}

const read = (overrides: Partial<IntakeFormFields> = {}) =>
  readIntakeForm({ ...noGroupForm, ...overrides })

const submit = (form: Partial<IntakeFormFields> = {}, over: Partial<CommandContext> = {}) =>
  handleCommand(
    { type: 'intake.submit', ministryId: ministry, form: { ...noGroupForm, ...form } },
    {
      ministryId: ministry,
      clock: createTestClock(now),
      ids: createSequentialIds(),
      ministryName: 'Grace Fellowship',
      appBaseUrl: 'https://discipler.test',
      roster: { people: new Map(), namesByNumber: new Map(), whoCompletedIntake: new Set<PersonId>(), removed: new Set<PersonId>() },
      ...over,
    },
  )

const raised = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'followUp.raise' ? [effect.item] : []))

describe('the intake boundary, on the group path', () => {
  it('accepts no group in mind, and records the submission with a null group', () => {
    expect(read()).toMatchObject({
      submission: { intakePath: GROUP_PATH, groupId: null, goalId: null },
    })
  })

  it('reads the answer the same with space around it, and decides it in one place', () => {
    expect(read({ groupId: '  none ' })).toMatchObject({ submission: { groupId: null } })
    expect(answersNoGroupInMind('  none ')).toBe(true)
    expect(answersNoGroupInMind(NO_GROUP_IN_MIND)).toBe(true)
    for (const other of [null, '', 'None', 'nonesuch', '00000000-0000-4000-8000-0000000000b1']) {
      expect(answersNoGroupInMind(other)).toBe(false)
    }
  })

  it('still refuses an empty field as unanswered', () => {
    for (const groupId of [null, '', '   ']) {
      const result = read({ groupId })
      expect('refusals' in result && result.refusals).toEqual(['intake.group_not_selected'])
    }
  })

  it('is an answer with no question on any other path', () => {
    const result = read({
      intakePath: 'discipleship',
      declaredSide: 'mentee',
      experience: 'first_time',
      goalId: 'some-goal',
    })
    expect('refusals' in result && result.refusals).toEqual(['intake.path_unknown'])
  })
})

describe('submitting with no group in mind', () => {
  it('raises a group_placement_wanted item carrying the Person and nothing else', () => {
    const { effects } = submit()
    const person = effects.find((effect) => effect.kind === 'person.create')
    if (person?.kind !== 'person.create') throw new Error('Jonah should have been added to the Roster')

    expect(raised(effects)).toEqual([
      {
        ministryId: ministry,
        kind: 'group_placement_wanted',
        personId: person.person.id,
        relationshipId: null,
        raisedAt: now,
      },
    ])
  })

  it('records the ask in history every time, as the item dedupes and this does not', () => {
    const { effects } = submit()
    const events = effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))
    expect(events.map((event) => event.type)).toContain('person.group_placement_wanted')
  })

  it('records the Intake, joins nothing and asks to join nothing', () => {
    const kinds = submit().effects.map((effect) => effect.kind)
    expect(kinds).toContain('intake.record')
    expect(kinds).not.toContain('relationship.join')
  })

  it('reads no group, and needs none loaded', () => {
    // `groupToJoin` is absent from the context: a submission naming a group would
    // refuse to run without it, and this one names none.
    expect(() => submit()).not.toThrow()
  })

  it('sends the Welcome alone, which says nothing about a group', () => {
    const sent = submit().effects.flatMap((effect) =>
      effect.kind === 'message.enqueue' ? [effect.message] : [],
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]!.body).not.toMatch(/group/i)
  })

  it('raises nothing on the discipleship path', () => {
    const { effects } = submit({
      intakePath: 'discipleship',
      declaredSide: 'mentee',
      experience: 'first_time',
      goalId: '00000000-0000-4000-8000-0000000000c1',
      groupId: null,
    })
    expect(raised(effects)).toEqual([])
  })
})

describe('the kind', () => {
  it('is a Follow-Up kind', () => {
    expect(FOLLOW_UP_KINDS).toContain('group_placement_wanted')
  })

  it('carries no payload, and reads back as itself', () => {
    expect(followUpPayload({ kind: 'group_placement_wanted' })).toEqual({})
    expect(readFollowUpPayload('group_placement_wanted', {})).toEqual({
      kind: 'group_placement_wanted',
    })
  })
})
