import type { Branded } from './branded'
import { GROUP_PATH, type IntakePath } from './intake'
import { readWording } from './wording'

/**
 * A Ministry's Intake form: the pages the wizard steps through, the questions on
 * each, and how each question is worded (Pastor feedback 2026-10, ticket 11).
 *
 * A Ministry has two, one per Intake path -- the mentor and mentee form and the
 * groups form -- and each is edited on its own. Nothing here touches a database:
 * the form is stored as one immutable version per save, and every rule about what
 * an Admin may do to it is decided here, where a test can drive a semester's worth
 * of edits in a millisecond.
 *
 * Three facts shape all of it.
 *
 * **Today's form is every Ministry's preset.** A Ministry that has never edited
 * holds no stored form at all and is served `presetForm`, version 0, which asks
 * exactly what the wizard asked before there was an editor, in the same words and
 * on the same pages. Its first edit is applied to the preset and saved as version 1.
 *
 * **A save is a new version and never an update.** Somebody part-way through the
 * wizard carries the version they opened from screen to screen and is served that
 * version to the end, so an edit made while they are on step three cannot move a
 * question they already answered or put a new one behind them. Versions are kept,
 * which is also what lets a submission say which form it answered.
 *
 * **A question is a key, and its wording is not its identity.** The answers point
 * at the key, so rewording a question keeps every answer given to it, the rule
 * ADR-0014 states for the goal's options. The built-in questions' keys are the
 * names their answers already travel under on the wire.
 */

/**
 * The questions Discipler itself asks, each keyed by the name its answer travels
 * under. Ticket 12 adds a Ministry's own questions beside these, under keys of
 * their own; nothing here assumes a form holds only these.
 */
export const BUILT_IN_QUESTIONS = [
  'side',
  'ageBand',
  'gender',
  'experience',
  'availability',
  'goalId',
  'groupId',
  'fullName',
  'phone',
  'email',
] as const
export type BuiltInQuestion = (typeof BUILT_IN_QUESTIONS)[number]

export const isBuiltInQuestion = (value: unknown): value is BuiltInQuestion =>
  (BUILT_IN_QUESTIONS as readonly unknown[]).includes(value)

/**
 * What kind of answer a question takes. The built-in questions each have one that
 * never changes; ticket 12's own questions add long text, several choices and
 * yes/no, and reuse short text and one choice.
 */
export type QuestionKind =
  | 'short_text'
  | 'phone'
  | 'email'
  | 'one_choice'
  | 'hourly_grid'
  /** One choice from the Ministry's goals, with Other last. */
  | 'goal_choice'
  /** One choice from the Ministry's groups, with *no group in mind* last. */
  | 'group_choice'

/** What in the product reads a question's answer, for the mark on its row. */
export type ProductUse = 'pairing_rules' | 'age_rule' | 'suggested_pairs'

/**
 * What Discipler fixes about each built-in question, which no edit changes.
 *
 * `requiredFixed` covers more than name and phone. Gender, age band, the matching
 * question, availability and the group are what the pairing rules, Suggested
 * Pairs and the groups form run on, and none of them yet says what it does for
 * somebody who skipped the question: a Person with no gender, for one, would meet
 * the safeguarding rule with nothing to match. So they stay required until the
 * ticket that lets them be removed (13) decides what each surface does without
 * them. Name and phone are *always asked*, which is a stronger thing: they are who
 * somebody is to Discipler, and ticket 13 cannot remove them either.
 *
 * `staysOnTheLastPage` is about the address bar. Every page but the last moves on
 * by a GET, carrying the answers so far in the URL, and the last page is the only
 * POST. A name, a number, an email and the words typed after Other are not going in
 * a URL, so those questions are asked on the page with the Submit button and only
 * there.
 *
 * `after` is a question worded or filtered from an earlier answer: the first-time
 * question is put in the words of the side, and the groups on offer are the ones
 * open to the gender given. Asked on the same page as that answer, or before it,
 * there would be nothing to word it from.
 */
export interface BuiltInRules {
  readonly kind: QuestionKind
  readonly usedBy: ProductUse | null
  readonly alwaysAsked: boolean
  readonly requiredFixed: boolean
  readonly staysOnTheLastPage: boolean
  readonly after: BuiltInQuestion | null
}

export const BUILT_IN: Readonly<Record<BuiltInQuestion, BuiltInRules>> = {
  side: {
    kind: 'one_choice',
    usedBy: 'suggested_pairs',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
  },
  ageBand: {
    kind: 'one_choice',
    usedBy: 'age_rule',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
  },
  gender: {
    kind: 'one_choice',
    usedBy: 'pairing_rules',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
  },
  experience: {
    kind: 'one_choice',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: false,
    after: 'side',
  },
  availability: {
    kind: 'hourly_grid',
    usedBy: 'suggested_pairs',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
  },
  goalId: {
    kind: 'goal_choice',
    usedBy: 'suggested_pairs',
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: true,
    after: null,
  },
  groupId: {
    kind: 'group_choice',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: 'gender',
  },
  fullName: {
    kind: 'short_text',
    usedBy: null,
    alwaysAsked: true,
    requiredFixed: true,
    staysOnTheLastPage: true,
    after: null,
  },
  phone: {
    kind: 'phone',
    usedBy: null,
    alwaysAsked: true,
    requiredFixed: true,
    staysOnTheLastPage: true,
    after: null,
  },
  email: {
    kind: 'email',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: true,
    after: null,
  },
}

/**
 * Wording that has been through `readWording`: trimmed, inner whitespace
 * collapsed, and never empty. Branded for the reason a goal option's wording is.
 */
export type FormWording = Branded<string, 'FormWording'>

/** At the platform edge, where the stored form is the authority on its own words. */
export const formWording = (value: string): FormWording => value as FormWording

const wordingOf = (raw: string | null | undefined): FormWording | null =>
  readWording(raw) as FormWording | null

/**
 * One question as a form asks it. `menteeWording` is the first-time question's
 * alone: it is put in the words of the side, so it has one wording for a mentor
 * and one for somebody to be mentored, and is null on every other question.
 */
export interface FormQuestion {
  readonly key: BuiltInQuestion
  readonly wording: FormWording
  readonly menteeWording: FormWording | null
  readonly hint: FormWording | null
  readonly required: boolean
}

/**
 * One wizard page: one screen, with its name as the line under the Ministry's
 * name at the top of it. A page with no questions on it is skipped by the wizard,
 * so a page just added is not a blank screen somebody has to press past.
 */
export interface FormPage {
  readonly id: string
  readonly name: FormWording
  readonly questions: readonly FormQuestion[]
}

export interface IntakeForm {
  /** Which of the two forms. The path a submission from it declares. */
  readonly name: IntakePath
  /** 0 for the preset; each save adds one. */
  readonly version: number
  /** Said on the first page, under its name. None on the preset. */
  readonly intro: FormWording | null
  /** Said on the page after Submit, under what Discipler says there. None on the preset. */
  readonly thankYou: FormWording | null
  readonly pages: readonly FormPage[]
}

/** The version a Ministry that has never edited is served. */
export const PRESET_VERSION = 0

const ask = (
  key: BuiltInQuestion,
  wording: string,
  extra: { readonly hint?: string; readonly menteeWording?: string; readonly required?: boolean } = {},
): FormQuestion => ({
  key,
  wording: formWording(wording),
  menteeWording: extra.menteeWording === undefined ? null : formWording(extra.menteeWording),
  hint: extra.hint === undefined ? null : formWording(extra.hint),
  required: extra.required ?? true,
})

const page = (id: string, name: string, questions: readonly FormQuestion[]): FormPage => ({
  id,
  name: formWording(name),
  questions,
})

/**
 * Today's form, with ticket 06's Other, which is every Ministry's until it edits.
 * Every word here is the word the wizard said before the editor existed, and a
 * test reads each screen back against them.
 */
const PRESETS: Readonly<Record<IntakePath, IntakeForm>> = {
  discipleship: {
    name: 'discipleship',
    version: PRESET_VERSION,
    intro: null,
    thankYou: null,
    pages: [
      page('welcome', 'Welcome — let’s get you connected.', [ask('side', 'I’m joining as…')]),
      page('about-you', 'Tell us a little about yourself.', [
        ask('ageBand', 'Age range'),
        ask('gender', 'Gender'),
      ]),
      page('experience', 'A bit about your experience.', [
        ask('experience', 'Have you mentored someone before?', {
          menteeWording: 'Have you been discipled by a mentor before?',
          hint: 'This helps us match you thoughtfully.',
        }),
      ]),
      page('availability', 'When are you generally available to meet?', [
        ask('availability', 'When could you meet?', {
          hint: 'Select every hour that could work — not just your best one.',
        }),
      ]),
      page('last', 'Nearly there — how we reach you, and what you are hoping for.', [
        ask('goalId', 'What are you hoping for?', { hint: 'Choose the one that fits best.' }),
        ask('fullName', 'Your name'),
        ask('phone', 'Mobile number'),
        ask('email', 'Email', { required: false }),
      ]),
    ],
  },
  group: {
    name: GROUP_PATH,
    version: PRESET_VERSION,
    intro: null,
    thankYou: null,
    pages: [
      page('about-you', 'Tell us a little about yourself.', [
        ask('ageBand', 'Age range'),
        ask('gender', 'Gender'),
      ]),
      page('availability', 'When are you generally available to meet?', [
        ask('availability', 'When could you meet?', {
          hint: 'Select every hour that could work — not just your best one.',
        }),
      ]),
      page('your-group', 'Which group would you like to join?', [
        ask('groupId', 'Which group would you like to join?'),
      ]),
      page('last', 'Nearly there — how we reach you.', [
        ask('fullName', 'Your name'),
        ask('phone', 'Mobile number'),
        ask('email', 'Email', { required: false }),
      ]),
    ],
  },
}

export const presetForm = (name: IntakePath): IntakeForm => PRESETS[name]

/** Every question on the form, page by page, in the order they are asked. */
export const questionsOf = (form: IntakeForm): readonly FormQuestion[] =>
  form.pages.flatMap((each) => each.questions)

export const questionOn = (form: IntakeForm, key: string): FormQuestion | undefined =>
  questionsOf(form).find((question) => question.key === key)

/**
 * The questions this form will not take a submission without. Read by the Intake
 * reader against the version the Person opened, so a question made optional
 * after they started is still optional for them only if it was when they opened.
 */
export const requiredOn = (form: IntakeForm): ReadonlySet<BuiltInQuestion> =>
  new Set(questionsOf(form).filter((question) => question.required).map((question) => question.key))

/** The pages the wizard steps through: every page with a question on it. */
export const askedPages = (form: IntakeForm): readonly FormPage[] =>
  form.pages.filter((each) => each.questions.length > 0)

/**
 * Why an edit to a form could not be made. Codes, like every refusal: the editor
 * owns the sentences.
 */
export type IntakeFormRefusal =
  /** The question or page named is not on this form: somebody else changed it. */
  | 'intake_form.not_found'
  | 'intake_form.question_needs_wording'
  | 'intake_form.page_needs_a_name'
  /** Required unticked on a question Discipler keeps required. */
  | 'intake_form.always_required'
  /** An order that is not this form's questions and pages, each once. */
  | 'intake_form.changed'
  | 'intake_form.stays_on_the_last_page'
  | 'intake_form.asked_too_soon'

/** One page of an order an Admin dragged into: the page, and its questions top to bottom. */
export interface PageLayout {
  readonly pageId: string
  readonly keys: readonly string[]
}

/** The form's order as it stands, for history to record what an arrangement replaced. */
export const layoutOf = (form: IntakeForm): readonly PageLayout[] =>
  form.pages.map((each) => ({ pageId: each.id, keys: each.questions.map((question) => question.key) }))

/**
 * Whether these pages may be served in this order: the questions that travel only
 * in the last page's POST are on it, and every question worded from an earlier
 * answer comes on a later page than that answer.
 */
const arrangementRefusal = (pages: readonly FormPage[]): IntakeFormRefusal | null => {
  const last = pages.length - 1
  const pageOf = new Map<BuiltInQuestion, number>()
  pages.forEach((each, index) => {
    for (const question of each.questions) pageOf.set(question.key, index)
  })

  for (const [key, index] of pageOf) {
    if (BUILT_IN[key].staysOnTheLastPage && index !== last) {
      return 'intake_form.stays_on_the_last_page'
    }
  }
  for (const [key, index] of pageOf) {
    const anchor = BUILT_IN[key].after
    const anchorAt = anchor === null ? undefined : pageOf.get(anchor)
    if (anchorAt !== undefined && index <= anchorAt) return 'intake_form.asked_too_soon'
  }
  return null
}

/**
 * What an edit produced: the form as it now stands, one version on, or why it
 * could not be made. Null where the edit changed nothing, which is not a refusal:
 * an Admin who saved a question without touching it has asked for the form they
 * are already looking at, and nothing is written.
 */
export type FormEdit = { readonly form: IntakeForm } | { readonly refusal: IntakeFormRefusal } | null

const saved = (form: IntakeForm, pages: readonly FormPage[]): FormEdit => ({
  form: { ...form, version: form.version + 1, pages },
})

/** What an Admin typed into an open question's row. */
export interface QuestionAsTyped {
  readonly wording: string
  /** The first-time question's second box; ignored on every other question. */
  readonly menteeWording: string | null
  readonly hint: string
  readonly required: boolean
}

export const editQuestion = (form: IntakeForm, key: string, typed: QuestionAsTyped): FormEdit => {
  const question = questionOn(form, key)
  if (!question) return { refusal: 'intake_form.not_found' }

  const wording = wordingOf(typed.wording)
  const hasTwoWordings = question.menteeWording !== null
  const menteeWording = hasTwoWordings ? wordingOf(typed.menteeWording) : null
  if (wording === null || (hasTwoWordings && menteeWording === null)) {
    return { refusal: 'intake_form.question_needs_wording' }
  }
  if (!typed.required && BUILT_IN[question.key].requiredFixed) {
    return { refusal: 'intake_form.always_required' }
  }

  const edited: FormQuestion = {
    ...question,
    wording,
    menteeWording,
    // An emptied hint is no hint, rather than a refusal: the hint is optional.
    hint: wordingOf(typed.hint),
    required: typed.required,
  }
  if (
    edited.wording === question.wording
    && edited.menteeWording === question.menteeWording
    && edited.hint === question.hint
    && edited.required === question.required
  ) {
    return null
  }

  return saved(
    form,
    form.pages.map((each) => ({
      ...each,
      questions: each.questions.map((one) => (one.key === question.key ? edited : one)),
    })),
  )
}

/**
 * The whole form in the order an Admin dragged it into: every page once, in the
 * order the form already has them, and every question once on one of them.
 * Anything else is a page that no longer matches the form -- somebody else edited
 * it since it was drawn -- and is refused rather than applied with a question
 * quietly dropped or invented.
 */
export const arrangeQuestions = (form: IntakeForm, layout: readonly PageLayout[]): FormEdit => {
  const pageIds = form.pages.map((each) => each.id)
  const keys = questionsOf(form).map((question) => question.key)
  const placed = layout.flatMap((each) => each.keys)

  const sameKeys =
    placed.length === keys.length
    && new Set(placed).size === placed.length
    && placed.every((key) => (keys as readonly string[]).includes(key))
  const samePages =
    layout.length === pageIds.length && layout.every((each, index) => each.pageId === pageIds[index])
  if (!sameKeys || !samePages) return { refusal: 'intake_form.changed' }

  const byKey = new Map(questionsOf(form).map((question) => [question.key as string, question]))
  const pages = form.pages.map((each, index) => ({
    ...each,
    questions: (layout[index]?.keys ?? []).map((key) => byKey.get(key)!),
  }))

  const unchanged = pages.every(
    (each, index) =>
      each.questions.length === form.pages[index]!.questions.length
      && each.questions.every((question, at) => question === form.pages[index]!.questions[at]),
  )
  if (unchanged) return null

  const refusal = arrangementRefusal(pages)
  if (refusal) return { refusal }

  return saved(form, pages)
}

export type MoveDirection = 'up' | 'down'

export const isMoveDirection = (value: unknown): value is MoveDirection =>
  value === 'up' || value === 'down'

/**
 * One question, one place along the form: up and down is what the editor offers
 * before its script has run. Off the top of a page it goes to the bottom of the
 * page before, and off the bottom to the top of the page after, so a question
 * can be walked onto any page one press at a time. Null where it cannot go
 * further: the first question asked up, or the last down.
 */
export const moveQuestion = (form: IntakeForm, key: string, direction: MoveDirection): FormEdit => {
  const at = form.pages.findIndex((each) => each.questions.some((question) => question.key === key))
  if (at < 0) return { refusal: 'intake_form.not_found' }

  const layout = layoutOf(form).map((each) => ({ ...each, keys: [...each.keys] }))
  const here = layout[at]!
  const index = here.keys.indexOf(key)
  here.keys.splice(index, 1)

  if (direction === 'up') {
    if (index > 0) here.keys.splice(index - 1, 0, key)
    else if (at > 0) layout[at - 1]!.keys.push(key)
    else return null
  } else {
    if (index < here.keys.length) here.keys.splice(index + 1, 0, key)
    else if (at < layout.length - 1) layout[at + 1]!.keys.unshift(key)
    else return null
  }

  return arrangeQuestions(form, layout)
}

/**
 * A new, empty page, just before the last one. The last page is where somebody
 * gives their name and number, agrees and submits, so it stays last: a page added
 * after it would put a screen beyond the Submit button.
 */
export const addPage = (form: IntakeForm, id: string, name: string): FormEdit => {
  const wording = wordingOf(name)
  if (wording === null) return { refusal: 'intake_form.page_needs_a_name' }

  const pages = [...form.pages]
  pages.splice(pages.length - 1, 0, { id, name: wording, questions: [] })
  return saved(form, pages)
}

export const renamePage = (form: IntakeForm, pageId: string, name: string): FormEdit => {
  const named = form.pages.find((each) => each.id === pageId)
  if (!named) return { refusal: 'intake_form.not_found' }

  const wording = wordingOf(name)
  if (wording === null) return { refusal: 'intake_form.page_needs_a_name' }
  if (wording === named.name) return null

  return saved(
    form,
    form.pages.map((each) => (each.id === pageId ? { ...each, name: wording } : each)),
  )
}

/** The two things said around the questions rather than asked: before, and after Submit. */
export type FormText = 'intro' | 'thank_you'

export const isFormText = (value: unknown): value is FormText =>
  value === 'intro' || value === 'thank_you'

/** The intro or the thank-you, rewritten. Emptied, it is taken off rather than refused. */
export const editText = (form: IntakeForm, which: FormText, text: string): FormEdit => {
  const wording = wordingOf(text)
  const was = which === 'intro' ? form.intro : form.thankYou
  if (wording === was) return null

  const next = which === 'intro' ? { ...form, intro: wording } : { ...form, thankYou: wording }
  return { form: { ...next, version: form.version + 1 } }
}
