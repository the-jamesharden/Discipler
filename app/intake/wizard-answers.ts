import {
  AGE_BANDS,
  DAY_BLOCKS,
  DECLARED_SIDES,
  EXPERIENCE_ANSWERS,
  GENDERS,
  WEEKDAYS,
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

/** The screen with the Submit button on it. The done page is not a step. */
export const LAST_STEP = 5

export type WizardQuery = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? (value[0] ?? null) : (value ?? null))

const all = (value: string | string[] | undefined): readonly string[] =>
  value === undefined ? [] : [value].flat()

const oneOf = <T extends string>(
  allowed: readonly T[],
  value: string | string[] | undefined,
): T | null => {
  const answer = first(value)
  return allowed.includes(answer as T) ? (answer as T) : null
}

/** The thirty-five the grid submits, and nothing a hand-written URL invented. */
const SLOT_KEYS = new Set(
  WEEKDAYS.flatMap((day) => DAY_BLOCKS.map((block) => `${day}:${block}`)),
)

export const readWizardAnswers = (query: WizardQuery): WizardAnswers => ({
  side: oneOf(DECLARED_SIDES, query.side),
  ageBand: oneOf(AGE_BANDS, query.ageBand),
  gender: oneOf(GENDERS, query.gender),
  experience: oneOf(EXPERIENCE_ANSWERS, query.experience),
  availability: all(query.availability).filter((key) => SLOT_KEYS.has(key)),
})

/**
 * How far these answers reach: the first screen whose question is still
 * unanswered.
 *
 * One rule rather than a guard per screen. Somebody who edits the step in the URL
 * gets the earliest screen they have not answered -- which is what they would have
 * been shown anyway -- and every later screen's wording depends on the side, so a
 * screen reached without one has nothing to say.
 */
export const furthestStep = (answers: WizardAnswers): number => {
  if (answers.side === null) return 1
  if (answers.ageBand === null || answers.gender === null) return 2
  if (answers.experience === null) return 3
  if (answers.availability.length === 0) return 4
  return LAST_STEP
}

/** Which screen was asked for, clamped to the ones that exist. */
export const requestedStep = (requested: string | string[] | undefined): number => {
  const asked = Number.parseInt(first(requested) ?? '', 10)
  return Number.isInteger(asked) ? Math.min(Math.max(asked, 1), LAST_STEP) : 1
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
  stepToShow(requested, answers) === 4 && requestedStep(requested) > 4

/**
 * The answers as a query string, for the link back to the previous screen.
 *
 * Composed from what was read rather than from what arrived, so the way back
 * carries exactly the answers Discipler recognises and nothing somebody typed into
 * a URL.
 */
export const answersAsQuery = (
  answers: WizardAnswers,
  via: 'link' | 'qr',
  step: number,
): URLSearchParams => {
  const params = new URLSearchParams()
  params.set('step', String(step))
  if (via === 'qr') params.set('via', 'qr')
  if (answers.side) params.set('side', answers.side)
  if (answers.ageBand) params.set('ageBand', answers.ageBand)
  if (answers.gender) params.set('gender', answers.gender)
  if (answers.experience) params.set('experience', answers.experience)
  for (const slot of answers.availability) params.append('availability', slot)
  return params
}
