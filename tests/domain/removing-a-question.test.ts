import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import { IntakeFormRefused, IntakeRefused } from '~/domain/errors'
import { createSequentialIds, intakeSubmissionId, ministryId, personId, type PersonId } from '~/domain/ids'
import { readIntakeForm, type IntakeFormFields } from '~/domain/intake'
import {
  addBackQuestion,
  addQuestion,
  BUILT_IN_QUESTIONS,
  isRemovable,
  presetForm,
  questionOn,
  questionsOf,
  removalDeletesAnswers,
  removedQuestions,
  removeQuestion,
  requiredOn,
  type AnswerGiven,
  type BuiltInQuestion,
  type FormEdit,
  type IntakeForm,
} from '~/domain/intake-form'
import { suggest, type SuggestionCandidate, type SuggestionQuestion } from '~/domain/suggestions'

/**
 * Any question but name and phone can be removed from a form (Pastor feedback
 * 2026-10, ticket 13). A removal is ADR-0014's one rule for every question: the
 * form's next version no longer asks it, every answer given to it is deleted,
 * and the removal's history event keeps what they said. A question the product
 * reads may go too, and each surface that reads it then does without it.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const at = new Date('2026-10-14T10:00:00Z')

const mentorAndMentee = presetForm('discipleship')
const groups = presetForm('group')

const formOf = (edit: FormEdit): IntakeForm => {
  if (edit === null || 'refusal' in edit) throw new Error(`Expected a saved form, got ${JSON.stringify(edit)}`)
  return edit.form
}

const refusalOf = (edit: FormEdit) => {
  if (edit === null || !('refusal' in edit)) throw new Error('Expected a refusal')
  return edit.refusal
}

const keysOf = (form: IntakeForm) => questionsOf(form).map((question) => question.key)

const without = (form: IntakeForm, ...keys: string[]): IntakeForm =>
  keys.reduce((each, key) => formOf(removeQuestion(each, key)), form)

describe('removing a question from the form', () => {
  it('takes any question but the name and the mobile number off the form, as its next version', () => {
    for (const key of BUILT_IN_QUESTIONS) {
      const question = questionOn(mentorAndMentee, key) ?? questionOn(groups, key)!
      expect(isRemovable(question)).toBe(key !== 'fullName' && key !== 'phone')
    }

    const removed = formOf(removeQuestion(mentorAndMentee, 'availability'))
    expect(removed.version).toBe(1)
    expect(keysOf(removed)).not.toContain('availability')
    expect(keysOf(removed)).toEqual(keysOf(mentorAndMentee).filter((key) => key !== 'availability'))
    // The page it was on stays, empty, and the wizard skips it.
    expect(removed.pages.find((page) => page.id === 'availability')?.questions).toEqual([])
  })

  it('never takes off the name or the mobile number', () => {
    expect(refusalOf(removeQuestion(mentorAndMentee, 'fullName'))).toBe('intake_form.always_asked')
    expect(refusalOf(removeQuestion(groups, 'phone'))).toBe('intake_form.always_asked')
  })

  it('keeps the side while the first-time question, worded from it, is asked', () => {
    expect(refusalOf(removeQuestion(mentorAndMentee, 'side'))).toBe('intake_form.worded_from_it')
    expect(keysOf(without(mentorAndMentee, 'experience', 'side'))).not.toContain('side')
  })

  it('removes a question of the Ministry’s own', () => {
    const asked = formOf(
      addQuestion(
        mentorAndMentee,
        'last',
        'custom:anything-else',
        'long_text',
        { wording: 'Anything else?', menteeWording: null, hint: '', required: false },
        () => 'unused',
      ),
    )
    expect(keysOf(formOf(removeQuestion(asked, 'custom:anything-else')))).not.toContain('custom:anything-else')
  })

  it('refuses a question that is not on the form: somebody removed it already', () => {
    expect(refusalOf(removeQuestion(without(mentorAndMentee, 'gender'), 'gender'))).toBe('intake_form.not_found')
  })

  it('deletes the answers of every question that keeps any, and of neither the email nor the group', () => {
    expect(BUILT_IN_QUESTIONS.filter((key) => !removalDeletesAnswers(key))).toEqual([
      'groupId',
      'fullName',
      'phone',
      'email',
    ])
    expect(removalDeletesAnswers('custom:anything-else')).toBe(true)
  })
})

describe('adding a removed question back', () => {
  it('offers back what the form asked as it was first served and asks no longer', () => {
    expect(removedQuestions(mentorAndMentee)).toEqual([])
    expect(removedQuestions(without(mentorAndMentee, 'gender', 'availability'))).toEqual(['gender', 'availability'])
    // The groups form never asked the goal, so it is never offered there.
    expect(removedQuestions(without(groups, 'groupId'))).toEqual(['groupId'])
  })

  it('puts it back at the foot of a page in the words the preset asks it in', () => {
    const removed = without(mentorAndMentee, 'gender')
    const back = formOf(addBackQuestion(removed, 'welcome', 'gender'))
    expect(back.version).toBe(2)
    expect(back.pages[0]!.questions.map((question) => question.key)).toEqual(['side', 'gender'])
    expect(questionOn(back, 'gender')).toEqual(questionOn(mentorAndMentee, 'gender'))
    expect(requiredOn(back).has('gender')).toBe(true)
  })

  it('keeps the rules on where it may be asked', () => {
    const removed = without(mentorAndMentee, 'goalId', 'email', 'experience')
    expect(refusalOf(addBackQuestion(removed, 'welcome', 'goalId'))).toBe('intake_form.stays_on_the_last_page')
    expect(keysOf(formOf(addBackQuestion(removed, 'last', 'email')))).toContain('email')
    expect(refusalOf(addBackQuestion(removed, 'welcome', 'experience'))).toBe('intake_form.asked_too_soon')
    expect(keysOf(formOf(addBackQuestion(removed, 'experience', 'experience')))).toContain('experience')
  })

  it('does not add back the first-time question to a form that no longer asks the side', () => {
    const removed = without(mentorAndMentee, 'experience', 'side')
    expect(refusalOf(addBackQuestion(removed, 'experience', 'experience'))).toBe('intake_form.worded_from_it')
  })

  it('refuses a question already on the form, or one this form never asked', () => {
    expect(refusalOf(addBackQuestion(mentorAndMentee, 'welcome', 'gender'))).toBe('intake_form.changed')
    expect(refusalOf(addBackQuestion(groups, 'last', 'goalId'))).toBe('intake_form.changed')
    expect(refusalOf(addBackQuestion(without(groups, 'gender'), 'nowhere', 'gender'))).toBe('intake_form.not_found')
  })
})

describe('a removal, through the boundary', () => {
  const answers: readonly AnswerGiven[] = [
    {
      submissionId: intakeSubmissionId('00000000-0000-4000-8000-000000000101'),
      personId: personId('00000000-0000-4000-8000-000000000201'),
      submittedAt: new Date('2026-09-01T09:00:00Z'),
      answer: ['monday:08', 'monday:09'],
    },
    // A superseded submission of the same Person, which the delete takes too.
    {
      submissionId: intakeSubmissionId('00000000-0000-4000-8000-000000000102'),
      personId: personId('00000000-0000-4000-8000-000000000201'),
      submittedAt: new Date('2026-09-20T09:00:00Z'),
      answer: ['tuesday:18'],
    },
    {
      submissionId: intakeSubmissionId('00000000-0000-4000-8000-000000000103'),
      personId: personId('00000000-0000-4000-8000-000000000202'),
      submittedAt: new Date('2026-09-21T09:00:00Z'),
      answer: ['friday:12'],
    },
  ]

  const edit = (command: Command, extra: Partial<CommandContext> = {}) =>
    handleCommand(command, {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      intakeForm: mentorAndMentee,
      ...extra,
    } satisfies CommandContext)

  const removal = (key: string, form: 'discipleship' | 'group' = 'discipleship'): Command => ({
    type: 'intake_form.remove_question',
    ministryId: ministry,
    form,
    key,
    editedBy: 'admin-user',
  })

  const history = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))
  const deleted = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'intakeForm.removeAnswers' ? [effect.removal] : []))
  const saved = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'intakeForm.save' ? [effect.saving.form] : []))

  it('saves the form without it, deletes its answers, and records in history what they said', () => {
    const { effects } = edit(removal('availability'), { questionAnswers: answers })

    expect(saved(effects).map(keysOf)).toEqual([keysOf(mentorAndMentee).filter((key) => key !== 'availability')])
    expect(deleted(effects)).toEqual([{ ministryId: ministry, form: 'discipleship', key: 'availability' }])
    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'intake_form.question_removed',
        subjectType: 'ministry',
        subjectId: ministry,
        payload: {
          form: 'discipleship',
          version: 1,
          editedBy: 'admin-user',
          key: 'availability',
          question: {
            wording: 'When could you meet?',
            menteeWording: null,
            hint: 'Select every hour that could work — not just your best one.',
            required: true,
          },
          // People, as the Admin was warned; every submission, as the delete takes.
          answersLost: 2,
          deletedAnswers: [
            {
              submissionId: '00000000-0000-4000-8000-000000000101',
              personId: '00000000-0000-4000-8000-000000000201',
              submittedAt: '2026-09-01T09:00:00.000Z',
              answer: ['monday:08', 'monday:09'],
            },
            {
              submissionId: '00000000-0000-4000-8000-000000000102',
              personId: '00000000-0000-4000-8000-000000000201',
              submittedAt: '2026-09-20T09:00:00.000Z',
              answer: ['tuesday:18'],
            },
            {
              submissionId: '00000000-0000-4000-8000-000000000103',
              personId: '00000000-0000-4000-8000-000000000202',
              submittedAt: '2026-09-21T09:00:00.000Z',
              answer: ['friday:12'],
            },
          ],
        },
      },
    ])
  })

  it('fails loudly where the answers about to be deleted were never read', () => {
    expect(() => edit(removal('gender'))).toThrow('No answers were loaded')
  })

  it('deletes nothing for the email, and records that it cost nothing', () => {
    const { effects } = edit(removal('email'))
    expect(deleted(effects)).toEqual([])
    expect(history(effects)[0]!.payload).toMatchObject({ key: 'email', answersLost: 0, deletedAnswers: [] })
  })

  it('refuses the name and the number, and writes nothing', () => {
    expect(() => edit(removal('phone'))).toThrow(IntakeFormRefused)
    expect(() => edit(removal('phone'))).toThrow(expect.objectContaining({ refusal: 'intake_form.always_asked' }))
  })

  it('records a question added back as a question added, in the words it came back in', () => {
    const { effects } = edit(
      {
        type: 'intake_form.add_back_question',
        ministryId: ministry,
        form: 'discipleship',
        pageId: 'about-you',
        key: 'gender',
        editedBy: 'admin-user',
      },
      { intakeForm: without(mentorAndMentee, 'gender') },
    )
    expect(deleted(effects)).toEqual([])
    expect(history(effects)[0]).toMatchObject({
      type: 'intake_form.question_added',
      payload: {
        form: 'discipleship',
        version: 2,
        key: 'gender',
        pageId: 'about-you',
        wording: 'Gender',
        required: true,
      },
    })
  })
})

describe('a submission to a form that no longer asks something', () => {
  const answered: IntakeFormFields = {
    fullName: 'Emily Johnson',
    phone: '(555) 234-9911',
    email: null,
    ageBand: null,
    gender: null,
    goalId: null,
    goalOther: null,
    availability: [],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: 'discipleship',
    declaredSide: null,
    experience: null,
    groupId: null,
  }

  const removedFrom = (form: IntakeForm) => new Set<BuiltInQuestion>(removedQuestions(form))
  const bare = without(mentorAndMentee, 'gender', 'ageBand', 'availability', 'goalId', 'experience', 'side', 'email')

  it('is taken without any of them, and records none of them', () => {
    const reading = readIntakeForm(answered, requiredOn(bare), [], removedFrom(bare))
    expect(reading).toMatchObject({
      submission: { ageBand: null, gender: null, availability: [], goalId: null, declaredSide: null, firstTime: null },
    })
  })

  it('refuses an answer to a question it no longer asks: that is not the form Discipler served', () => {
    for (const extra of [{ gender: 'female' }, { ageBand: '25-34' }, { availability: ['monday:08'] }, { goalId: 'other', goalOther: 'Grief' }]) {
      expect(readIntakeForm({ ...answered, ...extra }, requiredOn(bare), [], removedFrom(bare))).toEqual({
        refusals: ['intake.path_unknown'],
      })
    }
  })

  it('is still refused without them where the form asks them', () => {
    expect(readIntakeForm(answered, requiredOn(mentorAndMentee))).toMatchObject({
      refusals: expect.arrayContaining([
        'intake.side_unknown',
        'intake.availability_not_selected',
        'intake.age_band_unknown',
        'intake.gender_unknown',
        'intake.goal_not_selected',
      ]),
    })
  })

  it('takes the groups form with no group asked as somebody with no group in mind, for an Admin to place', () => {
    const noGroup = without(groups, 'groupId')
    const { effects } = handleCommand(
      {
        type: 'intake.submit',
        ministryId: ministry,
        form: { ...answered, intakePath: 'group', ageBand: '25-34', gender: 'male', availability: ['monday:08'] },
        formVersion: noGroup.version,
      },
      {
        ministryId: ministry,
        clock: createTestClock(at),
        ids: createSequentialIds(),
        ministryName: 'Riverside Chapel',
        appBaseUrl: 'https://discipler.test',
        roster: {
          people: new Map(),
          namesByNumber: new Map(),
          whoCompletedIntake: new Set<PersonId>(),
          removed: new Set<PersonId>(),
        },
        intakeForm: noGroup,
      } satisfies CommandContext,
    )
    expect(effects.some((effect) => effect.kind === 'followUp.raise' && effect.item.kind === 'group_placement_wanted')).toBe(true)
  })

  it('is refused on the groups form where a group is named it no longer asks for', () => {
    const noGroup = without(groups, 'groupId')
    expect(() =>
      handleCommand(
        {
          type: 'intake.submit',
          ministryId: ministry,
          form: {
            ...answered,
            intakePath: 'group',
            ageBand: '25-34',
            gender: 'male',
            availability: ['monday:08'],
            groupId: '00000000-0000-4000-8000-000000000301',
          },
          formVersion: noGroup.version,
        },
        {
          ministryId: ministry,
          clock: createTestClock(at),
          ids: createSequentialIds(),
          ministryName: 'Riverside Chapel',
          appBaseUrl: 'https://discipler.test',
          roster: {
            people: new Map(),
            namesByNumber: new Map(),
            whoCompletedIntake: new Set<PersonId>(),
            removed: new Set<PersonId>(),
          },
          intakeForm: noGroup,
        } satisfies CommandContext,
      ),
    ).toThrow(IntakeRefused)
  })
})

describe('Suggested Pairs, once the form no longer asks what it reads', () => {
  let made = 0
  const someone = (name: string, overrides: Partial<SuggestionCandidate> = {}): SuggestionCandidate => {
    made += 1
    return {
      personId: personId(name),
      fullName: name,
      gender: null,
      ageBand: null,
      goal: null,
      availability: [
        { day: 'monday', hour: '08' },
        { day: 'monday', hour: '09' },
      ],
      intakeSubmittedAt: new Date(Date.UTC(2026, 8, 1, 0, made)),
      consentsToTexts: true,
      optedOut: false,
      declaredSide: null,
      memberships: [],
      ...overrides,
    }
  }
  const settings = { suggestGenderMatch: true, suggestMaxAgeBandGap: 1 }
  const unasked = (...questions: SuggestionQuestion[]) => new Set(questions)
  const pairs = (roster: SuggestionCandidate[], ...questions: SuggestionQuestion[]) =>
    suggest(roster, settings, undefined, unasked(...questions)).pairs.map(
      (pair) => `${pair.leader.fullName} -> ${pair.participant.fullName}`,
    )

  it('suggests nobody, and lists nobody, without availability', () => {
    const roster = [
      someone('Grace', { declaredSide: 'mentor', gender: 'female', ageBand: '45-54' }),
      someone('Ana', { gender: 'female', ageBand: '25-34' }),
    ]
    expect(suggest(roster, settings, undefined, unasked('availability'))).toEqual({ pairs: [], noScheduleOverlap: [] })
  })

  it('does not hold a suggestion to the gender rule or the age rule the form no longer asks for', () => {
    const roster = [someone('Grace', { declaredSide: 'mentor' }), someone('Ana')]
    expect(pairs(roster, 'gender', 'ageBand')).toEqual(['Grace -> Ana'])
  })

  it('suggests nobody without a gender, or without an age band, while the form still asks them', () => {
    const roster = [someone('Grace', { declaredSide: 'mentor' }), someone('Ana')]
    expect(pairs(roster)).toEqual([])
    expect(pairs(roster, 'gender')).toEqual([])
    expect(pairs(roster, 'ageBand')).toEqual([])
  })
})
