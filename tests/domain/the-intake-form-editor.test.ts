import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import { IntakeFormRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, type PersonId } from '~/domain/ids'
import { readIntakeForm, type IntakeFormFields } from '~/domain/intake'
import {
  addPage,
  arrangeQuestions,
  askedPages,
  BUILT_IN,
  BUILT_IN_QUESTIONS,
  editQuestion,
  editText,
  layoutOf,
  moveQuestion,
  presetForm,
  questionOn,
  renamePage,
  requiredOn,
  type IntakeForm,
  type PageLayout,
} from '~/domain/intake-form'

/**
 * A Ministry's Intake forms are its own to edit (Pastor feedback 2026-10, ticket
 * 11): every page is a box, every question a row that can be reworded, given a
 * hint, made optional where Discipler allows it, and dragged to another place.
 * Today's form is every Ministry's preset, so nothing changes for anybody until
 * an Admin edits -- and each save is a new version, so somebody part-way through
 * finishes the one they opened.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const at = new Date('2026-10-14T10:00:00Z')

const mentorAndMentee = presetForm('discipleship')
const groups = presetForm('group')

/** What a form's pages say, page by page: its name and each question's wording. */
const said = (form: IntakeForm) =>
  form.pages.map((page) => [page.name, page.questions.map((question) => question.wording)])

const formOf = (edit: ReturnType<typeof editQuestion>): IntakeForm => {
  if (edit === null || 'refusal' in edit) throw new Error(`Expected a saved form, got ${JSON.stringify(edit)}`)
  return edit.form
}

const refusalOf = (edit: ReturnType<typeof editQuestion>) => {
  if (edit === null || !('refusal' in edit)) throw new Error('Expected a refusal')
  return edit.refusal
}

describe('every Ministry’s preset is today’s form', () => {
  it('asks the mentor and mentee form’s questions on today’s six pages, in today’s words', () => {
    expect(mentorAndMentee.version).toBe(0)
    expect(mentorAndMentee.intro).toBeNull()
    expect(mentorAndMentee.thankYou).toBeNull()
    expect(said(mentorAndMentee)).toEqual([
      ['Welcome — let’s get you connected.', ['I’m joining as…']],
      ['Tell us a little about yourself.', ['Age range', 'Gender']],
      ['A bit about your experience.', ['Have you mentored someone before?']],
      // Beside the first-time page, its twin (Suggestions beyond the one-to-one,
      // ticket 01), so every Ministry that never edited asks it.
      ['One more about how you’d be paired.', ['Open to mentoring two mentees together if needed']],
      ['When are you generally available to meet?', ['When could you meet?']],
      [
        'Nearly there — how we reach you, and what you are hoping for.',
        ['What are you hoping for?', 'Your name', 'Mobile number', 'Email'],
      ],
    ])
    expect(questionOn(mentorAndMentee, 'experience')?.menteeWording).toBe(
      'Have you been discipled by a mentor before?',
    )
    // The mentee side in James's words (2026-09-22), the mentor side in the same
    // shape (approved 2026-10-15).
    expect(questionOn(mentorAndMentee, 'oneToTwo')?.menteeWording).toBe(
      'Open to being mentored alongside another mentee if needed',
    )
  })

  it('asks the groups form’s questions on today’s four pages, and never the goal or the side', () => {
    expect(said(groups)).toEqual([
      ['Tell us a little about yourself.', ['Age range', 'Gender']],
      ['When are you generally available to meet?', ['When could you meet?']],
      ['Which group would you like to join?', ['Which group would you like to join?']],
      ['Nearly there — how we reach you.', ['Your name', 'Mobile number', 'Email']],
    ])
    expect(questionOn(groups, 'goalId')).toBeUndefined()
    expect(questionOn(groups, 'side')).toBeUndefined()
    // Worded from the side, so never asked where the side is not.
    expect(questionOn(groups, 'oneToTwo')).toBeUndefined()
  })

  it('keeps today’s hints', () => {
    expect(questionOn(mentorAndMentee, 'experience')?.hint).toBe('This helps us match you thoughtfully.')
    expect(questionOn(mentorAndMentee, 'oneToTwo')?.hint).toBe(
      'Sometimes one mentor walks with two people at once. Either answer is fine.',
    )
    expect(questionOn(mentorAndMentee, 'availability')?.hint).toBe(
      'Select every hour that could work — not just your best one.',
    )
    expect(questionOn(mentorAndMentee, 'goalId')?.hint).toBe('Choose the one that fits best.')
    expect(questionOn(mentorAndMentee, 'gender')?.hint).toBeNull()
  })

  it('requires everything but the email, as today', () => {
    expect([...requiredOn(mentorAndMentee)].sort()).toEqual(
      ['ageBand', 'availability', 'experience', 'fullName', 'gender', 'goalId', 'oneToTwo', 'phone', 'side'].sort(),
    )
    expect(requiredOn(groups).has('email')).toBe(false)
    expect(requiredOn(groups).has('groupId')).toBe(true)
  })

  it('reads a submission exactly as it was read before there were forms', () => {
    const fields: IntakeFormFields = {
      fullName: 'Emily Johnson',
      phone: '(555) 234-9911',
      email: null,
      ageBand: '25-34',
      gender: 'female',
      goalId: null,
      goalOther: null,
      availability: ['monday:12'],
      smsConsent: true,
      contactSharing: 'granted',
      source: 'pastor_link',
      intakePath: 'discipleship',
      declaredSide: 'mentee',
      experience: null,
      oneToTwo: null,
      groupId: null,
    }
    expect(readIntakeForm(fields, requiredOn(mentorAndMentee))).toEqual(readIntakeForm(fields))
  })
})

describe('what Discipler fixes about the questions it asks', () => {
  it('marks every question the product reads with what reads it', () => {
    expect(BUILT_IN.gender.usedBy).toBe('pairing_rules')
    expect(BUILT_IN.ageBand.usedBy).toBe('age_rule')
    expect(BUILT_IN.side.usedBy).toBe('suggested_pairs')
    expect(BUILT_IN.availability.usedBy).toBe('suggested_pairs')
    expect(BUILT_IN.goalId.usedBy).toBe('suggested_pairs')
  })

  it('always asks the name and the phone, and only those', () => {
    expect(BUILT_IN_QUESTIONS.filter((key) => BUILT_IN[key].alwaysAsked)).toEqual(['fullName', 'phone'])
  })

  /**
   * The one-to-two question is the first-time question's twin in every rule
   * (Suggestions beyond the one-to-one, ticket 01): worded from the side, so
   * asked after it and only beside it; read by nothing that pairs people, so
   * marked with no use; and free to be made optional or removed.
   */
  it('holds the one-to-two question to every rule the first-time question is held to', () => {
    expect(BUILT_IN.oneToTwo).toEqual(BUILT_IN.experience)
    expect(BUILT_IN.oneToTwo).toMatchObject({ usedBy: null, after: 'side', needs: 'side', requiredFixed: false })
  })
})

describe('editing a question', () => {
  it('rewords it in place, keeping its key, and saves the next version', () => {
    const form = formOf(
      editQuestion(mentorAndMentee, 'gender', {
        wording: '  Are you  a man or a woman? ',
        menteeWording: null,
        hint: 'We pair men with men and women with women.',
        required: true,
      }),
    )

    expect(form.version).toBe(1)
    expect(questionOn(form, 'gender')).toEqual({
      key: 'gender',
      wording: 'Are you a man or a woman?',
      menteeWording: null,
      hint: 'We pair men with men and women with women.',
      required: true,
    })
    // Nothing else moved.
    expect(layoutOf(form)).toEqual(layoutOf(mentorAndMentee))
  })

  it('words the first-time question twice, once for each side', () => {
    const form = formOf(
      editQuestion(mentorAndMentee, 'experience', {
        wording: 'Have you mentored before?',
        menteeWording: 'Have you had a mentor before?',
        hint: '',
        required: true,
      }),
    )
    expect(questionOn(form, 'experience')).toMatchObject({
      wording: 'Have you mentored before?',
      menteeWording: 'Have you had a mentor before?',
      hint: null,
    })

    expect(
      refusalOf(
        editQuestion(mentorAndMentee, 'experience', {
          wording: 'Have you mentored before?',
          menteeWording: '  ',
          hint: '',
          required: true,
        }),
      ),
    ).toBe('intake_form.question_needs_wording')
  })

  it('makes the goal, the first-time question and the email optional or required', () => {
    const optionalGoal = formOf(
      editQuestion(mentorAndMentee, 'goalId', {
        wording: 'What are you hoping for?',
        menteeWording: null,
        hint: 'Choose the one that fits best.',
        required: false,
      }),
    )
    expect(requiredOn(optionalGoal).has('goalId')).toBe(false)

    const requiredEmail = formOf(
      editQuestion(mentorAndMentee, 'email', {
        wording: 'Email',
        menteeWording: null,
        hint: '',
        required: true,
      }),
    )
    expect(requiredOn(requiredEmail).has('email')).toBe(true)
  })

  it('keeps required what the pairing rules, Suggested Pairs and the groups form run on, and name and phone', () => {
    for (const key of ['fullName', 'phone', 'gender', 'ageBand', 'side', 'availability'] as const) {
      expect(
        refusalOf(
          editQuestion(mentorAndMentee, key, {
            wording: questionOn(mentorAndMentee, key)!.wording,
            menteeWording: null,
            hint: '',
            required: false,
          }),
        ),
      ).toBe('intake_form.always_required')
    }
    expect(
      refusalOf(
        editQuestion(groups, 'groupId', { wording: 'Which group?', menteeWording: null, hint: '', required: false }),
      ),
    ).toBe('intake_form.always_required')
  })

  it('refuses a question with nothing written on it, and one that is not on the form', () => {
    expect(
      refusalOf(editQuestion(mentorAndMentee, 'gender', { wording: '  ', menteeWording: null, hint: '', required: true })),
    ).toBe('intake_form.question_needs_wording')
    expect(
      refusalOf(editQuestion(groups, 'goalId', { wording: 'Hopes', menteeWording: null, hint: '', required: true })),
    ).toBe('intake_form.not_found')
  })

  it('saves nothing when nothing changed', () => {
    expect(
      editQuestion(mentorAndMentee, 'gender', { wording: 'Gender', menteeWording: null, hint: '  ', required: true }),
    ).toBeNull()
  })
})

describe('arranging the questions', () => {
  const layoutWith = (form: IntakeForm, change: (layout: { pageId: string; keys: string[] }[]) => void) => {
    const layout = layoutOf(form).map((page) => ({ pageId: page.pageId, keys: [...page.keys] }))
    change(layout)
    return layout as readonly PageLayout[]
  }

  it('moves a question to another page and within one', () => {
    const form = formOf(
      arrangeQuestions(
        mentorAndMentee,
        layoutWith(mentorAndMentee, (layout) => {
          // Gender up beside the side, age band last on its page.
          layout[1]!.keys = ['ageBand']
          layout[0]!.keys = ['side', 'gender']
        }),
      ),
    )
    expect(layoutOf(form).map((page) => page.keys)).toEqual([
      ['side', 'gender'],
      ['ageBand'],
      ['experience'],
      ['oneToTwo'],
      ['availability'],
      ['goalId', 'fullName', 'phone', 'email'],
    ])
    expect(form.version).toBe(1)
  })

  it('keeps on the last page what is typed in and never travels in a web address', () => {
    for (const key of ['fullName', 'phone', 'email', 'goalId']) {
      const layout = layoutWith(mentorAndMentee, (pages) => {
        pages[5]!.keys = pages[5]!.keys.filter((each) => each !== key)
        pages[0]!.keys.push(key)
      })
      expect(refusalOf(arrangeQuestions(mentorAndMentee, layout))).toBe('intake_form.stays_on_the_last_page')
    }
  })

  it('asks the first-time question after the side, and the group after the gender', () => {
    const experienceWithSide = layoutWith(mentorAndMentee, (pages) => {
      pages[2]!.keys = []
      pages[0]!.keys.push('experience')
    })
    expect(refusalOf(arrangeQuestions(mentorAndMentee, experienceWithSide))).toBe('intake_form.asked_too_soon')

    // The one-to-two question is worded from the side too (Suggestions beyond
    // the one-to-one, ticket 01), and may share a page with the first-time one.
    const oneToTwoWithSide = layoutWith(mentorAndMentee, (pages) => {
      pages[3]!.keys = []
      pages[0]!.keys.push('oneToTwo')
    })
    expect(refusalOf(arrangeQuestions(mentorAndMentee, oneToTwoWithSide))).toBe('intake_form.asked_too_soon')
    const besideFirstTime = layoutWith(mentorAndMentee, (pages) => {
      pages[3]!.keys = []
      pages[2]!.keys.push('oneToTwo')
    })
    expect(layoutOf(formOf(arrangeQuestions(mentorAndMentee, besideFirstTime)))[2]!.keys).toEqual([
      'experience',
      'oneToTwo',
    ])

    const groupBeforeGender = layoutWith(groups, (pages) => {
      pages[2]!.keys = []
      pages[0]!.keys.unshift('groupId')
    })
    expect(refusalOf(arrangeQuestions(groups, groupBeforeGender))).toBe('intake_form.asked_too_soon')
  })

  it('refuses an order that is not this form’s, and saves nothing for the order it already has', () => {
    const dropped = layoutWith(mentorAndMentee, (pages) => {
      pages[1]!.keys = ['ageBand']
    })
    expect(refusalOf(arrangeQuestions(mentorAndMentee, dropped))).toBe('intake_form.changed')

    const invented = layoutWith(mentorAndMentee, (pages) => {
      pages[1]!.keys.push('groupId')
    })
    expect(refusalOf(arrangeQuestions(mentorAndMentee, invented))).toBe('intake_form.changed')

    const pagesSwapped = [...layoutOf(mentorAndMentee)].reverse()
    expect(refusalOf(arrangeQuestions(mentorAndMentee, pagesSwapped))).toBe('intake_form.changed')

    expect(arrangeQuestions(mentorAndMentee, layoutOf(mentorAndMentee))).toBeNull()
  })

  it('walks a question one place at a time, across the edge of a page', () => {
    const genderUp = formOf(moveQuestion(mentorAndMentee, 'gender', 'up'))
    expect(layoutOf(genderUp)[1]!.keys).toEqual(['gender', 'ageBand'])

    const ageBandUp = formOf(moveQuestion(mentorAndMentee, 'ageBand', 'up'))
    expect(layoutOf(ageBandUp).map((page) => page.keys).slice(0, 2)).toEqual([['side', 'ageBand'], ['gender']])

    const genderDown = formOf(moveQuestion(mentorAndMentee, 'gender', 'down'))
    expect(layoutOf(genderDown).map((page) => page.keys).slice(1, 3)).toEqual([['ageBand'], ['gender', 'experience']])

    expect(moveQuestion(mentorAndMentee, 'side', 'up')).toBeNull()
    expect(moveQuestion(mentorAndMentee, 'email', 'down')).toBeNull()
    // Off the last page is refused by the same rule a drag meets.
    expect(refusalOf(moveQuestion(mentorAndMentee, 'goalId', 'up'))).toBe('intake_form.stays_on_the_last_page')
  })
})

describe('pages', () => {
  it('adds an empty page just before the last, which the wizard skips until it has a question', () => {
    const form = formOf(addPage(mentorAndMentee, 'page-6', '  A little more  '))
    expect(form.pages.map((page) => page.id)).toEqual([
      'welcome',
      'about-you',
      'experience',
      'one-to-two',
      'availability',
      'page-6',
      'last',
    ])
    expect(form.pages[5]).toEqual({ id: 'page-6', name: 'A little more', questions: [] })
    expect(askedPages(form).map((page) => page.id)).not.toContain('page-6')

    const filled = formOf(moveQuestion(form, 'availability', 'down'))
    expect(askedPages(filled).map((page) => page.id)).toEqual([
      'welcome',
      'about-you',
      'experience',
      'one-to-two',
      'page-6',
      'last',
    ])
  })

  it('renames a page, and refuses a page with no name', () => {
    const form = formOf(renamePage(mentorAndMentee, 'about-you', 'About you'))
    expect(form.pages[1]!.name).toBe('About you')
    expect(refusalOf(renamePage(mentorAndMentee, 'about-you', ' '))).toBe('intake_form.page_needs_a_name')
    expect(refusalOf(addPage(mentorAndMentee, 'x', ''))).toBe('intake_form.page_needs_a_name')
    expect(refusalOf(renamePage(mentorAndMentee, 'nowhere', 'X'))).toBe('intake_form.not_found')
    expect(renamePage(mentorAndMentee, 'about-you', 'Tell us a little about yourself.')).toBeNull()
  })

  it('writes the intro and the thank-you, and takes one off when it is emptied', () => {
    const withIntro = formOf(editText(mentorAndMentee, 'intro', 'Welcome to discipleship at Riverside.'))
    expect(withIntro.intro).toBe('Welcome to discipleship at Riverside.')
    expect(withIntro.thankYou).toBeNull()

    const thanked = formOf(editText(withIntro, 'thank_you', 'Pastor Dan will be in touch.'))
    expect(thanked).toMatchObject({ version: 2, thankYou: 'Pastor Dan will be in touch.' })

    expect(formOf(editText(thanked, 'intro', '  ')).intro).toBeNull()
    expect(editText(mentorAndMentee, 'thank_you', '')).toBeNull()
  })
})

describe('an edit, through the boundary', () => {
  const edit = (command: Command, form: IntakeForm = mentorAndMentee) =>
    handleCommand(command, {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      intakeForm: form,
    } satisfies CommandContext)

  const saved = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'intakeForm.save' ? [effect.saving] : []))
  const history = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

  it('saves the next version, live at once, and records what the question said before', () => {
    const { effects } = edit({
      type: 'intake_form.edit_question',
      ministryId: ministry,
      form: 'discipleship',
      key: 'gender',
      wording: 'Sex',
      menteeWording: null,
      hint: '',
      required: true,
      editedBy: 'admin-user',
    })

    expect(saved(effects)).toEqual([
      {
        ministryId: ministry,
        form: expect.objectContaining({ name: 'discipleship', version: 1 }),
        savedAt: at,
        savedBy: 'admin-user',
      },
    ])
    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'intake_form.question_edited',
        subjectType: 'ministry',
        subjectId: ministry,
        payload: {
          form: 'discipleship',
          version: 1,
          editedBy: 'admin-user',
          key: 'gender',
          from: { wording: 'Gender', menteeWording: null, hint: null, required: true },
          to: { wording: 'Sex', menteeWording: null, hint: null, required: true },
        },
      },
    ])
  })

  it('records an arrangement with the order it replaced, however it was made', () => {
    const { effects } = edit({
      type: 'intake_form.move_question',
      ministryId: ministry,
      form: 'discipleship',
      key: 'gender',
      direction: 'up',
      editedBy: 'admin-user',
    })
    const [event] = history(effects)
    expect(event).toMatchObject({
      type: 'intake_form.arranged',
      payload: { from: layoutOf(mentorAndMentee) },
    })
    expect((event!.payload.to as PageLayout[])[1]!.keys).toEqual(['gender', 'ageBand'])
  })

  it('records a page added, a page renamed, and the intro and thank-you rewritten', () => {
    const added = edit({
      type: 'intake_form.add_page',
      ministryId: ministry,
      form: 'group',
      name: 'Your church',
      editedBy: 'admin-user',
    }, groups)
    expect(history(added.effects)[0]).toMatchObject({
      type: 'intake_form.page_added',
      payload: { form: 'group', version: 1, name: 'Your church' },
    })

    const renamed = edit({
      type: 'intake_form.rename_page',
      ministryId: ministry,
      form: 'discipleship',
      pageId: 'welcome',
      name: 'Welcome',
      editedBy: 'admin-user',
    })
    expect(history(renamed.effects)[0]).toMatchObject({
      type: 'intake_form.page_renamed',
      payload: { pageId: 'welcome', from: 'Welcome — let’s get you connected.', to: 'Welcome' },
    })

    const thanked = edit({
      type: 'intake_form.edit_text',
      ministryId: ministry,
      form: 'discipleship',
      which: 'thank_you',
      text: 'Pastor Dan will be in touch.',
      editedBy: 'admin-user',
    })
    expect(history(thanked.effects)[0]).toMatchObject({
      type: 'intake_form.thank_you_edited',
      payload: { from: null, to: 'Pastor Dan will be in touch.' },
    })
  })

  it('refuses with the reason, and writes nothing for an edit that changes nothing', () => {
    expect(() =>
      edit({
        type: 'intake_form.edit_question',
        ministryId: ministry,
        form: 'discipleship',
        key: 'phone',
        wording: 'Mobile number',
        menteeWording: null,
        hint: '',
        required: false,
        editedBy: 'admin-user',
      }),
    ).toThrow(IntakeFormRefused)

    expect(
      edit({
        type: 'intake_form.rename_page',
        ministryId: ministry,
        form: 'discipleship',
        pageId: 'welcome',
        name: 'Welcome — let’s get you connected.',
        editedBy: 'admin-user',
      }).effects,
    ).toEqual([])
  })

  it('builds on the version it was handed, not on the preset', () => {
    const first = formOf(renamePage(mentorAndMentee, 'welcome', 'Welcome'))
    const { effects } = edit(
      {
        type: 'intake_form.rename_page',
        ministryId: ministry,
        form: 'discipleship',
        pageId: 'about-you',
        name: 'About you',
        editedBy: 'admin-user',
      },
      first,
    )
    const [saving] = saved(effects)
    expect(saving!.form.version).toBe(2)
    expect(saving!.form.pages.map((page) => page.name).slice(0, 2)).toEqual(['Welcome', 'About you'])
  })
})

describe('a submission, read against the version its Person opened', () => {
  const answered: IntakeFormFields = {
    fullName: 'Emily Johnson',
    phone: '(555) 234-9911',
    email: null,
    ageBand: '25-34',
    gender: 'female',
    goalId: null,
    goalOther: null,
    availability: ['monday:12'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: 'discipleship',
    declaredSide: 'mentee',
    experience: null,
    oneToTwo: null,
    groupId: null,
  }

  const optional = formOf(
    editQuestion(
      formOf(
        editQuestion(
          formOf(
            editQuestion(mentorAndMentee, 'goalId', {
              wording: 'What are you hoping for?',
              menteeWording: null,
              hint: '',
              required: false,
            }),
          ),
          'experience',
          {
            wording: 'Have you mentored someone before?',
            menteeWording: 'Have you been discipled by a mentor before?',
            hint: '',
            required: false,
          },
        ),
      ),
      'oneToTwo',
      {
        wording: 'Open to mentoring two mentees together if needed',
        menteeWording: 'Open to being mentored alongside another mentee if needed',
        hint: '',
        required: false,
      },
    ),
  )

  const submit = (form: IntakeForm | undefined, fields: IntakeFormFields = answered) =>
    handleCommand(
      { type: 'intake.submit', ministryId: ministry, form: fields },
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
        ...(form ? { intakeForm: form, intakeFormNow: form } : {}),
      } satisfies CommandContext,
    )

  it('takes a submission that skipped the questions this version made optional, and records the version', () => {
    const { effects } = submit(optional)
    const [intake] = effects.flatMap((effect) => (effect.kind === 'intake.record' ? [effect.intake] : []))
    expect(intake).toMatchObject({ goalId: null, goalOther: null, firstTime: null, oneToTwo: null, formVersion: 3 })

    const [event] = effects.flatMap((effect) =>
      effect.kind === 'history.append' && effect.event.type === 'intake.submitted' ? [effect.event] : [],
    )
    expect(event!.payload.formVersion).toBe(3)
  })

  it('refuses the same submission against the preset, which asks for all three', () => {
    expect(() => submit(mentorAndMentee, { ...answered, oneToTwo: '' })).toThrow(
      expect.objectContaining({
        refusals: ['intake.first_time_unanswered', 'intake.one_to_two_unanswered', 'intake.goal_not_selected'],
      }),
    )
  })

  /**
   * Somebody who opened the preset before the one-to-two question joined it, and
   * posts a last page that never asked it (Suggestions beyond the one-to-one,
   * ticket 01): no field for it arrives, and the answer is kept as *the form did
   * not ask*.
   */
  it('takes a submission to the preset with no one-to-two field, and records no answer to it', () => {
    const { effects } = submit(mentorAndMentee, {
      ...answered,
      goalId: '00000000-0000-4000-8000-000000000009',
      experience: 'first_time',
      oneToTwo: null,
    })
    const [intake] = effects.flatMap((effect) => (effect.kind === 'intake.record' ? [effect.intake] : []))
    expect(intake).toMatchObject({ oneToTwo: null, firstTime: true, formVersion: 0 })
  })

  /**
   * An edited version is saved after the question existed, so nobody opened one
   * that was missing it: one that asks it as required refuses the submission
   * with no field for it, as it refuses one sent empty.
   */
  it('refuses a submission with no one-to-two field to an edited version that asks it', () => {
    const edited = formOf(renamePage(mentorAndMentee, 'welcome', 'Welcome'))
    expect(edited.version).toBe(1)
    expect(() =>
      submit(edited, {
        ...answered,
        goalId: '00000000-0000-4000-8000-000000000009',
        experience: 'first_time',
        oneToTwo: null,
      }),
    ).toThrow(expect.objectContaining({ refusals: ['intake.one_to_two_unanswered'] }))
  })

  it('refuses a missing email once a version asks for one', () => {
    const emailRequired = formOf(
      editQuestion(mentorAndMentee, 'email', { wording: 'Email', menteeWording: null, hint: '', required: true }),
    )
    expect(() =>
      submit(emailRequired, {
        ...answered,
        goalId: '00000000-0000-4000-8000-000000000009',
        experience: 'first_time',
        oneToTwo: 'one_to_one_only',
      }),
    ).toThrow(expect.objectContaining({ refusals: ['intake.email_missing'] }))
  })

  it('records no version for a form that is not one of the Ministry’s two', () => {
    const { effects } = submit(undefined, {
      ...answered,
      intakePath: null,
      declaredSide: null,
      goalId: '00000000-0000-4000-8000-000000000009',
    })
    const [intake] = effects.flatMap((effect) => (effect.kind === 'intake.record' ? [effect.intake] : []))
    expect(intake!.formVersion).toBeNull()
  })
})
