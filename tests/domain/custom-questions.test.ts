import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, type PersonId } from '~/domain/ids'
import { intakeLinkToken } from '~/domain/intake-link'
import { readIntakeForm, type IntakeFormFields } from '~/domain/intake'
import {
  addQuestion,
  arrangeQuestions,
  editQuestion,
  isOwnQuestion,
  layoutOf,
  moveQuestion,
  ownQuestionsOf,
  presetForm,
  questionOn,
  type FormEdit,
  type IntakeForm,
  type OwnQuestion,
} from '~/domain/intake-form'
import { choiceWordsOf, ownAnswersShown } from '~/domain/own-answers'
import { asDefinition, intakeFormFrom } from '~/platform/supabase/intake-form-document'

/**
 * A Ministry adds questions of its own to either form (Pastor feedback 2026-10,
 * ticket 12): short text, long text, one choice, several choices or yes/no. The
 * wizard asks them, their answers are kept beside the submission, and they show to
 * an Admin under the question as the Ministry words it now. They are never matched
 * on, which `tests/integration/custom-questions.test.ts` proves against the
 * database's pairing reads.
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
  if (edit === null || !('refusal' in edit)) throw new Error(`Expected a refusal, got ${JSON.stringify(edit)}`)
  return edit.refusal
}

/** An id source a test can read back: `c1`, `c2`, ... */
const counting = () => {
  let issued = 0
  return () => `c${++issued}`
}

const typed = (
  wording: string,
  extra: { readonly hint?: string; readonly required?: boolean; readonly added?: readonly string[] } = {},
) => ({
  wording,
  menteeWording: null,
  hint: extra.hint ?? '',
  required: extra.required ?? false,
  choices: { kept: [], added: extra.added ?? [] },
})

const own = (form: IntakeForm, key: string): OwnQuestion => {
  const question = questionOn(form, key)
  if (!question || !isOwnQuestion(question)) throw new Error(`No question of the Ministry's own under ${key}`)
  return question
}

/** The mentor and mentee form with one of each kind: the choices on page 2, the typed ones last. */
const withOneOfEach = (() => {
  const newId = counting()
  let form = mentorAndMentee
  form = formOf(addQuestion(form, 'about-you', 'custom:church', 'one_choice', typed('Which service do you attend?', { required: true, added: ['9am', '11am'] }), newId))
  form = formOf(addQuestion(form, 'about-you', 'custom:help', 'several_choices', typed('Where could you help?', { added: ['Music', 'Kids', 'Welcome'] }), newId))
  form = formOf(addQuestion(form, 'about-you', 'custom:member', 'yes_no', typed('Are you a member?'), newId))
  form = formOf(addQuestion(form, 'last', 'custom:prayer', 'short_text', typed('A prayer request?'), newId))
  form = formOf(addQuestion(form, 'last', 'custom:story', 'long_text', typed('Anything else you would like us to know?'), newId))
  return form
})()

describe('adding a question of the Ministry’s own', () => {
  it('adds each of the five kinds at the foot of its page, as the next version', () => {
    expect(withOneOfEach.version).toBe(5)
    expect(withOneOfEach.pages[1]!.questions.map((question) => question.key)).toEqual([
      'ageBand',
      'gender',
      'custom:church',
      'custom:help',
      'custom:member',
    ])
    expect(withOneOfEach.pages[5]!.questions.map((question) => question.key)).toEqual([
      'goalId',
      'fullName',
      'phone',
      'email',
      'custom:prayer',
      'custom:story',
    ])
    expect(own(withOneOfEach, 'custom:church')).toEqual({
      key: 'custom:church',
      wording: 'Which service do you attend?',
      menteeWording: null,
      hint: null,
      required: true,
      kind: 'one_choice',
      choices: [
        { id: 'c1', wording: '9am' },
        { id: 'c2', wording: '11am' },
      ],
    })
    expect(own(withOneOfEach, 'custom:member').choices).toEqual([])
    expect(own(withOneOfEach, 'custom:story')).toMatchObject({ kind: 'long_text', required: false, choices: [] })
    expect(ownQuestionsOf(withOneOfEach).map((question) => question.key)).toEqual([
      'custom:church',
      'custom:help',
      'custom:member',
      'custom:prayer',
      'custom:story',
    ])
  })

  it('adds to the groups form as well', () => {
    const form = formOf(addQuestion(groups, 'last', 'custom:diet', 'short_text', typed('Any dietary needs?'), counting()))
    expect(ownQuestionsOf(form).map((question) => question.wording)).toEqual(['Any dietary needs?'])
  })

  it('asks a question somebody types into on the last page only, so what is typed never goes in a web address', () => {
    for (const kind of ['short_text', 'long_text']) {
      expect(refusalOf(addQuestion(mentorAndMentee, 'about-you', 'custom:x', kind, typed('Tell us'), counting()))).toBe(
        'intake_form.stays_on_the_last_page',
      )
    }
    const typedLast = formOf(addQuestion(mentorAndMentee, 'last', 'custom:x', 'short_text', typed('Tell us'), counting()))
    // Up past the goal at the top of the last page is onto the page before it.
    const topOfLast = formOf(arrangeQuestions(typedLast, layoutOf(typedLast).map((page) =>
      page.pageId === 'last' ? { ...page, keys: ['custom:x', ...page.keys.filter((key) => key !== 'custom:x')] } : page,
    )))
    expect(moveQuestion(topOfLast, 'custom:x', 'up')).toEqual({ refusal: 'intake_form.stays_on_the_last_page' })
  })

  it('lets a choice question go on any page, and be dragged between them', () => {
    const moved = formOf(
      arrangeQuestions(
        withOneOfEach,
        layoutOf(withOneOfEach).map((page) =>
          page.pageId === 'welcome'
            ? { ...page, keys: ['custom:member', ...page.keys] }
            : { ...page, keys: page.keys.filter((key) => key !== 'custom:member') },
        ),
      ),
    )
    expect(moved.pages[0]!.questions.map((question) => question.key)).toEqual(['custom:member', 'side'])
  })

  it('refuses a question with no wording, a choice question with fewer than two choices, and two choices worded alike', () => {
    expect(refusalOf(addQuestion(mentorAndMentee, 'last', 'custom:x', 'yes_no', typed('  '), counting()))).toBe(
      'intake_form.question_needs_wording',
    )
    expect(
      refusalOf(addQuestion(mentorAndMentee, 'last', 'custom:x', 'one_choice', typed('Which?', { added: ['Only one', ' '] }), counting())),
    ).toBe('intake_form.needs_two_choices')
    expect(
      refusalOf(addQuestion(mentorAndMentee, 'last', 'custom:x', 'several_choices', typed('Which?', { added: ['Kids', ' kids '] }), counting())),
    ).toBe('intake_form.choices_repeat')
  })

  it('refuses a kind it does not know, a page that is not on the form, and a key already asked', () => {
    expect(refusalOf(addQuestion(mentorAndMentee, 'last', 'custom:x', 'hourly_grid', typed('When?'), counting()))).toBe(
      'intake_form.kind_unknown',
    )
    expect(refusalOf(addQuestion(mentorAndMentee, 'nowhere', 'custom:x', 'yes_no', typed('Yes?'), counting()))).toBe(
      'intake_form.not_found',
    )
    expect(
      refusalOf(addQuestion(withOneOfEach, 'last', 'custom:member', 'yes_no', typed('Again?'), counting())),
    ).toBe('intake_form.changed')
  })

  it('ignores choices typed under a kind that has none', () => {
    const form = formOf(addQuestion(mentorAndMentee, 'last', 'custom:x', 'yes_no', typed('Yes?', { added: ['A', 'B'] }), counting()))
    expect(own(form, 'custom:x').choices).toEqual([])
  })
})

describe('editing a question of the Ministry’s own', () => {
  const church = own(withOneOfEach, 'custom:church')

  it('rewords a choice in place, so every answer pointing at it keeps pointing at it', () => {
    const form = formOf(
      editQuestion(
        withOneOfEach,
        'custom:church',
        {
          wording: church.wording,
          menteeWording: null,
          hint: '',
          required: true,
          choices: { kept: [{ id: 'c1', wording: '9:00 service' }, { id: 'c2', wording: '11am' }], added: ['Evening'] },
        },
        () => 'c99',
      ),
    )
    expect(own(form, 'custom:church').choices).toEqual([
      { id: 'c1', wording: '9:00 service' },
      { id: 'c2', wording: '11am' },
      { id: 'c99', wording: 'Evening' },
    ])
  })

  it('keeps a choice somebody else added while this row was open', () => {
    const form = formOf(
      editQuestion(withOneOfEach, 'custom:church', {
        wording: 'Which service?',
        menteeWording: null,
        hint: '',
        required: true,
        choices: { kept: [{ id: 'c1', wording: '9am' }], added: [] },
      }),
    )
    expect(own(form, 'custom:church').choices.map((choice) => choice.id)).toEqual(['c1', 'c2'])
  })

  it('refuses a choice emptied: taking one off is the removal rule, not an edit', () => {
    expect(
      refusalOf(
        editQuestion(withOneOfEach, 'custom:church', {
          wording: church.wording,
          menteeWording: null,
          hint: '',
          required: true,
          choices: { kept: [{ id: 'c1', wording: '' }, { id: 'c2', wording: '11am' }], added: [] },
        }),
      ),
    ).toBe('intake_form.choice_kept')
  })

  it('makes it optional or required, and changes nothing where nothing changed', () => {
    const optional = formOf(
      editQuestion(withOneOfEach, 'custom:church', {
        wording: church.wording,
        menteeWording: null,
        hint: '',
        required: false,
        choices: { kept: church.choices.map(({ id, wording }) => ({ id, wording })), added: [] },
      }),
    )
    expect(own(optional, 'custom:church').required).toBe(false)
    expect(
      editQuestion(withOneOfEach, 'custom:church', {
        wording: church.wording,
        menteeWording: null,
        hint: '',
        required: true,
        choices: { kept: church.choices.map(({ id, wording }) => ({ id, wording })), added: [] },
      }),
    ).toBeNull()
  })

  it('rewords a question, keeping its key and so its answers', () => {
    const form = formOf(
      editQuestion(withOneOfEach, 'custom:story', {
        wording: 'Anything else?',
        menteeWording: null,
        hint: 'Only our pastors read this.',
        required: false,
      }),
    )
    expect(own(form, 'custom:story')).toMatchObject({
      key: 'custom:story',
      wording: 'Anything else?',
      hint: 'Only our pastors read this.',
      kind: 'long_text',
    })
  })
})

describe('the stored document', () => {
  it('reads back every question of the Ministry’s own as it was written', () => {
    expect(intakeFormFrom('discipleship', 5, JSON.parse(JSON.stringify(asDefinition(withOneOfEach))))).toEqual(
      withOneOfEach,
    )
  })

  it('refuses a stored question of a kind it cannot name', () => {
    const definition = asDefinition(withOneOfEach) as { pages: { questions: Record<string, unknown>[] }[] }
    definition.pages[5]!.questions[5]!.kind = 'essay'
    expect(() => intakeFormFrom('discipleship', 5, definition)).toThrow(/kind it cannot name/)
  })
})

describe('reading the answers', () => {
  const fields: IntakeFormFields = {
    fullName: 'Ana Ruiz',
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
  const asked = ownQuestionsOf(withOneOfEach)
  const read = (sent: Record<string, readonly string[]>) => readIntakeForm({ ...fields, own: sent }, undefined, asked)

  it('reads one answer of each kind, the several in the form’s order and the long text with its lines', () => {
    const reading = read({
      'custom:church': ['c2'],
      'custom:help': ['c5', 'c3', 'c5'],
      'custom:member': ['no'],
      'custom:prayer': ['  For my  mum  '],
      'custom:story': ['First line.\r\n\r\nSecond line.  '],
    })
    if (!('submission' in reading)) throw new Error(JSON.stringify(reading))
    expect(reading.submission.ownAnswers).toEqual([
      { key: 'custom:church', value: 'c2' },
      { key: 'custom:help', value: ['c3', 'c5'] },
      { key: 'custom:member', value: false },
      { key: 'custom:prayer', value: 'For my mum' },
      { key: 'custom:story', value: 'First line.\n\nSecond line.' },
    ])
  })

  it('leaves an optional question unanswered, and refuses a required one left empty', () => {
    const reading = read({ 'custom:church': ['c1'] })
    if (!('submission' in reading)) throw new Error(JSON.stringify(reading))
    expect(reading.submission.ownAnswers).toEqual([{ key: 'custom:church', value: 'c1' }])

    expect(read({})).toEqual({ refusals: ['intake.question_unanswered'] })
    expect(read({ 'custom:church': [''] })).toEqual({ refusals: ['intake.question_unanswered'] })
  })

  it('refuses a choice the form did not offer, two where it takes one, and an answer to a question it does not ask', () => {
    expect(read({ 'custom:church': ['c9'] })).toEqual({ refusals: ['intake.answer_unreadable'] })
    expect(read({ 'custom:church': ['c1', 'c2'] })).toEqual({ refusals: ['intake.answer_unreadable'] })
    expect(read({ 'custom:church': ['c1'], 'custom:member': ['maybe'] })).toEqual({
      refusals: ['intake.answer_unreadable'],
    })
    expect(read({ 'custom:church': ['c1'], 'custom:elsewhere': ['x'] })).toEqual({
      refusals: ['intake.answer_unreadable'],
    })
  })

  it('refuses more typed than the box takes', () => {
    expect(read({ 'custom:church': ['c1'], 'custom:prayer': ['x'.repeat(201)] })).toEqual({
      refusals: ['intake.answer_too_long'],
    })
  })

  it('keeps typed words that happen to look like a refusal', () => {
    const reading = read({ 'custom:church': ['c1'], 'custom:prayer': ['intake.question_unanswered'] })
    if (!('submission' in reading)) throw new Error(JSON.stringify(reading))
    expect(reading.submission.ownAnswers[1]).toEqual({ key: 'custom:prayer', value: 'intake.question_unanswered' })
  })

  it('reads a form that asks none of the Ministry’s own as before', () => {
    const reading = readIntakeForm(fields)
    if (!('submission' in reading)) throw new Error(JSON.stringify(reading))
    expect(reading.submission.ownAnswers).toEqual([])
  })
})

describe('what an Admin is shown', () => {
  const reworded = formOf(
    editQuestion(withOneOfEach, 'custom:church', {
      wording: 'Which service?',
      menteeWording: null,
      hint: '',
      required: true,
      choices: { kept: [{ id: 'c1', wording: 'Early' }, { id: 'c2', wording: 'Late' }], added: [] },
    }),
  )

  it('shows each answer under the question as the form words it now, in the order the form asks them', () => {
    const shown = ownAnswersShown(
      [reworded, groups],
      [
        { key: 'custom:story', value: 'Line one.\nLine two.' },
        { key: 'custom:church', value: 'c1' },
        { key: 'custom:help', value: ['c3', 'c5'] },
        { key: 'custom:member', value: true },
      ],
    )
    expect(shown.map(({ question, value }) => [question.wording, value])).toEqual([
      ['Which service?', 'c1'],
      ['Where could you help?', ['c3', 'c5']],
      ['Are you a member?', true],
      ['Anything else you would like us to know?', 'Line one.\nLine two.'],
    ])
    expect(choiceWordsOf(shown[0]!.question, shown[0]!.value)).toEqual(['Early'])
    expect(choiceWordsOf(shown[1]!.question, shown[1]!.value)).toEqual(['Music', 'Welcome'])
  })

  it('leaves out an answer whose question no form asks, or whose value its question cannot hold', () => {
    expect(
      ownAnswersShown(
        [reworded],
        [
          { key: 'custom:gone', value: 'x' },
          { key: 'custom:church', value: 'c42' },
          { key: 'custom:member', value: 'yes' },
        ],
      ),
    ).toEqual([])
  })
})

describe('through the boundary', () => {
  const saved = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'intakeForm.save' ? [effect.saving] : []))
  const history = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

  it('mints the key, saves the next version, and records the question added with its choices', () => {
    const command: Command = {
      type: 'intake_form.add_question',
      ministryId: ministry,
      form: 'discipleship',
      pageId: 'about-you',
      kind: 'one_choice',
      wording: 'Which service do you attend?',
      hint: '',
      required: false,
      choices: ['9am', '11am'],
      editedBy: 'admin-user',
    }
    const { effects } = handleCommand(command, {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      intakeForm: mentorAndMentee,
    } satisfies CommandContext)

    const key = 'custom:00000000-0000-4000-8000-000000000001'
    const [saving] = saved(effects)
    expect(saving!.form.version).toBe(1)
    expect(questionOn(saving!.form, key)).toMatchObject({
      kind: 'one_choice',
      choices: [
        { id: '00000000-0000-4000-8000-000000000002', wording: '9am' },
        { id: '00000000-0000-4000-8000-000000000003', wording: '11am' },
      ],
    })
    expect(history(effects)).toEqual([
      expect.objectContaining({
        type: 'intake_form.question_added',
        payload: {
          form: 'discipleship',
          version: 1,
          editedBy: 'admin-user',
          key,
          pageId: 'about-you',
          wording: 'Which service do you attend?',
          menteeWording: null,
          hint: null,
          required: false,
          kind: 'one_choice',
          choices: [
            { id: '00000000-0000-4000-8000-000000000002', wording: '9am' },
            { id: '00000000-0000-4000-8000-000000000003', wording: '11am' },
          ],
        },
      }),
    ])
  })

  const submit = (
    form: IntakeForm,
    sent: Record<string, readonly string[]>,
    extra: Partial<Extract<Command, { type: 'intake.submit' }>> = {},
    fields: Partial<IntakeFormFields> = {},
  ) =>
    handleCommand(
      {
        type: 'intake.submit',
        ministryId: ministry,
        form: {
          fullName: 'Ana Ruiz',
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
          own: sent,
          ...fields,
        },
        ...extra,
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
        intakeForm: form,
        intakeFormNow: form,
        ...(extra.token
          ? {
              intakeLink: {
                personId: personId('00000000-0000-4000-8000-0000000000bb'),
                token: extra.token,
                expiresAt: new Date('2026-10-20T00:00:00Z'),
              },
            }
          : {}),
      } satisfies CommandContext,
    )

  it('records the answers beside the submission, and history the questions answered but not what was said', () => {
    const { effects } = submit(withOneOfEach, { 'custom:church': ['c1'], 'custom:story': ['Pray for my exams.'] })
    const [intake] = effects.flatMap((effect) => (effect.kind === 'intake.record' ? [effect.intake] : []))
    expect(intake!.ownAnswers).toEqual([
      { key: 'custom:church', value: 'c1' },
      { key: 'custom:story', value: 'Pray for my exams.' },
    ])
    const [event] = history(effects).filter((each) => each.type === 'intake.submitted')
    expect(event!.payload.ownQuestionsAnswered).toEqual(['custom:church', 'custom:story'])
    expect(JSON.stringify(event!.payload)).not.toContain('Pray for my exams.')
  })

  it('refuses a required question left empty, as the wizard refuses any other', () => {
    expect(() => submit(withOneOfEach, {})).toThrow(
      expect.objectContaining({ refusals: ['intake.question_unanswered'] }),
    )
  })

  it('reads the reopened page’s own questions by the form, and Discipler’s by today’s rules, recording no version', () => {
    const { effects } = submit(
      withOneOfEach,
      { 'custom:church': ['c2'] },
      { token: intakeLinkToken('00000000-0000-4000-8000-0000000000cc'), ownQuestionsFrom: 'discipleship' },
      { intakePath: null, declaredSide: null, experience: null, oneToTwo: null },
    )
    const [intake] = effects.flatMap((effect) => (effect.kind === 'intake.record' ? [effect.intake] : []))
    expect(intake).toMatchObject({ formVersion: null, ownAnswers: [{ key: 'custom:church', value: 'c2' }] })
  })
})
