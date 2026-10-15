import { AGE_BANDS, DECLARED_SIDES, EXPERIENCE_ANSWERS, GENDERS, ONE_TO_TWO_ANSWERS } from '~/domain/intake'
import { askedPages, isOwnQuestion, presetForm, type BuiltInQuestion, type IntakeForm } from '~/domain/intake-form'
import { defineWizard, ownFieldFor, ownFieldsOf, type AnswersOf, type Screen } from './wizard-machine'

export {
  firstValue,
  readPreview,
  readVersion,
  readVia,
  type FormPin,
  type IntakeVia,
  type WizardQuery,
} from './wizard-machine'

/**
 * The discipleship wizard: which screen somebody is entitled to see, and what each
 * screen carries. The stepping rules live in `wizard-machine`; the screens are the
 * pages of the version of the Ministry's form being served, and this is how they
 * are read off it.
 */

/**
 * Each single-choice answer beside the list it has to come from. The five are
 * written down here and nowhere else: what a screen carries forward as a hidden
 * input, what `readWizardAnswers` accepts off a query string and what the way back
 * puts into one are all read from this table.
 */
const LISTS = {
  side: DECLARED_SIDES,
  ageBand: AGE_BANDS,
  gender: GENDERS,
  experience: EXPERIENCE_ANSWERS,
  oneToTwo: ONE_TO_TWO_ANSWERS,
} as const

export type WizardAnswers = AnswersOf<typeof LISTS>

type Carried = keyof typeof LISTS | 'availability'

/**
 * The questions whose answers travel between screens, by the field they travel
 * under. The rest -- the goal, the name, the number and the email -- are asked on
 * the last page and posted from it, so they never gate a screen and never appear
 * in a hidden input.
 */
const CARRIED: Partial<Record<BuiltInQuestion, Carried>> = {
  side: 'side',
  ageBand: 'ageBand',
  gender: 'gender',
  experience: 'experience',
  oneToTwo: 'oneToTwo',
  availability: 'availability',
}

/**
 * The screens of one version of the Ministry's form (Pastor feedback, ticket 11):
 * one per page with a question on it, in the order the form has them.
 *
 * A screen asking the side rewords the first-time question: *have you mentored
 * someone before* and *have you been discipled before* are different questions, so
 * a side re-answered drops the first-time answer rather than carrying it under the
 * wrong words. The one-to-two question is worded from the side too -- *mentoring
 * two mentees together* and *being mentored alongside another mentee* -- and is
 * dropped for the same reason. The form keeps both on a later page than the side,
 * so each is always asked again in the words that now apply.
 */
export const screensOf = (form: IntakeForm): readonly Screen<typeof LISTS>[] =>
  askedPages(form).map((page) => {
    const carried = page.questions.flatMap((question) => {
      const field = isOwnQuestion(question) ? ownFieldFor(question) : CARRIED[question.key]
      return field ? [{ field, required: question.required }] : []
    })
    const asks = carried.map((each) => each.field)
    return {
      asks,
      rewords: asks.includes('side') ? ['experience', 'oneToTwo'] : [],
      optional: carried.filter((each) => !each.required).map((each) => each.field),
    }
  })

/** The wizard for one version of the Ministry's mentor and mentee form. */
export const discipleshipWizardFor = (form: IntakeForm) =>
  defineWizard(LISTS, screensOf(form), ownFieldsOf(form))

/**
 * The wizard every Ministry is served until it edits its form: today's six
 * screens. Its names are what the tests read the stepping rules by.
 */
const wizard = discipleshipWizardFor(presetForm('discipleship'))

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
 * The preset's screens by name. The screens themselves are told apart by these
 * rather than by their positions, so the order lives in the form and only there.
 */
export const SIDE_STEP = wizard.stepAsking('side')
export const AGE_AND_GENDER_STEP = wizard.stepAsking('ageBand')
export const FIRST_TIME_STEP = wizard.stepAsking('experience')
export const ONE_TO_TWO_STEP = wizard.stepAsking('oneToTwo')

export const readWizardAnswers = wizard.readAnswers
