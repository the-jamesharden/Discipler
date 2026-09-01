import { AGE_BANDS, GENDERS } from '~/domain/intake'
import { defineWizard, type AnswersOf } from './wizard-machine'

/**
 * The group form: the wizard behind `/intake/<ministry>` since ticket 29. It asks
 * gender and age band, then when the Person could meet, then which group they
 * would like to join, and then everything the single page always asked -- a name,
 * a number, and the two consents.
 *
 * Gender comes before the group because the list of groups is filtered on it: a
 * men's group offered to a woman is the absolute pairing constraint broken at the
 * point of asking. That is also why the first screen rewords the group answer. A
 * Person who goes back and changes their gender has a different list under the
 * group they chose, and the question is put again.
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

export const groupWizard = defineWizard(LISTS, [
  { asks: ['ageBand', 'gender'], rewords: ['groupId'] },
  { asks: ['availability'], rewords: [] },
  { asks: ['groupId'], rewords: [] },
  { asks: [], rewords: [] },
])

export const GROUP_AGE_AND_GENDER_STEP = groupWizard.stepAsking('ageBand')
export const GROUP_AVAILABILITY_STEP = groupWizard.AVAILABILITY_STEP
export const GROUP_STEP = groupWizard.stepAsking('groupId')
export const GROUP_LAST_STEP = groupWizard.LAST_STEP
