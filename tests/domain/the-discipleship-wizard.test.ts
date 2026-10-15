import { describe, expect, it } from 'vitest'
import {
  DECLARED_SIDES,
  INTAKE_PATHS,
  readIntakeForm,
  REQUIRED_TODAY,
  type IntakeFormFields,
} from '~/domain/intake'

/**
 * The four answers the discipleship wizard adds to the form Intake already read:
 * which form was being answered, which side the Person offered to stand on,
 * whether this is their first time, and whether they are open to a 1:2.
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
  goalOther: null,
  availability: ['monday:12'],
  smsConsent: true,
  contactSharing: 'granted',
  source: 'pastor_link',
  intakePath: 'discipleship',
  declaredSide: 'mentee',
  experience: 'first_time',
  oneToTwo: 'open_to_one_to_two',
  groupId: null,
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
          availability: [{ day: 'monday', hour: '12' }],
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

  /**
   * The first-time answer's twin (Suggestions beyond the one-to-one, ticket 01),
   * carried as words for the same reason and all the way to the row: the screen
   * words the question as a statement to agree with, so a yes/no would be read
   * against a question that is not on the row. The answer binds nothing; what is
   * recorded is what they said, in the two words the form offers.
   */
  it('records whether they are open to a 1:2, in the words they answered', () => {
    expect(read({ oneToTwo: 'open_to_one_to_two' })).toMatchObject({
      submission: { oneToTwo: 'open_to_one_to_two' },
    })
    expect(read({ oneToTwo: 'one_to_one_only' })).toMatchObject({
      submission: { oneToTwo: 'one_to_one_only' },
    })
  })

  it('takes the one-to-two answer from either side, under the same two words', () => {
    for (const side of DECLARED_SIDES) {
      expect(read({ declaredSide: side, oneToTwo: 'one_to_one_only' })).toMatchObject({
        submission: { declaredSide: side, oneToTwo: 'one_to_one_only' },
      })
    }
  })

  it('leaves all four null on a form that did not ask', () => {
    expect(
      read({ intakePath: null, declaredSide: null, experience: null, oneToTwo: null }),
    ).toMatchObject({
      submission: { intakePath: null, declaredSide: null, firstTime: null, oneToTwo: null },
    })
  })

  it('serves two paths: the wizard, and the group form ticket 29 added', () => {
    expect(INTAKE_PATHS).toEqual(['discipleship', 'group'])
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

  /**
   * Unanswered is refused on the form that asks it, and only there: null on any
   * other form is *the form did not ask*, never a refusal, which is what lets the
   * correction form leave the question out and the Roster keep an earlier answer.
   */
  it('refuses the discipleship path with the one-to-two question unanswered', () => {
    expect(refusalsOf({ oneToTwo: null })).toEqual(['intake.one_to_two_unanswered'])
    expect(refusalsOf({ oneToTwo: 'maybe' })).toEqual(['intake.one_to_two_unanswered'])
  })

  /**
   * A Ministry's form that does not ask it -- removed, or an edited form saved
   * before the question existed (Pastor feedback, ticket 13) -- takes the
   * submission without it, and refuses an answer to it as an answer with no
   * question. A form that made it optional takes it unanswered too.
   */
  it('refuses it unanswered only where the form asks it', () => {
    const notAsked = new Set(['oneToTwo'] as const)
    expect(readIntakeForm({ ...wizardForm, oneToTwo: null }, REQUIRED_TODAY, [], notAsked)).toMatchObject({
      submission: { oneToTwo: null },
    })
    expect(
      readIntakeForm({ ...wizardForm, oneToTwo: 'one_to_one_only' }, REQUIRED_TODAY, [], notAsked),
    ).toEqual({ refusals: ['intake.path_unknown'] })

    const optional = new Set([...REQUIRED_TODAY].filter((key) => key !== 'oneToTwo'))
    expect(readIntakeForm({ ...wizardForm, oneToTwo: null }, optional)).toMatchObject({
      submission: { oneToTwo: null },
    })
  })

  it('reports all three at once rather than one screen at a time', () => {
    expect(refusalsOf({ declaredSide: null, experience: null, oneToTwo: null })).toEqual([
      'intake.side_unknown',
      'intake.first_time_unanswered',
      'intake.one_to_two_unanswered',
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
    // The one-to-two answer alone, on a form with no path, is the same thing.
    expect(
      refusalsOf({ intakePath: null, declaredSide: null, experience: null }),
    ).toEqual(['intake.path_unknown'])
  })

  it('refuses a path it does not serve', () => {
    expect(refusalsOf({ intakePath: 'group' })).toContain('intake.path_unknown')
  })
})
