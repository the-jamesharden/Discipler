import { AGE_BANDS, GENDERS, GROUP_PATH } from '~/domain/intake'
import {
  askedPages,
  isOwnQuestion,
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
 * sign up for mentorship (Group form exits, ticket 02; its decisions say why
 * each part is so). Each wizard writes and reads its own query: the answers go
 * across for the questions both forms ask, read back against the discipleship
 * wizard's lists, opening on its first unanswered screen, pinned to the version
 * they were matched against, and named as carried so Continue goes past them.
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

  const groupAsks: ReadonlySet<string> = new Set(group.ASKED_BUILT_IN)
  const shared = discipleship.ASKED_BUILT_IN.filter((field) => groupAsks.has(field))
  const given = group.answersAsQuery(answers, via, group.FIRST_STEP)
  const carried = discipleship.readAnswers(
    Object.fromEntries(shared.map((field) => [field, given.getAll(field)])),
  )

  return discipleship.answersAsQuery(carried, via, discipleship.furthestStep(carried), {
    version: discipleshipForm.version,
    preview,
    carried: shared.filter((field) => discipleship.answered(carried, field)),
  })
}

export const GROUP_AGE_AND_GENDER_STEP = groupWizard.stepAsking('ageBand')
export const GROUP_AVAILABILITY_STEP = groupWizard.AVAILABILITY_STEP
export const GROUP_STEP = groupWizard.stepAsking('groupId')
export const GROUP_LAST_STEP = groupWizard.LAST_STEP
