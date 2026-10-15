import { AGE_BANDS, GENDERS, GROUP_PATH } from '~/domain/intake'
import {
  askedPages,
  isOwnQuestion,
  isOwnQuestionKey,
  presetForm,
  type BuiltInQuestion,
  type IntakeForm,
} from '~/domain/intake-form'
import { discipleshipWizardFor } from './wizard-answers'
import {
  defineWizard,
  ownFieldFor,
  ownFieldsOf,
  type AnswersOf,
  type IntakeVia,
  type Screen,
} from './wizard-machine'

/**
 * The group form: the wizard behind `/intake/<ministry>` since ticket 29. Today's
 * form asks gender and age band, then when the Person could meet, then which group
 * they would like to join, and then everything the single page always asked -- a
 * name, a number, and the two consents. Since Pastor feedback ticket 11 the pages
 * and their order are the Ministry's own form's.
 *
 * Gender comes before the group because the list of groups is filtered on it: a
 * men's group offered to a woman is the absolute pairing constraint broken at the
 * point of asking. That is also why a screen asking the gender rewords the group
 * answer. A Person who goes back and changes their gender has a different list
 * under the group they chose, and the question is put again; the form keeps the
 * group on a later page than the gender, so there is always a list to put.
 *
 * The Discipleship Goal is not asked. It is the suggestion tiebreaker, and nobody
 * who has named a group is being ranked. The first-time question is not asked
 * either: nothing on this path reads it.
 */
const LISTS = {
  ageBand: AGE_BANDS,
  gender: GENDERS,
  /**
   * The groups the Ministry offers, which are not known until the page is served.
   * Empty here; the page hands `readAnswers` the list it drew the dropdown from,
   * already filtered for the gender answered, and the answer is checked against
   * that. A group nobody was offered never survives the read.
   */
  groupId: [] as readonly string[],
} as const

export type GroupWizardAnswers = AnswersOf<typeof LISTS>

type Carried = keyof typeof LISTS | 'availability'

/** The questions whose answers travel between screens, by the field they travel under. */
const CARRIED: Partial<Record<BuiltInQuestion, Carried>> = {
  ageBand: 'ageBand',
  gender: 'gender',
  availability: 'availability',
  groupId: 'groupId',
}

/** The screens of one version of the Ministry's groups form, one per page with a question. */
export const groupScreensOf = (form: IntakeForm): readonly Screen<typeof LISTS>[] =>
  askedPages(form).map((page) => {
    const carried = page.questions.flatMap((question) => {
      const field = isOwnQuestion(question) ? ownFieldFor(question) : CARRIED[question.key]
      return field ? [{ field, required: question.required }] : []
    })
    const asks = carried.map((each) => each.field)
    return {
      asks,
      rewords: asks.includes('gender') ? ['groupId'] : [],
      optional: carried.filter((each) => !each.required).map((each) => each.field),
    }
  })

/** The wizard for one version of the Ministry's groups form. */
export const groupWizardFor = (form: IntakeForm) =>
  defineWizard(LISTS, groupScreensOf(form), ownFieldsOf(form))

/** The wizard every Ministry is served until it edits its groups form. */
export const groupWizard = groupWizardFor(presetForm(GROUP_PATH))

/**
 * The discipleship wizard's query for somebody on the group form who meant to
 * sign up for mentorship instead (Group form exits, ticket 02): the line under
 * the group step's actions links to it, so what they already answered goes
 * across with them and is not asked twice.
 *
 * Built by the two wizards rather than from a list of names. The group wizard
 * writes its answers as the query it would carry to one of its own screens; the
 * discipleship wizard reads back from that whatever it shares with the group
 * form, checked against its own lists; and the discipleship wizard writes the
 * result as the query of the screen it would open on. So the answers carried
 * are exactly those both forms ask -- on the presets the age band, the gender
 * and the availability -- and nothing else: not the group, which the other form
 * has no question for, and none of a Ministry's own questions, which are each
 * one form's.
 *
 * Both forms are a Ministry's to edit (Pastor feedback, tickets 11 and 13), so
 * either may have stopped asking one of the three. An answer the group form did
 * not ask is not carried even if the URL holds one, and one the discipleship
 * form no longer asks is not carried either, because its submission would
 * refuse an answer to a question it does not ask.
 *
 * The step is the first the discipleship wizard has unanswered -- on the preset,
 * the mentor-or-mentee question -- and the version is the one these answers were
 * matched against, so the page that opens is the form they were matched to.
 * `via` travels as it does between screens, and an Admin's preview stays a
 * preview: following the link from one records nothing at the other end either.
 */
export const mentorshipSwitchQuery = ({
  groupForm,
  discipleshipForm,
  answers,
  via,
  preview,
}: {
  readonly groupForm: IntakeForm
  readonly discipleshipForm: IntakeForm
  readonly answers: GroupWizardAnswers
  readonly via: IntakeVia
  readonly preview: boolean
}): URLSearchParams => {
  const group = groupWizardFor(groupForm)
  const discipleship = discipleshipWizardFor(discipleshipForm)
  const asked = (screens: readonly { readonly asks: readonly unknown[] }[]): readonly string[] =>
    screens.flatMap((screen) => screen.asks.map(String)).filter((field) => !isOwnQuestionKey(field))

  const groupAsks = new Set(asked(group.SCREENS))
  const shared = asked(discipleship.SCREENS).filter((field) => groupAsks.has(field))
  const given = group.answersAsQuery(answers, via, group.FIRST_STEP)
  const carried = discipleship.readAnswers(
    Object.fromEntries(shared.map((field) => [field, given.getAll(field)])),
  )

  return discipleship.answersAsQuery(carried, via, discipleship.furthestStep(carried), {
    version: discipleshipForm.version,
    preview,
  })
}

export const GROUP_AGE_AND_GENDER_STEP = groupWizard.stepAsking('ageBand')
export const GROUP_AVAILABILITY_STEP = groupWizard.AVAILABILITY_STEP
export const GROUP_STEP = groupWizard.stepAsking('groupId')
export const GROUP_LAST_STEP = groupWizard.LAST_STEP
