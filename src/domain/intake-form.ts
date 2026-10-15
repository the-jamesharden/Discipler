import type { Branded } from './branded'
import type { IntakeSubmissionId, PersonId } from './ids'
import { GROUP_PATH, type IntakePath, type IntakeSubmissionDraft } from './intake'
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
 * under. A Ministry's own questions (ticket 12) sit beside these under keys of
 * their own, `OwnQuestionKey`.
 */
export const BUILT_IN_QUESTIONS = [
  'side',
  'ageBand',
  'gender',
  'experience',
  'oneToTwo',
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
 * A question a Ministry added to its own form (Pastor feedback, ticket 12): `custom:`
 * and an id minted when it was added. The prefix means it can never be mistaken for
 * a built-in question, whose keys are plain words, and it is also the name its
 * answer travels under on the wire.
 */
export type OwnQuestionKey = `custom:${string}`

export const OWN_QUESTION_PREFIX = 'custom:'

export const isOwnQuestionKey = (value: unknown): value is OwnQuestionKey =>
  typeof value === 'string' && /^custom:[0-9A-Za-z-]{1,64}$/.test(value)

export const ownQuestionKey = (id: string): OwnQuestionKey => `${OWN_QUESTION_PREFIX}${id}`

/** Any question a form can ask. */
export type QuestionKey = BuiltInQuestion | OwnQuestionKey

export const isQuestionKey = (value: unknown): value is QuestionKey =>
  isBuiltInQuestion(value) || isOwnQuestionKey(value)

/**
 * The five kinds a Ministry may add a question as (ticket 12): short text, long
 * text, one choice, several choices, and yes or no.
 */
export const OWN_KINDS = ['short_text', 'long_text', 'one_choice', 'several_choices', 'yes_no'] as const
export type OwnKind = (typeof OWN_KINDS)[number]

export const isOwnKind = (value: unknown): value is OwnKind =>
  (OWN_KINDS as readonly unknown[]).includes(value)

/** The two kinds whose choices the Ministry words. */
export const hasChoices = (kind: OwnKind): boolean => kind === 'one_choice' || kind === 'several_choices'

/**
 * The two kinds somebody types into. Asked on the last page and only there, as the
 * name and the number are: every page but the last moves on by a GET carrying its
 * answers in the URL, and what somebody types is not going in a URL.
 */
export const isTypedKind = (kind: OwnKind): boolean => kind === 'short_text' || kind === 'long_text'

/**
 * What kind of answer a question takes. The built-in questions each have one that
 * never changes; a Ministry's own questions add long text, several choices and
 * yes/no, and reuse short text and one choice.
 */
export type QuestionKind =
  | 'short_text'
  | 'long_text'
  | 'phone'
  | 'email'
  | 'one_choice'
  | 'several_choices'
  | 'yes_no'
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
 * Pairs and the groups form run on. A form may stop asking one of them altogether
 * (ticket 13), and then each of those surfaces says it is doing without it; what
 * none of them does is meet one Person who answered beside another who skipped,
 * so a question asked is asked of everybody. Name and phone are *always asked*,
 * which is a stronger thing: they are who somebody is to Discipler, so they are
 * never removed either.
 *
 * `staysOnTheLastPage` is about the address bar. Every page but the last moves on
 * by a GET, carrying the answers so far in the URL, and the last page is the only
 * POST. A name, a number, an email and the words typed after Other are not going in
 * a URL, so those questions are asked on the page with the Submit button and only
 * there.
 *
 * `after` is a question worded or filtered from an earlier answer: the first-time
 * and one-to-two questions are put in the words of the side, and the groups on
 * offer are the ones open to the gender given. Asked on the same page as that
 * answer, or before it, there would be nothing to word it from.
 */
export interface BuiltInRules {
  readonly kind: QuestionKind
  readonly usedBy: ProductUse | null
  readonly alwaysAsked: boolean
  readonly requiredFixed: boolean
  readonly staysOnTheLastPage: boolean
  readonly after: BuiltInQuestion | null
  /**
   * A question that cannot be asked without another one on the form: the
   * first-time and one-to-two questions are put in the words of the side, and
   * have no words without it. So the side is not removed while either is asked,
   * and neither is added back to a form that no longer asks the side (ticket 13).
   */
  readonly needs: BuiltInQuestion | null
}

export const BUILT_IN: Readonly<Record<BuiltInQuestion, BuiltInRules>> = {
  side: {
    kind: 'one_choice',
    usedBy: 'suggested_pairs',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
    needs: null,
  },
  ageBand: {
    kind: 'one_choice',
    usedBy: 'age_rule',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
    needs: null,
  },
  gender: {
    kind: 'one_choice',
    usedBy: 'pairing_rules',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
    needs: null,
  },
  experience: {
    kind: 'one_choice',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: false,
    after: 'side',
    needs: 'side',
  },
  // The first-time question's twin in every rule (Suggestions beyond the
  // one-to-one, ticket 01): worded from the side, read by nothing in the product
  // but the pairing surfaces that show it beside a name, and so free to be made
  // optional or removed.
  oneToTwo: {
    kind: 'one_choice',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: false,
    after: 'side',
    needs: 'side',
  },
  availability: {
    kind: 'hourly_grid',
    usedBy: 'suggested_pairs',
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: null,
    needs: null,
  },
  goalId: {
    kind: 'goal_choice',
    usedBy: 'suggested_pairs',
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: true,
    after: null,
    needs: null,
  },
  groupId: {
    kind: 'group_choice',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: true,
    staysOnTheLastPage: false,
    after: 'gender',
    needs: null,
  },
  fullName: {
    kind: 'short_text',
    usedBy: null,
    alwaysAsked: true,
    requiredFixed: true,
    staysOnTheLastPage: true,
    after: null,
    needs: null,
  },
  phone: {
    kind: 'phone',
    usedBy: null,
    alwaysAsked: true,
    requiredFixed: true,
    staysOnTheLastPage: true,
    after: null,
    needs: null,
  },
  email: {
    kind: 'email',
    usedBy: null,
    alwaysAsked: false,
    requiredFixed: false,
    staysOnTheLastPage: true,
    after: null,
    needs: null,
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
 * One of Discipler's own questions as a form asks it. `menteeWording` is the
 * first-time and one-to-two questions' alone: each is put in the words of the
 * side, so it has one wording for a mentor and one for somebody to be mentored,
 * and is null on every other question.
 */
export interface BuiltInFormQuestion {
  readonly key: BuiltInQuestion
  readonly wording: FormWording
  readonly menteeWording: FormWording | null
  readonly hint: FormWording | null
  readonly required: boolean
}

/**
 * One choice of a Ministry's own question. An id rather than its words, for the
 * reason a goal option is a row (ADR-0014): an answer points at the choice, so a
 * reworded choice keeps every answer given to it.
 */
export interface OwnChoice {
  readonly id: string
  readonly wording: FormWording
}

/**
 * A question a Ministry added to its own form (Pastor feedback, ticket 12). Its
 * kind and choices are the Ministry's, so they are stored with it; nothing in the
 * product reads its answers but the screens that show them to an Admin.
 */
export interface OwnQuestion {
  readonly key: OwnQuestionKey
  readonly wording: FormWording
  readonly menteeWording: null
  readonly hint: FormWording | null
  readonly required: boolean
  readonly kind: OwnKind
  /** In the order they are offered; empty on the three kinds without choices. */
  readonly choices: readonly OwnChoice[]
}

/** One question as a form asks it: Discipler's own, or the Ministry's. */
export type FormQuestion = BuiltInFormQuestion | OwnQuestion

export const isOwnQuestion = (question: FormQuestion): question is OwnQuestion =>
  isOwnQuestionKey(question.key)

/**
 * What Discipler fixes about a question: the `BUILT_IN` table for its own, and for
 * a Ministry's own question its kind and nothing else. A Ministry's question is
 * never used by the product, never always asked, may always be made optional, and
 * stays on the last page where it is typed into.
 */
export const rulesOf = (question: FormQuestion): BuiltInRules =>
  isOwnQuestion(question)
    ? {
        kind: question.kind,
        usedBy: null,
        alwaysAsked: false,
        requiredFixed: false,
        staysOnTheLastPage: isTypedKind(question.kind),
        after: null,
        needs: null,
      }
    : BUILT_IN[question.key]

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
): BuiltInFormQuestion => ({
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
      // A page of its own beside the first-time one, as the wizard first asked it
      // (Suggestions beyond the one-to-one, ticket 01). A statement to agree with,
      // in James's words for the mentee side (2026-09-22) and the same shape for
      // a mentor (approved 2026-10-15).
      page('one-to-two', 'One more about how you’d be paired.', [
        ask('oneToTwo', 'Open to mentoring two mentees together if needed', {
          menteeWording: 'Open to being mentored alongside another mentee if needed',
          hint: 'Sometimes one mentor walks with two people at once. Either answer is fine.',
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
export const requiredOn = (form: IntakeForm): ReadonlySet<QuestionKey> =>
  new Set(questionsOf(form).filter((question) => question.required).map((question) => question.key))

/** The Ministry's own questions on a form, in the order they are asked. */
export const ownQuestionsOf = (form: IntakeForm): readonly OwnQuestion[] =>
  questionsOf(form).filter(isOwnQuestion)

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
  /** A Ministry's own question of a kind it cannot be (ticket 12). */
  | 'intake_form.kind_unknown'
  /** A one-choice or several-choices question with fewer than two choices. */
  | 'intake_form.needs_two_choices'
  /** Two choices on one question worded the same. */
  | 'intake_form.choices_repeat'
  /**
   * A choice already on the form emptied. Choices are reworded and added, and
   * taking one off would take its answers with it, which is the removal rule
   * questions follow (ticket 13), not an edit.
   */
  | 'intake_form.choice_kept'
  /** Name or mobile number removed: they are who somebody is (ticket 13). */
  | 'intake_form.always_asked'
  /**
   * The side removed while the first-time question, worded from it, is still
   * asked; or the first-time question added back to a form that no longer asks
   * the side.
   */
  | 'intake_form.worded_from_it'

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
  const pageOf = new Map<QuestionKey, number>()
  pages.forEach((each, index) => {
    for (const question of each.questions) pageOf.set(question.key, index)
  })
  const placed = pages.flatMap((each, index) => each.questions.map((question) => ({ question, index })))

  for (const { question, index } of placed) {
    if (rulesOf(question).staysOnTheLastPage && index !== last) {
      return 'intake_form.stays_on_the_last_page'
    }
  }
  for (const { question, index } of placed) {
    const anchor = rulesOf(question).after
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

/**
 * What an Admin typed into the choices of one of the Ministry's own questions
 * (ticket 12): each choice already on it, by its id, and the new ones, one to a
 * line of the box under them.
 */
export interface ChoicesAsTyped {
  readonly kept: readonly { readonly id: string; readonly wording: string }[]
  readonly added: readonly string[]
}

const NO_CHOICES: ChoicesAsTyped = { kept: [], added: [] }

/** What an Admin typed into an open question's row. */
export interface QuestionAsTyped {
  readonly wording: string
  /** The first-time question's second box; ignored on every other question. */
  readonly menteeWording: string | null
  readonly hint: string
  readonly required: boolean
  /** A choice question of the Ministry's own; ignored on every other question. */
  readonly choices?: ChoicesAsTyped
}

/** Where a new choice's id comes from. A test hands in a sequence; the boundary, its own ids. */
export type NewId = () => string

const noNewIds: NewId = () => {
  throw new Error('This edit was given nothing to mint a new id with')
}

/**
 * A choice question's choices as an Admin left them: each one already there
 * reworded where its box was, kept as it was where the box did not come back
 * (somebody else added it while this row was open), and the new ones after them
 * in the order they were typed.
 *
 * A choice emptied is refused rather than taken off. Answers point at a choice,
 * so taking one off would take its answers with it, and that is the removal rule
 * (ADR-0014; ticket 13), not an edit.
 */
const choicesAsLeft = (
  was: readonly OwnChoice[],
  typed: ChoicesAsTyped,
  newId: NewId,
): readonly OwnChoice[] | IntakeFormRefusal => {
  const kept: OwnChoice[] = []
  for (const choice of was) {
    const box = typed.kept.find((each) => each.id === choice.id)
    if (!box) {
      kept.push(choice)
      continue
    }
    const wording = wordingOf(box.wording)
    if (wording === null) return 'intake_form.choice_kept'
    kept.push(wording === choice.wording ? choice : { ...choice, wording })
  }
  const added = typed.added.flatMap((line) => {
    const wording = wordingOf(line)
    return wording === null ? [] : [{ id: newId(), wording }]
  })

  const choices = [...kept, ...added]
  if (choices.length < 2) return 'intake_form.needs_two_choices'
  const said = choices.map((choice) => choice.wording.toLocaleLowerCase('en'))
  if (new Set(said).size !== said.length) return 'intake_form.choices_repeat'
  return choices
}

export const editQuestion = (
  form: IntakeForm,
  key: string,
  typed: QuestionAsTyped,
  newId: NewId = noNewIds,
): FormEdit => {
  const question = questionOn(form, key)
  if (!question) return { refusal: 'intake_form.not_found' }

  const wording = wordingOf(typed.wording)
  const hasTwoWordings = question.menteeWording !== null
  const menteeWording = hasTwoWordings ? wordingOf(typed.menteeWording) : null
  if (wording === null || (hasTwoWordings && menteeWording === null)) {
    return { refusal: 'intake_form.question_needs_wording' }
  }
  if (!typed.required && rulesOf(question).requiredFixed) {
    return { refusal: 'intake_form.always_required' }
  }
  // An emptied hint is no hint, rather than a refusal: the hint is optional.
  const hint = wordingOf(typed.hint)

  let edited: FormQuestion
  if (isOwnQuestion(question)) {
    const choices = hasChoices(question.kind)
      ? choicesAsLeft(question.choices, typed.choices ?? NO_CHOICES, newId)
      : question.choices
    if (typeof choices === 'string') return { refusal: choices }
    edited = { ...question, wording, hint, required: typed.required, choices }
  } else {
    edited = { ...question, wording, menteeWording, hint, required: typed.required }
  }

  if (
    edited.wording === question.wording
    && edited.menteeWording === question.menteeWording
    && edited.hint === question.hint
    && edited.required === question.required
    && sameChoices(edited, question)
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

const sameChoices = (a: FormQuestion, b: FormQuestion): boolean => {
  const these = isOwnQuestion(a) ? a.choices : []
  const those = isOwnQuestion(b) ? b.choices : []
  return (
    these.length === those.length
    && these.every((choice, at) => choice.id === those[at]?.id && choice.wording === those[at]?.wording)
  )
}

/**
 * A question of the Ministry's own, added at the foot of a page (ticket 12): worded
 * in the row that opened for it, with its choices where its kind has them. A kind
 * somebody types into is asked on the last page only, for the reason the name is.
 */
export const addQuestion = (
  form: IntakeForm,
  pageId: string,
  key: OwnQuestionKey,
  kind: string,
  typed: QuestionAsTyped,
  newId: NewId,
): FormEdit => {
  const at = form.pages.findIndex((each) => each.id === pageId)
  if (at < 0) return { refusal: 'intake_form.not_found' }
  if (!isOwnKind(kind)) return { refusal: 'intake_form.kind_unknown' }
  if (questionOn(form, key)) return { refusal: 'intake_form.changed' }

  const wording = wordingOf(typed.wording)
  if (wording === null) return { refusal: 'intake_form.question_needs_wording' }

  const choices = hasChoices(kind) ? choicesAsLeft([], typed.choices ?? NO_CHOICES, newId) : []
  if (typeof choices === 'string') return { refusal: choices }

  const added: OwnQuestion = {
    key,
    wording,
    menteeWording: null,
    hint: wordingOf(typed.hint),
    required: typed.required,
    kind,
    choices,
  }
  const pages = form.pages.map((each, index) =>
    index === at ? { ...each, questions: [...each.questions, added] } : each,
  )

  const refusal = arrangementRefusal(pages)
  if (refusal) return { refusal }
  return saved(form, pages)
}

/**
 * Whether a question may be removed at all: every one but the name and the
 * mobile number (ticket 13).
 */
export const isRemovable = (question: FormQuestion): boolean => !rulesOf(question).alwaysAsked

/**
 * The questions on this form that cannot be asked without this one, in the order
 * they are asked: the first-time and one-to-two questions, while the side is
 * being removed. Empty for every other question.
 */
export const neededBy = (form: IntakeForm, key: string): readonly FormQuestion[] =>
  questionsOf(form).filter((question) => !isOwnQuestion(question) && BUILT_IN[question.key].needs === key)

/**
 * The form without one of its questions (ticket 13). Taking a question off the
 * form is half of a removal: its answers are deleted beside the new version, by
 * the effect the boundary adds, because a removal destroys what it removes
 * (ADR-0014). A question the product reads may be removed like any other; what
 * stops working is said to the Admin before it happens and by each surface
 * afterwards.
 */
export const removeQuestion = (form: IntakeForm, key: string): FormEdit => {
  const question = questionOn(form, key)
  if (!question) return { refusal: 'intake_form.not_found' }
  if (!isRemovable(question)) return { refusal: 'intake_form.always_asked' }
  if (neededBy(form, key).length > 0) return { refusal: 'intake_form.worded_from_it' }

  return saved(
    form,
    form.pages.map((each) => ({ ...each, questions: each.questions.filter((one) => one.key !== key) })),
  )
}

/**
 * Whether removing a question deletes anything (ticket 13). Every question's
 * answers are deleted with it but two, which keep none of their own. The email
 * somebody gave is kept on the Person beside their name and number, as the
 * contact detail it is, whichever form asked for it. And the choice of group is
 * not kept as an answer at all: picking a group joins it or asks to, and what
 * stands is the membership or the request, which a removal does not touch.
 */
export const removalDeletesAnswers = (key: QuestionKey): boolean =>
  key !== 'email' && key !== 'groupId' && key !== 'fullName' && key !== 'phone'

/**
 * One answer given to a question, as a removal reads it just before deleting it
 * (ticket 13), so the history event can keep what the live tables no longer will
 * (ADR-0014). One per submission it was given on, superseded ones included.
 *
 * `answer` is as it was stored: a gender, an age band or a side; true or false
 * for the first-time question; one of its two words for the one-to-two
 * question; the hours ticked as `monday:08` keys; the goal as `{ goalId }` or
 * `{ other }`; and a Ministry's own question's answer as it was kept.
 */
export interface AnswerGiven {
  readonly submissionId: IntakeSubmissionId
  readonly personId: PersonId
  readonly submittedAt: Date
  readonly answer: unknown
}

/**
 * Discipler's own questions this form asked as it was first served and no
 * longer asks: the ones removed from it, which *Add a question* offers back
 * (ticket 13). In the order the preset asks them.
 */
export const removedQuestions = (form: IntakeForm): readonly BuiltInQuestion[] =>
  questionsOf(presetForm(form.name)).flatMap((question) =>
    !isOwnQuestion(question) && !questionOn(form, question.key) ? [question.key] : [],
  )

/**
 * A submission as it is kept: read against the version its Person opened, kept
 * against the form as it stands (James, 2026-10-13). An answer to a question the
 * form has stopped asking since they opened it is dropped and never stored, as
 * Google Forms drops one; everything else they said is kept. What goes is exactly
 * what the removal would have deleted had they submitted a moment before it, so
 * the email and the group they picked stand (`removalDeletesAnswers`).
 *
 * Discipler's own questions are dropped by `removedQuestions`, against the form's
 * preset, so the reopened page keeps the goal it asks of somebody whose last form
 * was the groups form, which never asked it. A Ministry's own question is dropped
 * where the form no longer has its key.
 */
export const withoutWhatIsNoLongerAsked = (
  submission: IntakeSubmissionDraft,
  current: IntakeForm,
): IntakeSubmissionDraft => {
  const asked = stillKept(current)
  return {
    ...submission,
    ageBand: asked('ageBand') ? submission.ageBand : null,
    gender: asked('gender') ? submission.gender : null,
    goalId: asked('goalId') ? submission.goalId : null,
    goalOther: asked('goalId') ? submission.goalOther : null,
    availability: asked('availability') ? submission.availability : [],
    declaredSide: asked('side') ? submission.declaredSide : null,
    firstTime: asked('experience') ? submission.firstTime : null,
    oneToTwo: asked('oneToTwo') ? submission.oneToTwo : null,
    ownAnswers: submission.ownAnswers.filter((answer) => asked(answer.key)),
  }
}

/**
 * Whether an answer to this question is kept against the form as it stands, the
 * one rule `withoutWhatIsNoLongerAsked` applies. Also what the page after Submit
 * reads, so it never lists an answer that was just dropped.
 */
export const stillKept = (current: IntakeForm): ((key: QuestionKey) => boolean) => {
  const removed = new Set<QuestionKey>(removedQuestions(current).filter(removalDeletesAnswers))
  return (key) => (isOwnQuestionKey(key) ? questionOn(current, key) !== undefined : !removed.has(key))
}

/**
 * One of Discipler's own questions, put back at the foot of a page in the words
 * the preset asks it in (ticket 13). It is the same question, under the same key,
 * and it starts with no answers: the ones given before were deleted when it was
 * removed.
 */
export const addBackQuestion = (form: IntakeForm, pageId: string, key: string): FormEdit => {
  const at = form.pages.findIndex((each) => each.id === pageId)
  if (at < 0) return { refusal: 'intake_form.not_found' }
  if (!isBuiltInQuestion(key) || !removedQuestions(form).includes(key)) return { refusal: 'intake_form.changed' }
  const needs = BUILT_IN[key].needs
  if (needs !== null && !questionOn(form, needs)) return { refusal: 'intake_form.worded_from_it' }

  const asked = questionOn(presetForm(form.name), key)!
  const pages = form.pages.map((each, index) =>
    index === at ? { ...each, questions: [...each.questions, asked] } : each,
  )
  const refusal = arrangementRefusal(pages)
  if (refusal) return { refusal }
  return saved(form, pages)
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
