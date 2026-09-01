import { AGE_BANDS, DECLARED_SIDES, EXPERIENCE_ANSWERS, GENDERS } from '~/domain/intake'
import { defineWizard, type AnswersOf } from './wizard-machine'

export { firstValue, readVia, type IntakeVia, type WizardQuery } from './wizard-machine'

/**
 * The discipleship wizard: which screen somebody is entitled to see, and what each
 * screen carries. The stepping rules live in `wizard-machine`; this is the table
 * of screens they are read off, and the names the screens go by.
 */

/**
 * Each single-choice answer beside the list it has to come from. The four are
 * written down here and nowhere else: what a screen carries forward as a hidden
 * input, what `readWizardAnswers` accepts off a query string and what the way back
 * puts into one are all read from this table.
 */
const LISTS = {
  side: DECLARED_SIDES,
  ageBand: AGE_BANDS,
  gender: GENDERS,
  experience: EXPERIENCE_ANSWERS,
} as const

export type WizardAnswers = AnswersOf<typeof LISTS>

/**
 * The screens, in the order they are asked, and the answers each one collects.
 *
 * The first screen rewords the first-time question: *have you mentored someone
 * before* and *have you been discipled before* are different questions, so a side
 * re-answered drops the first-time answer rather than carrying it under the wrong
 * words. The last screen asks for nothing the wizard carries between screens: it
 * collects a name and a number and posts them, so it never gates anything and
 * never appears in a hidden input.
 */
const wizard = defineWizard(LISTS, [
  { asks: ['side'], rewords: ['experience'] },
  { asks: ['ageBand', 'gender'], rewords: [] },
  { asks: ['experience'], rewords: [] },
  { asks: ['availability'], rewords: [] },
  { asks: [], rewords: [] },
])

export const discipleshipWizard = wizard

export const {
  CHOICE_FIELDS,
  SCREENS,
  LAST_STEP,
  AVAILABILITY_STEP,
  asksAt,
  notCarriedAt,
  furthestStep,
  requestedStep,
  stepToShow,
  stuckOnAvailability,
  answersAsQuery,
} = wizard

/**
 * The screens by name. The screens themselves are told apart by these rather than
 * by their positions, so the order lives in the table above and only there -- a
 * screen inserted in the middle moves every number here and none of the code.
 */
export const SIDE_STEP = wizard.stepAsking('side')
export const AGE_AND_GENDER_STEP = wizard.stepAsking('ageBand')
export const FIRST_TIME_STEP = wizard.stepAsking('experience')

export const readWizardAnswers = wizard.readAnswers
