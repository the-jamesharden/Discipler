import { isOneOf, isSlotKey } from '~/domain/intake'

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
}

type FieldOf<L extends ChoiceLists> = keyof L | 'availability'

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
}

export type WizardQuery = Record<string, string | string[] | undefined>

/** How somebody reached the wizard. Anything else is the link, which is the primary path. */
export type IntakeVia = 'link' | 'qr'

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
    field === 'availability'
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
    }) as Answers

  /**
   * How far these answers reach: the first screen whose question is still
   * unanswered.
   *
   * One rule rather than a guard per screen. Somebody who edits the step in the
   * URL gets the earliest screen they have not answered -- which is what they
   * would have been shown anyway.
   */
  const furthestStep = (answers: Answers): number => {
    const unanswered = screens.findIndex((screen) =>
      screen.asks.some((field) => !answered(answers, field)),
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
   * leaving unanswered: a checkbox set cannot express *at least one of these*,
   * which is the argument the pairing screen's leader checkboxes already make.
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
   * The answers as a query string, for the link back to the previous screen.
   *
   * Composed from what was read rather than from what arrived, so the way back
   * carries exactly the answers Discipler recognises and nothing somebody typed
   * into a URL.
   */
  const answersAsQuery = (answers: Answers, via: IntakeVia, step: number): URLSearchParams => {
    const params = new URLSearchParams()
    params.set('step', String(step))
    if (via === 'qr') params.set('via', 'qr')
    for (const field of CHOICE_FIELDS) {
      const answer = answers[field]
      if (answer !== null) params.set(field, answer)
    }
    for (const slot of answers.availability) params.append('availability', slot)
    return params
  }

  return {
    CHOICE_FIELDS,
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
    answersAsQuery,
  }
}

/** What `defineWizard` hands back, for the shell that renders any of them. */
export type Wizard<L extends ChoiceLists> = ReturnType<typeof defineWizard<L>>
