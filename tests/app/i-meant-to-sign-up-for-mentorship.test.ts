import { describe, expect, it } from 'vitest'
import { addQuestion, presetForm, removeQuestion, type FormEdit, type IntakeForm } from '~/domain/intake-form'
import { MEANT_FOR_MENTORSHIP_LINK, MEANT_FOR_MENTORSHIP_QUESTION } from '../../app/intake/copy'
import { groupWizard, groupWizardFor, mentorshipSwitchQuery } from '../../app/intake/group-wizard-answers'
import {
  AGE_AND_GENDER_STEP,
  AVAILABILITY_STEP,
  discipleshipWizardFor,
  FIRST_TIME_STEP,
  LAST_STEP,
  SIDE_STEP,
  answersAsQuery,
  furthestStep,
  readWizardAnswers,
  stepToShow,
  type WizardQuery,
} from '../../app/intake/wizard-answers'

/**
 * Group form exits, ticket 02: the line under step three's actions that takes
 * somebody who meant the discipleship form across to it (S-7), with what they
 * already answered carried in the query string, so the discipleship wizard opens
 * on the mentor-or-mentee question with those screens already answered.
 */

const saved = (edit: FormEdit): IntakeForm => {
  if (edit === null || 'refusal' in edit) throw new Error(`Expected a saved form, got ${JSON.stringify(edit)}`)
  return edit.form
}

/** A query string as the page receives it: every name, with one value or many. */
const asQuery = (params: URLSearchParams): WizardQuery =>
  Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]))

const group = '00000000-0000-4000-8000-0000000000b1'

/** Step three of the preset group form, reached by answering the first two screens. */
const atStepThree = groupWizard.readAnswers(
  { ageBand: '25-34', gender: 'male', availability: ['tuesday:18', 'thursday:18'] },
  { groupId: [group] },
)

const preset = {
  groupForm: presetForm('group'),
  discipleshipForm: presetForm('discipleship'),
  answers: atStepThree,
  via: 'link',
  preview: false,
} as const

describe('the switch to the discipleship wizard', () => {
  it('says the line as S-7 draws it', () => {
    expect(MEANT_FOR_MENTORSHIP_QUESTION).toBe('Looking for one-to-one discipleship instead?')
    expect(MEANT_FOR_MENTORSHIP_LINK).toBe('I meant to sign up for mentorship')
  })

  it('carries the age band, the gender and the availability, pinned to the form it opens', () => {
    const query = mentorshipSwitchQuery(preset)
    expect(query.get('step')).toBe(String(SIDE_STEP))
    expect(query.get('v')).toBe('0')
    expect(query.get('ageBand')).toBe('25-34')
    expect(query.get('gender')).toBe('male')
    expect(query.getAll('availability')).toEqual(['tuesday:18', 'thursday:18'])
    expect([...new Set(query.keys())].sort()).toEqual(['ageBand', 'availability', 'gender', 'step', 'v'])
  })

  it('carries how they reached the form, and an Admin’s preview stays a preview', () => {
    const query = mentorshipSwitchQuery({ ...preset, via: 'qr', preview: true })
    expect(query.get('via')).toBe('qr')
    expect(query.get('preview')).toBe('1')
  })

  it('never carries the group, even one chosen and come back from', () => {
    const cameBack = groupWizard.readAnswers(
      { ageBand: '25-34', gender: 'male', availability: ['tuesday:18'], groupId: group },
      { groupId: [group] },
    )
    expect(cameBack.groupId).toBe(group)
    expect(mentorshipSwitchQuery({ ...preset, answers: cameBack }).has('groupId')).toBe(false)
  })

  it('opens the discipleship wizard on the mentor-or-mentee question with the rest already answered', () => {
    const query = asQuery(mentorshipSwitchQuery(preset))
    const answers = readWizardAnswers(query)
    expect(answers).toMatchObject({
      side: null,
      ageBand: '25-34',
      gender: 'male',
      experience: null,
      availability: ['tuesday:18', 'thursday:18'],
    })
    expect(stepToShow(query.step, answers)).toBe(SIDE_STEP)
  })

  it('lets Continue move past the carried screens once the side is given, and Back show them filled', () => {
    const query = asQuery(mentorshipSwitchQuery(preset))
    const sideGiven = readWizardAnswers({ ...query, side: 'mentee' })
    // The age and gender screen is passed: the first unanswered one is the first-time question.
    expect(furthestStep(sideGiven)).toBe(FIRST_TIME_STEP)
    expect(stepToShow(String(AGE_AND_GENDER_STEP), sideGiven)).toBe(AGE_AND_GENDER_STEP)

    const back = asQuery(answersAsQuery(sideGiven, 'link', AGE_AND_GENDER_STEP))
    expect(readWizardAnswers(back)).toMatchObject({ ageBand: '25-34', gender: 'male' })

    const firstTimeGiven = readWizardAnswers({ ...query, side: 'mentee', experience: 'first_time' })
    expect(furthestStep(firstTimeGiven)).toBe(LAST_STEP)
    expect(stepToShow(String(AVAILABILITY_STEP), firstTimeGiven)).toBe(AVAILABILITY_STEP)
  })
})

describe('the switch across two forms a Ministry has edited', () => {
  it('carries nothing the group form did not ask, whatever the URL says', () => {
    const groupForm = saved(removeQuestion(presetForm('group'), 'ageBand'))
    // A hand-written ageBand on a form that does not ask it is read, but not carried across.
    const answers = groupWizardFor(groupForm).readAnswers(
      { ageBand: '25-34', gender: 'male', availability: ['tuesday:18'] },
      { groupId: [group] },
    )
    const query = mentorshipSwitchQuery({ ...preset, groupForm, answers })
    expect(query.has('ageBand')).toBe(false)
    expect(query.get('gender')).toBe('male')
    expect(query.getAll('availability')).toEqual(['tuesday:18'])
  })

  it('carries nothing the discipleship form no longer asks, which its submission would refuse', () => {
    const discipleshipForm = saved(removeQuestion(presetForm('discipleship'), 'gender'))
    const query = mentorshipSwitchQuery({ ...preset, discipleshipForm })
    expect(query.has('gender')).toBe(false)
    expect(query.get('ageBand')).toBe('25-34')
    expect(query.get('v')).toBe(String(discipleshipForm.version))
  })

  it('opens on the first question the discipleship form still has unanswered', () => {
    // A form that asks no availability and no side opens past both.
    const noFirstTime = saved(removeQuestion(presetForm('discipleship'), 'experience'))
    const discipleshipForm = saved(removeQuestion(noFirstTime, 'side'))
    const wizard = discipleshipWizardFor(discipleshipForm)
    const query = mentorshipSwitchQuery({ ...preset, discipleshipForm })
    expect(query.get('step')).toBe(String(wizard.LAST_STEP))
    expect(wizard.stepToShow(query.get('step') ?? undefined, wizard.readAnswers(asQuery(query)))).toBe(
      wizard.LAST_STEP,
    )
  })

  it('carries none of the group form’s own questions, which are that form’s alone', () => {
    let next = 0
    const groupForm = saved(
      addQuestion(
        presetForm('group'),
        'about-you',
        'custom:member',
        'yes_no',
        { wording: 'Are you a member?', menteeWording: null, hint: '', required: false, choices: { kept: [], added: [] } },
        () => `c${++next}`,
      ),
    )
    const answers = groupWizardFor(groupForm).readAnswers(
      { ageBand: '25-34', gender: 'male', availability: ['tuesday:18'], 'custom:member': 'yes' },
      { groupId: [group] },
    )
    expect(answers.own).toEqual({ 'custom:member': ['yes'] })
    expect(mentorshipSwitchQuery({ ...preset, groupForm, answers }).has('custom:member')).toBe(false)
  })
})
