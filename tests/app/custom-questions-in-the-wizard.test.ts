import { describe, expect, it } from 'vitest'
import { addQuestion, presetForm, type FormEdit, type IntakeForm, type OwnQuestion } from '~/domain/intake-form'
import { choiceWordsOf, type OwnAnswerShown } from '~/domain/own-answers'
import { refusalMessages } from '../../app/intake/copy'
import { groupWizardFor } from '../../app/intake/group-wizard-answers'
import { ownAnswersAsQuery } from '../../app/intake/submitted-form'
import { discipleshipWizardFor } from '../../app/intake/wizard-answers'
import { saidOf } from '../../app/own-answers'

/**
 * The wizard asks a Ministry's own questions where the form puts them (Pastor
 * feedback 2026-10, ticket 12). A choice question's answers are ids the form
 * served, so they travel between screens in the URL as the built-in answers do;
 * a question somebody types into is asked on the last page and posted from it,
 * and never travels.
 */

const saved = (edit: FormEdit): IntakeForm => {
  if (edit === null || 'refusal' in edit) throw new Error(`Expected a saved form, got ${JSON.stringify(edit)}`)
  return edit.form
}

let next = 0
const newId = () => `c${++next}`
const add = (
  form: IntakeForm,
  page: string,
  key: `custom:${string}`,
  kind: string,
  wording: string,
  required: boolean,
  choices: readonly string[] = [],
) =>
  saved(addQuestion(form, page, key, kind, { wording, menteeWording: null, hint: '', required, choices: { kept: [], added: choices } }, newId))

// Page 1 gains a yes/no; page 2 a required several-choices; the last page a one
// choice and both text kinds.
let form = presetForm('discipleship')
form = add(form, 'welcome', 'custom:member', 'yes_no', 'Are you a member?', false)
form = add(form, 'about-you', 'custom:help', 'several_choices', 'Where could you help?', true, ['Music', 'Kids', 'Welcome'])
form = add(form, 'last', 'custom:church', 'one_choice', 'Which service?', true, ['9am', '11am'])
form = add(form, 'last', 'custom:prayer', 'short_text', 'A prayer request?', false)
form = add(form, 'last', 'custom:story', 'long_text', 'Anything else?', false)

const wizard = discipleshipWizardFor(form)

describe('the Ministry’s own questions in the wizard', () => {
  it('asks each choice question on its own page, and carries none of the typed ones', () => {
    expect(wizard.asksAt(1)).toEqual(['side', 'custom:member'])
    expect(wizard.asksAt(2)).toEqual(['ageBand', 'gender', 'custom:help'])
    expect(wizard.asksAt(wizard.LAST_STEP)).toEqual(['custom:church'])
    expect(wizard.OWN_FIELDS.map((field) => field.key)).toEqual(['custom:member', 'custom:help', 'custom:church'])
  })

  it('keeps only the choices a question offered, one where it takes one', () => {
    const answers = wizard.readAnswers({
      'custom:member': ['yes', 'no'],
      'custom:help': ['c3', 'c1', 'c3', 'c99', '<script>'],
      'custom:church': 'c1',
      'custom:prayer': 'For my mum',
    })
    expect(answers.own).toEqual({
      'custom:member': ['yes'],
      'custom:help': ['c3', 'c1'],
      'custom:church': [],
    })
  })

  it('carries the answers from screen to screen, and back again', () => {
    const answers = wizard.readAnswers({ side: 'mentee', 'custom:member': 'no', 'custom:help': ['c1', 'c2'] })
    const query = wizard.answersAsQuery(answers, 'link', 2, { version: form.version, preview: false })
    expect(query.getAll('custom:member')).toEqual(['no'])
    expect(query.getAll('custom:help')).toEqual(['c1', 'c2'])
    expect(wizard.readAnswers(Object.fromEntries([...new Set(query.keys())].map((key) => [key, query.getAll(key)]))).own).toEqual(
      answers.own,
    )
    // Not carried as hidden by the screen that asks it.
    expect(wizard.notCarriedAt(2)).toContain('custom:help')
    expect(wizard.notCarriedAt(3)).not.toContain('custom:help')
  })

  it('holds somebody on a screen whose required ticks are empty, and says why', () => {
    const toPageTwo = { side: 'mentee', ageBand: '25-34', gender: 'female' }
    expect(wizard.furthestStep(wizard.readAnswers(toPageTwo))).toBe(2)
    expect(wizard.stuckOnOwnQuestion('3', wizard.readAnswers(toPageTwo))).toBe(true)
    expect(wizard.stuckOnOwnQuestion('2', wizard.readAnswers(toPageTwo))).toBe(false)
    expect(wizard.furthestStep(wizard.readAnswers({ ...toPageTwo, 'custom:help': 'c2' }))).toBe(3)
    expect(refusalMessages('intake.question_unanswered')).toEqual([
      'Please answer every question that is not marked optional.',
    ])
  })

  it('lets an optional question be left', () => {
    expect(wizard.furthestStep(wizard.readAnswers({ side: 'mentor' }))).toBe(2)
  })

  it('goes back to the last step with the choices a refusal came back with, and never what was typed', () => {
    const own = ownAnswersAsQuery({
      fullName: null,
      phone: null,
      email: null,
      ageBand: null,
      gender: null,
      goalId: null,
      goalOther: null,
      availability: [],
      smsConsent: false,
      contactSharing: null,
      source: null,
      intakePath: 'discipleship',
      declaredSide: null,
      experience: null,
      groupId: null,
      own: { 'custom:church': ['c4'], 'custom:prayer': ['For my mum'] },
    })
    const back = wizard.answersAsQuery(wizard.readAnswers(own), 'link', wizard.LAST_STEP)
    expect(back.getAll('custom:church')).toEqual(['c4'])
    expect(back.has('custom:prayer')).toBe(false)
  })

  it('asks the groups form’s own questions the same way', () => {
    const groups = add(presetForm('group'), 'about-you', 'custom:diet', 'yes_no', 'Any dietary needs?', true)
    const groupWizard = groupWizardFor(groups)
    expect(groupWizard.asksAt(1)).toEqual(['ageBand', 'gender', 'custom:diet'])
    expect(groupWizard.readAnswers({ 'custom:diet': 'yes' }).own).toEqual({ 'custom:diet': ['yes'] })
  })
})

describe('what an Admin reads', () => {
  const question = (key: string) => form.pages.flatMap((page) => page.questions).find((each) => each.key === key) as OwnQuestion
  const said = (answer: OwnAnswerShown) => saidOf(answer)

  it('says each kind of answer in words', () => {
    expect(said({ question: question('custom:member'), value: true })).toBe('Yes')
    expect(said({ question: question('custom:member'), value: false })).toBe('No')
    expect(said({ question: question('custom:help'), value: ['c1', 'c3'] })).toBe('Music, Welcome')
    expect(said({ question: question('custom:church'), value: 'c5' })).toBe('11am')
    expect(said({ question: question('custom:story'), value: 'One.\nTwo.' })).toBe('One.\nTwo.')
    expect(choiceWordsOf(question('custom:help'), ['c2'])).toEqual(['Kids'])
  })
})
