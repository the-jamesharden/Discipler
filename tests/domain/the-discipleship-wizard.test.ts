import { describe, expect, it } from 'vitest'
import {
  DECLARED_SIDES,
  INTAKE_PATHS,
  readIntakeForm,
  type IntakeFormFields,
} from '~/domain/intake'

/**
 * The three answers the discipleship wizard adds to the form Intake already read:
 * which form was being answered, which side the Person offered to stand on, and
 * whether this is their first time.
 *
 * They are read here rather than at each step, because nothing is written until the
 * last step submits: the wizard carries every earlier answer forward as hidden
 * inputs, so what reaches the domain is one whole form however many screens it was
 * spread across.
 */

const wizardForm: IntakeFormFields = {
  fullName: 'Emily Johnson',
  phone: '(555) 234-9911',
  email: null,
  ageBand: '25-34',
  gender: 'female',
  goalId: '00000000-0000-4000-8000-000000000009',
  availability: ['monday:midday'],
  smsConsent: true,
  contactSharing: 'granted',
  source: 'pastor_link',
  intakePath: 'discipleship',
  declaredSide: 'mentee',
  experience: 'first_time',
}

const read = (overrides: Partial<IntakeFormFields> = {}) =>
  readIntakeForm({ ...wizardForm, ...overrides })

const refusalsOf = (overrides: Partial<IntakeFormFields>): readonly string[] => {
  const result = read(overrides)
  if (!('refusals' in result)) throw new Error('Expected the form to be refused')
  return result.refusals
}

describe('what the wizard records', () => {
  it('reads back the path and the side the Person declared', () => {
    expect(read()).toMatchObject({
      submission: { intakePath: 'discipleship', declaredSide: 'mentee' },
    })
  })

  it('asks both sides the same things, and takes the same answers from either', () => {
    for (const side of DECLARED_SIDES) {
      expect(read({ declaredSide: side })).toMatchObject({
        submission: {
          declaredSide: side,
          ageBand: '25-34',
          gender: 'female',
          firstTime: true,
          availability: [{ day: 'monday', block: 'midday' }],
          goalId: '00000000-0000-4000-8000-000000000009',
        },
      })
    }
  })

  /**
   * The two answers are worded as statements rather than as yes and no, so the
   * answer is legible without the question -- and they are carried as words rather
   * than as a yes/no field for the same reason. `first_time` reaching the database
   * as false because somebody read "No, this is my first time" as a no is the one
   * mistake this field can make, and there is no `no` here to make it with.
   */
  it('says first time when they said it was, and not when they said the opposite', () => {
    expect(read({ experience: 'first_time' })).toMatchObject({
      submission: { firstTime: true },
    })
    expect(read({ experience: 'done_before' })).toMatchObject({
      submission: { firstTime: false },
    })
  })

  it('leaves all three null on a form that did not ask', () => {
    expect(
      read({ intakePath: null, declaredSide: null, experience: null }),
    ).toMatchObject({
      submission: { intakePath: null, declaredSide: null, firstTime: null },
    })
  })

  it('serves exactly one path today, which is what ticket 29 adds to', () => {
    expect(INTAKE_PATHS).toEqual(['discipleship'])
  })
})

describe('what the wizard refuses', () => {
  it('refuses the discipleship path with no side', () => {
    expect(refusalsOf({ declaredSide: null })).toContain('intake.side_unknown')
    expect(refusalsOf({ declaredSide: 'leader' })).toContain('intake.side_unknown')
  })

  it('refuses the discipleship path with the first-time question unanswered', () => {
    expect(refusalsOf({ experience: null })).toContain('intake.first_time_unanswered')
    expect(refusalsOf({ experience: 'maybe' })).toContain('intake.first_time_unanswered')
  })

  it('reports both at once rather than one screen at a time', () => {
    expect(refusalsOf({ declaredSide: null, experience: null })).toEqual([
      'intake.side_unknown',
      'intake.first_time_unanswered',
    ])
  })

  /**
   * The same rule `source` is held to. A consent record that cannot say what
   * question was answered fails rather than guessing, and an answer with no
   * question is exactly that: a side arriving with no path is not a form Discipler
   * served.
   */
  it('refuses an answer that arrived without a form to belong to', () => {
    expect(refusalsOf({ intakePath: null })).toEqual(['intake.path_unknown'])
    expect(
      refusalsOf({ intakePath: null, declaredSide: null }),
    ).toEqual(['intake.path_unknown'])
  })

  it('refuses a path it does not serve', () => {
    expect(refusalsOf({ intakePath: 'group' })).toContain('intake.path_unknown')
  })
})
