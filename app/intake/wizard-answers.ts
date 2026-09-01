import {
  AGE_BANDS,
  DECLARED_SIDES,
  EXPERIENCE_ANSWERS,
  GENDERS,
  isOneOf,
  isSlotKey,
  type AgeBand,
  type DeclaredSide,
  type ExperienceAnswer,
  type Gender,
} from '~/domain/intake'

/**
 * What the wizard has been told so far, and which screen that entitles somebody to
 * see.
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
 */

export interface WizardAnswers {
  readonly side: DeclaredSide | null
  readonly ageBand: AgeBand | null
  readonly gender: Gender | null
  readonly experience: ExperienceAnswer | null
  readonly availability: readonly string[]
}

/** Every answer but the grid: one value, chosen from a list the form offered. */
type ChoiceField = Exclude<keyof WizardAnswers, 'availability'>

/**
 * Each single-choice answer beside the list it has to come from.
 *
 * This is the one place those four are written down. What a screen carries forward
 * as a hidden input, what `readWizardAnswers` accepts off a query string and what
 * the way back puts into one are all read from here, because they were four
 * hand-written lists of the same four fields and a fifth answer added to three of
 * them would have gone wrong in the one direction that matters -- somebody's
 * answers, on their way forward, silently.
 *
 * The field name is also the name on the wire, so a hidden input and the query
 * string it lands in cannot drift apart.
 *
 * Availability is not here and is handled beside every use of this: it is a list
 * rather than a choice, so it reads with `getAll`, writes with `append`, and is
 * empty rather than null when unanswered.
 */
const CHOICES: { readonly [F in ChoiceField]: readonly NonNullable<WizardAnswers[F]>[] } = {
  side: DECLARED_SIDES,
  ageBand: AGE_BANDS,
  gender: GENDERS,
  experience: EXPERIENCE_ANSWERS,
}

export const CHOICE_FIELDS = Object.keys(CHOICES) as readonly ChoiceField[]

/**
 * The screens, in the order they are asked, and the answers each one collects.
 *
 * This list is the wizard's order, and it is the only place that order is written
 * down. How far a set of answers reaches, which screen a request is entitled to,
 * what a screen carries forward as hidden inputs, which step its Continue button
 * names and which screen each of them is are all read from here.
 *
 * The wizard was cut out of the single-page form, and for a while the sequence was
 * only implied by how it had been cut: a cascade of step numbers here, a second
 * cascade of `step === n` in the screens, and a literal next-step on every form. A
 * screen added to five of those and not the sixth would have gone wrong quietly, in
 * the one direction that matters -- somebody's answers, on their way forward.
 *
 * `rewords` is the second thing a screen can do to an answer, and the wizard has
 * exactly one of them: the first-time question is *worded* from the side, so
 * re-answering the side puts a different question above the answer already given.
 * Carried forward, an *I have mentored someone before* would arrive under *have you
 * been discipled before* pre-selected -- an answer nobody gave, in the one field the
 * pairing surface reads, and a first-timer recorded as experienced is a mistake
 * nothing downstream could notice. So a screen drops what it rewords, and the
 * question is put again. Coming back and pressing Continue with the same side costs
 * one screen; the alternative costs an answer that is wrong and looks given.
 *
 * The last screen asks for nothing the wizard carries between screens: it collects
 * a name and a number and posts them, so it never gates anything and never appears
 * in a hidden input.
 */
export const SCREENS = [
  { asks: ['side'], rewords: ['experience'] },
  { asks: ['ageBand', 'gender'], rewords: [] },
  { asks: ['experience'], rewords: [] },
  { asks: ['availability'], rewords: [] },
  { asks: [], rewords: [] },
] as const satisfies readonly {
  readonly asks: readonly (keyof WizardAnswers)[]
  readonly rewords: readonly (keyof WizardAnswers)[]
}[]

/** The screen with the Submit button on it. The done page is not a step. */
export const LAST_STEP = SCREENS.length

/**
 * What the screen at this step asks for. Total, because the caller holds a number:
 * a step outside the wizard asks for nothing, which is the safe answer.
 */
export const asksAt = (step: number): readonly (keyof WizardAnswers)[] =>
  SCREENS[step - 1]?.asks ?? []

/**
 * What the screen at this step must not carry as a hidden input: the answers it is
 * asking for itself -- a hidden `ageBand` beside the age question would send two of
 * them -- and the answers its own question rewords, which are dropped so they are
 * asked again in the words that now apply.
 */
export const notCarriedAt = (step: number): readonly (keyof WizardAnswers)[] => [
  ...asksAt(step),
  ...(SCREENS[step - 1]?.rewords ?? []),
]

/** Which screen asks for a given answer, as a step number. */
const stepAsking = (field: keyof WizardAnswers): number =>
  SCREENS.findIndex((screen) => screen.asks.some((asked) => asked === field)) + 1

/**
 * The screens by name. The screens themselves are told apart by these rather than
 * by their positions, so the order lives in `SCREENS` and only in `SCREENS` -- a
 * screen inserted in the middle moves every number here and none of the code.
 *
 * `AVAILABILITY_STEP` carries two rules of its own besides: it is the furthest a
 * Person with no times selected can get, and it is the only screen that can be
 * asked to move on and refuse to.
 */
export const SIDE_STEP = stepAsking('side')
export const AGE_AND_GENDER_STEP = stepAsking('ageBand')
export const FIRST_TIME_STEP = stepAsking('experience')
export const AVAILABILITY_STEP = stepAsking('availability')

/** Whether an answer has been given. The grid is a list, so its empty is a length. */
const answered = (answers: WizardAnswers, field: keyof WizardAnswers): boolean =>
  field === 'availability' ? answers.availability.length > 0 : answers[field] !== null

export type WizardQuery = Record<string, string | string[] | undefined>

/** How somebody reached the wizard. Anything else is the link, which is the primary path. */
export type IntakeVia = 'link' | 'qr'

/**
 * The first value under a name, for the several places a query string may honestly
 * carry one or many. Exported because the wizard is not the only page reading its
 * own answers back out of a URL -- the done page reads the side, and the page reads
 * the refusal codes -- and three spellings of *first value* is three places to get
 * an array where a string was expected.
 */
export const firstValue = (value: string | string[] | null | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null)

const all = (value: string | string[] | undefined): readonly string[] =>
  value === undefined ? [] : [value].flat()

/** One answer off the query string, checked against the list the form offered it from. */
const oneOf = <T extends string>(
  allowed: readonly T[],
  value: string | string[] | undefined,
): T | null => {
  const answer = firstValue(value)
  return isOneOf(allowed, answer) ? answer : null
}

export const readVia = (value: string | string[] | null | undefined): IntakeVia =>
  firstValue(value) === 'qr' ? 'qr' : 'link'

/**
 * Every answer off a query string. The one cast is the price of reading four fields
 * from one table: `Object.fromEntries` cannot say that the `side` key holds a
 * `DeclaredSide`, and `CHOICES` is what makes it true -- each value is checked
 * against the list its own field was offered from, one line above.
 */
export const readWizardAnswers = (query: WizardQuery): WizardAnswers => ({
  ...(Object.fromEntries(
    CHOICE_FIELDS.map((field) => [field, oneOf(CHOICES[field], query[field])]),
  ) as { readonly [F in ChoiceField]: WizardAnswers[F] }),
  availability: all(query.availability).filter(isSlotKey),
})

/**
 * How far these answers reach: the first screen whose question is still
 * unanswered.
 *
 * One rule rather than a guard per screen. Somebody who edits the step in the URL
 * gets the earliest screen they have not answered -- which is what they would have
 * been shown anyway -- and the first-time screen is worded from the side, so a
 * screen reached without one has no question to ask.
 */
export const furthestStep = (answers: WizardAnswers): number => {
  const unanswered = SCREENS.findIndex((screen) =>
    screen.asks.some((field) => !answered(answers, field)),
  )
  return unanswered === -1 ? LAST_STEP : unanswered + 1
}

/** Which screen was asked for, clamped to the ones that exist. */
export const requestedStep = (requested: string | string[] | undefined): number => {
  const asked = Number.parseInt(firstValue(requested) ?? '', 10)
  return Number.isInteger(asked) ? Math.min(Math.max(asked, SIDE_STEP), LAST_STEP) : SIDE_STEP
}

export const stepToShow = (
  requested: string | string[] | undefined,
  answers: WizardAnswers,
): number => Math.min(requestedStep(requested), furthestStep(answers))

/**
 * The availability screen is the only one a browser will not stop somebody leaving
 * unanswered: a checkbox set cannot express *at least one of these*, which is the
 * argument the pairing screen's leader checkboxes already make. Every other screen
 * is a `required` radio or select, so pressing Continue there never reaches the
 * server at all.
 *
 * So it is the one screen that can be asked to move on and refuse to, and the one
 * that has to say why -- otherwise Continue does nothing and says nothing.
 */
export const stuckOnAvailability = (
  requested: string | string[] | undefined,
  answers: WizardAnswers,
): boolean =>
  stepToShow(requested, answers) === AVAILABILITY_STEP
  && requestedStep(requested) > AVAILABILITY_STEP

/**
 * The answers as a query string, for the link back to the previous screen.
 *
 * Composed from what was read rather than from what arrived, so the way back
 * carries exactly the answers Discipler recognises and nothing somebody typed into
 * a URL.
 */
export const answersAsQuery = (
  answers: WizardAnswers,
  via: IntakeVia,
  step: number,
): URLSearchParams => {
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
