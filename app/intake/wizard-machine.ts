import { isOneOf, isSlotKey } from '~/domain/intake'
import {
  isOwnQuestion,
  isOwnQuestionKey,
  isTypedKind,
  ownQuestionsOf,
  type FormQuestion,
  type IntakeForm,
  type OwnQuestionKey,
} from '~/domain/intake-form'
import { NO, YES } from '~/domain/own-answers'

/**
 * The stepping rules every Intake wizard shares: which screen a set of answers
 * entitles somebody to see, what a screen carries forward as hidden inputs, and
 * how the answers travel in a URL.
 *
 * The answers travel between screens rather than to the database: nothing is
 * written until the last step submits, so each screen carries every earlier answer
 * forward and the whole form arrives at the boundary in one piece. A wizard that
 * wrote per step would put a half-finished Person on the Roster who never reached
 * the consent checkbox.
 *
 * They travel as hidden inputs on a GET form, which puts them in the URL of the
 * next screen. That is what makes the browser's own Back button work -- a wizard
 * whose steps were POSTs would answer it with *confirm form resubmission* -- and it
 * is why the last screen is the only POST: it is the one carrying a name and a
 * number, and those are not going in a URL.
 *
 * Every value is checked here against the same lists the form offers, so nothing
 * that arrives in a query string is ever rendered back into the page. What survives
 * is one of the answers Discipler served or nothing at all.
 *
 * There are two wizards -- discipleship, and the group form -- and they ask
 * different questions in a different order. What they share is everything above,
 * so it is written once and each wizard is a table of screens handed to it.
 */

/**
 * Each single-choice answer beside the list it has to come from. The field name
 * is also the name on the wire, so a hidden input and the query string it lands in
 * cannot drift apart.
 *
 * Availability is not among them and is handled beside every use of this: it is a
 * list rather than a choice, so it reads with `getAll`, writes with `append`, and
 * is empty rather than null when unanswered.
 */
export type ChoiceLists = Readonly<Record<string, readonly string[]>>

export type AnswersOf<L extends ChoiceLists> = {
  readonly [F in keyof L]: L[F][number] | null
} & {
  readonly availability: readonly string[]
  /**
   * The answers to the Ministry's own choice questions (Pastor feedback, ticket
   * 12), by question key: the ids of the choices picked, or `yes` or `no`. Empty
   * where unanswered, like the grid.
   */
  readonly own: Readonly<Record<string, readonly string[]>>
}

export type FieldOf<L extends ChoiceLists> = keyof L | 'availability' | OwnQuestionKey

/**
 * One of the Ministry's own questions a wizard carries between screens (ticket
 * 12): a choice question, whose answers are ids Discipler served and so may go in
 * a URL as the built-in answers do. A question somebody types into is never one
 * of these: it is asked on the last page and posted from it, as the name is.
 *
 * `allowed` is every value the question offers; anything else in a URL is
 * dropped, as an answer to a built-in question is.
 */
export interface OwnField {
  readonly key: OwnQuestionKey
  readonly multiple: boolean
  readonly allowed: readonly string[]
}

/** The Ministry's own questions on a version of its form that travel between screens. */
export const ownFieldsOf = (form: IntakeForm): readonly OwnField[] =>
  ownQuestionsOf(form).flatMap((question) =>
    isTypedKind(question.kind)
      ? []
      : [
          {
            key: question.key,
            multiple: question.kind === 'several_choices',
            allowed: question.kind === 'yes_no' ? [YES, NO] : question.choices.map((choice) => choice.id),
          },
        ],
  )

/**
 * The field a question of the Ministry's own travels under, where it travels at
 * all: a choice question, by its key. A question somebody types into is posted
 * from the last page and never carried.
 */
export const ownFieldFor = (question: FormQuestion): OwnQuestionKey | null =>
  isOwnQuestion(question) && !isTypedKind(question.kind) ? question.key : null

/**
 * One screen: what it asks for, and what its own question rewords.
 *
 * `rewords` is the second thing a screen can do to an answer. The discipleship
 * wizard's first-time question is *worded* from the side, so re-answering the side
 * puts a different question above the answer already given; the group form's list
 * of groups is *filtered* by the gender, so re-answering the gender puts a
 * different list under the group already chosen. Carried forward, either would be
 * an answer nobody gave. So a screen drops what it rewords, and the question is
 * put again. Coming back and pressing Continue with the same answer costs one
 * screen; the alternative costs an answer that is wrong and looks given.
 */
export interface Screen<L extends ChoiceLists> {
  readonly asks: readonly FieldOf<L>[]
  readonly rewords: readonly FieldOf<L>[]
  /**
   * What the screen asks that may be left unanswered, because the Ministry's
   * form made it optional (Pastor feedback, ticket 11). Asked and not carried
   * like everything else on the screen, and never what stops somebody moving on.
   */
  readonly optional?: readonly FieldOf<L>[]
}

export type WizardQuery = Record<string, string | string[] | undefined>

/** How somebody reached the wizard. Anything else is the link, which is the primary path. */
export type IntakeVia = 'link' | 'qr'

/**
 * Which version of the Ministry's form somebody opened, and whether it is an
 * Admin's preview (Pastor feedback, ticket 11). Carried from screen to screen
 * like the answers, so somebody part-way through is served the version they
 * started however the form is edited meanwhile, and a preview stays a preview
 * to the end, where it records nothing.
 */
export interface FormPin {
  readonly version: number
  readonly preview: boolean
}

/**
 * The version a URL names, or null for none: a whole number from 0 up. A
 * version this Ministry never saved is the reader's to replace with the form
 * as it stands.
 */
export const readVersion = (value: string | string[] | null | undefined): number | null => {
  const raw = firstValue(value) ?? ''
  return /^\d{1,9}$/.test(raw) ? Number.parseInt(raw, 10) : null
}

/** Whether a URL or a form says this is an Admin's preview. Only `1` is. */
export const readPreview = (value: string | string[] | null | undefined): boolean =>
  firstValue(value) === '1'

/**
 * The first value under a name, for the several places a query string may honestly
 * carry one or many. Exported because the wizard is not the only page reading its
 * own answers back out of a URL -- the done pages read theirs, and the pages read
 * the refusal codes -- and three spellings of *first value* is three places to get
 * an array where a string was expected.
 */
export const firstValue = (value: string | string[] | null | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null)

const all = (value: string | string[] | undefined): readonly string[] =>
  value === undefined ? [] : [value].flat()

export const readVia = (value: string | string[] | null | undefined): IntakeVia =>
  firstValue(value) === 'qr' ? 'qr' : 'link'

/**
 * A wizard: its screens in the order they are asked, and every stepping rule read
 * off that list. The list is the only place the order is written down. How far a
 * set of answers reaches, which screen a request is entitled to, what a screen
 * carries forward as hidden inputs, which step its Continue button names and
 * which screen each of them is are all read from here, so a screen added in the
 * middle moves every number and none of the code.
 */
export const defineWizard = <L extends ChoiceLists>(
  lists: L,
  screens: readonly Screen<L>[],
  own: readonly OwnField[] = [],
) => {
  type Answers = AnswersOf<L>
  type Field = FieldOf<L>

  const CHOICE_FIELDS = Object.keys(lists) as readonly (keyof L & string)[]

  /** The screen with the Submit button on it. The done page is not a step. */
  const LAST_STEP = screens.length

  /**
   * What the screen at this step asks for. Total, because the caller holds a
   * number: a step outside the wizard asks for nothing, which is the safe answer.
   */
  const asksAt = (step: number): readonly Field[] => screens[step - 1]?.asks ?? []

  /**
   * What the screen at this step must not carry as a hidden input: the answers it
   * is asking for itself -- a hidden `ageBand` beside the age question would send
   * two of them -- and the answers its own question rewords, which are dropped so
   * they are asked again in the words that now apply.
   */
  const notCarriedAt = (step: number): readonly Field[] => [
    ...asksAt(step),
    ...(screens[step - 1]?.rewords ?? []),
  ]

  /** Which screen asks for a given answer, as a step number. */
  const stepAsking = (field: Field): number =>
    screens.findIndex((screen) => screen.asks.some((asked) => asked === field)) + 1

  const FIRST_STEP = 1
  const AVAILABILITY_STEP = stepAsking('availability')

  /** Whether an answer has been given. The grid is a list, so its empty is a length. */
  const answered = (answers: Answers, field: Field): boolean =>
    isOwnQuestionKey(field)
      ? (answers.own[field]?.length ?? 0) > 0
      : field === 'availability'
        ? answers.availability.length > 0
        : answers[field as keyof L] !== null

  /** One answer off the query string, checked against the list the form offered it from. */
  const oneOf = <T extends string>(
    allowed: readonly T[],
    value: string | string[] | undefined,
  ): T | null => {
    const answer = firstValue(value)
    return isOneOf(allowed, answer) ? answer : null
  }

  /**
   * Every answer off a query string, each checked against the list its own field
   * was offered from. A wizard whose list is not known until the page is served --
   * the group form's groups -- hands the list in as `offered`, and the answer is
   * checked against that rather than against the empty list it was defined with.
   *
   * The one cast is the price of reading the fields from one table:
   * `Object.fromEntries` cannot say that the `side` key holds a `DeclaredSide`,
   * and the lists are what make it true, one line above.
   */
  const readAnswers = (
    query: WizardQuery,
    offered: Partial<{ readonly [F in keyof L]: readonly string[] }> = {},
  ): Answers =>
    ({
      ...Object.fromEntries(
        CHOICE_FIELDS.map((field) => [
          field,
          oneOf(offered[field] ?? lists[field] ?? [], query[field]),
        ]),
      ),
      availability: all(query.availability).filter(isSlotKey),
      own: Object.fromEntries(
        own.map((field) => {
          const offered = [...new Set(all(query[field.key]).filter((value) => field.allowed.includes(value)))]
          return [field.key, field.multiple ? offered : offered.slice(0, 1)]
        }),
      ),
    }) as Answers

  /**
   * How far these answers reach: the first screen with a required question still
   * unanswered.
   *
   * One rule rather than a guard per screen. Somebody who edits the step in the
   * URL gets the earliest screen they have not answered -- which is what they
   * would have been shown anyway. A question the form made optional stops
   * nobody, answered or not.
   */
  const furthestStep = (answers: Answers): number => {
    const unanswered = screens.findIndex((screen) =>
      screen.asks.some(
        (field) => !(screen.optional ?? []).includes(field) && !answered(answers, field),
      ),
    )
    return unanswered === -1 ? LAST_STEP : unanswered + 1
  }

  /** Which screen was asked for, clamped to the ones that exist. */
  const requestedStep = (requested: string | string[] | undefined): number => {
    const asked = Number.parseInt(firstValue(requested) ?? '', 10)
    return Number.isInteger(asked) ? Math.min(Math.max(asked, FIRST_STEP), LAST_STEP) : FIRST_STEP
  }

  const stepToShow = (requested: string | string[] | undefined, answers: Answers): number =>
    Math.min(requestedStep(requested), furthestStep(answers))

  /**
   * The availability screen is the only one a browser will not stop somebody
   * leaving unanswered: a checkbox set cannot express *at least one of these*.
   * Every other screen is a `required` radio or select, so pressing Continue there
   * never reaches the server at all.
   *
   * So it is the one screen that can be asked to move on and refuse to, and the one
   * that has to say why -- otherwise Continue does nothing and says nothing.
   */
  const stuckOnAvailability = (
    requested: string | string[] | undefined,
    answers: Answers,
  ): boolean =>
    stepToShow(requested, answers) === AVAILABILITY_STEP
    && requestedStep(requested) > AVAILABILITY_STEP

  /**
   * The same for a required question of the Ministry's own that a browser cannot
   * hold somebody on (ticket 12): several choices is a set of checkboxes, as the
   * grid is. Whether the screen shown is short of a later one it was asked to move
   * past because one of those is unanswered.
   */
  const stuckOnOwnQuestion = (
    requested: string | string[] | undefined,
    answers: Answers,
  ): boolean => {
    const shown = stepToShow(requested, answers)
    if (requestedStep(requested) <= shown) return false
    const screen = screens[shown - 1]
    return (screen?.asks ?? []).some(
      (field) =>
        isOwnQuestionKey(field) && !(screen?.optional ?? []).includes(field) && !answered(answers, field),
    )
  }

  /**
   * The answers as a query string, for the link back to the previous screen.
   *
   * Composed from what was read rather than from what arrived, so the way back
   * carries exactly the answers Discipler recognises and nothing somebody typed
   * into a URL.
   */
  const answersAsQuery = (
    answers: Answers,
    via: IntakeVia,
    step: number,
    pin?: FormPin,
  ): URLSearchParams => {
    const params = new URLSearchParams()
    params.set('step', String(step))
    if (via === 'qr') params.set('via', 'qr')
    if (pin) params.set('v', String(pin.version))
    if (pin?.preview) params.set('preview', '1')
    for (const field of CHOICE_FIELDS) {
      const answer = answers[field]
      if (answer !== null) params.set(field, answer)
    }
    for (const slot of answers.availability) params.append('availability', slot)
    for (const field of own) {
      for (const value of answers.own[field.key] ?? []) params.append(field.key, value)
    }
    return params
  }

  return {
    CHOICE_FIELDS,
    OWN_FIELDS: own,
    SCREENS: screens,
    FIRST_STEP,
    LAST_STEP,
    AVAILABILITY_STEP,
    asksAt,
    notCarriedAt,
    stepAsking,
    readAnswers,
    furthestStep,
    requestedStep,
    stepToShow,
    stuckOnAvailability,
    stuckOnOwnQuestion,
    answersAsQuery,
  }
}

/** What `defineWizard` hands back, for the shell that renders any of them. */
export type Wizard<L extends ChoiceLists> = ReturnType<typeof defineWizard<L>>
