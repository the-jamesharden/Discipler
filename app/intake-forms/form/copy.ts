import type { IntakePath } from '~/domain/intake'
import type { IntakeFormRefusal, OwnKind, ProductUse, QuestionKind } from '~/domain/intake-form'
import { asList } from '~/domain/outbound-copy'
import { refusalIn } from '../../refusals'

/**
 * Everything the form editor on Intake forms says in words (Pastor feedback,
 * ticket 11; settled in James's Lavish review of 2026-10-12,
 * `.lavish/pastor-feedback/mock-forms-editor.html`). The boundary deals in codes
 * and question keys; how to say them is this screen's.
 */

/** Each form, as the editor's heading names it and as its toggle does. */
export const FORM_HEADING: Record<IntakePath, string> = {
  discipleship: 'Mentor and mentee form',
  group: 'Groups form',
}
export const FORM_TOGGLE: Record<IntakePath, string> = {
  discipleship: 'Mentor and mentee',
  group: 'Groups',
}

export const PREVIEW_FORM = 'Preview form'

/** The line under the heading: where the form is, and that a save is live. */
export const LIVE_AS_YOU_SAVE = 'Changes are live as you save them.'
export const WHERE_IT_IS = 'What somebody fills in at'

/** A page box's title: its number and its name. */
export const pageTitle = (number: number, name: string): string => `Page ${number} · ${name}`

export const INTRO = 'Intro'
export const THANK_YOU = 'Thank-you'
export const NONE_YET = 'none yet'
export const EDIT = 'Edit'
export const RENAME = 'Rename'
export const SAVE = 'Save'
export const CANCEL = 'Cancel'

/** How many questions a page holds, said in the head of a middle page. */
export const questionCount = (count: number): string =>
  count === 0 ? 'No questions yet' : count === 1 ? '1 question' : `${count} questions`

/** What an empty page says where its questions would be. */
export const EMPTY_PAGE =
  'Nothing is asked on this page yet, so the form skips it. Move a question here to ask it.'

/** What each of the intro and the thank-you is, said under its box. */
export const INTRO_HINT = 'Said on the first page, under its name. Leave it empty for none.'
export const THANK_YOU_HINT =
  'Said on the page after Submit, under what Discipler already says there. Leave it empty for none.'

export const ADD_A_PAGE = '+ Add a page'
export const PAGE_NAME = 'Page name'
export const ADD_PAGE = 'Add page'
export const NEW_PAGE_HINT =
  'Its name is the line at the top of the page. It goes just before the last page, empty: move questions onto it.'

/** The chips on a row. */
export const ALWAYS_ASKED = 'Always asked'
export const OPTIONAL = 'Optional'

export const KIND: Record<QuestionKind, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  phone: 'Phone',
  email: 'Email',
  one_choice: 'One choice',
  several_choices: 'Several choices',
  yes_no: 'Yes / no',
  hourly_grid: 'The hourly grid',
  goal_choice: 'One choice + Other',
  group_choice: 'One choice from your groups',
}

/** The kind as the open row's disabled select says it: a little longer than the chip. */
export const KIND_IN_FULL: Record<QuestionKind, string> = {
  ...KIND,
  goal_choice: 'One choice from your goals',
}

export const USED_BY: Record<ProductUse, string> = {
  pairing_rules: 'Pairing rules use this',
  age_rule: 'The age rule uses this',
  suggested_pairs: 'Suggested Pairs uses this',
}

/** The open row's fields. */
export const QUESTION = 'Question'
export const MENTOR_WORDING = 'Asked of a mentor'
export const MENTEE_WORDING = 'Asked of someone to be mentored'
export const HINT = 'Hint under it'
export const KIND_LABEL = 'Kind'
export const REQUIRED = 'Required'

export const SAVED_LIVE = 'Saved, live now'

/**
 * A question the Ministry added (Pastor feedback, ticket 12): its chip, and the
 * row at the foot of each page that adds one, a button for each kind.
 */
export const YOUR_QUESTION = 'Your question'
export const ADD_A_QUESTION = 'Add a question:'
export const ADD_KIND: Record<OwnKind, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  one_choice: 'One choice',
  several_choices: 'Several choices',
  yes_no: 'Yes / no',
}
export const addKindLabel = (kind: OwnKind, page: string): string => `Add a ${ADD_KIND[kind].toLowerCase()} question to ${page}`
/** Said in place of the two text kinds on every page but the last. */
export const TYPED_ON_THE_LAST_PAGE = 'Short and long text are asked on the last page.'
/** The new row's line, before it has any words of its own. */
export const NEW_QUESTION = 'New question'
export const CHOICES = 'Choices, one to a line'
export const MORE_CHOICES = 'More choices, one to a line'
export const choiceLabel = (number: number): string => `Choice ${number}`

/** What an open row says about a question the Ministry added. */
export const ABOUT_YOUR_QUESTION =
  'Admins see the answers on the person page and the pair card, under the person who gave them. Suggested Pairs and the pairing rules never read them.'
export const ABOUT_TYPED =
  'It is asked on the last page, beside Submit, so what is typed never goes into a web address.'
export const ABOUT_CHOICES = 'Reword a choice and everybody who picked it keeps their answer.'

/**
 * Removing a question (Pastor feedback, ticket 13; settled in James's Lavish
 * review of 2026-10-12, `.lavish/pastor-feedback/mock-forms-remove.html`): the
 * open row's last button, and what the row says in its place when it is pressed.
 */
export const REMOVE_QUESTION = 'Remove question…'
export const KEEP_IT = 'Keep it'
export const removeTitle = (wording: string): string => `Remove “${wording}”`

/**
 * What stops working without a question the product reads, said before the
 * second press, in the ticket's words. Keyed by the form as well as the
 * question, because the groups form offers groups by gender and the mentor and
 * mentee form does not.
 */
export const STOPS_WORKING: Readonly<Record<IntakePath, Partial<Record<string, string>>>> = {
  discipleship: {
    availability:
      'Suggested Pairs ranks people by the hours they share. Without this question it cannot suggest anybody: the tab will say so and you will pair everyone by hand.',
    gender:
      'The gender pairing rules read this answer. Without this question they cannot be applied to anybody who fills in this form: Suggested Pairs and the settings will say so.',
    ageBand:
      'The age rule reads this answer. Without this question it cannot be applied: Suggested Pairs will say so and suggest people of any age together.',
    goalId:
      'Suggested Pairs uses this answer as a tiebreaker. Without this question there is no goal tiebreaker: the tab will say so.',
    side:
      'Suggested Pairs uses this answer to tell who offered to disciple. Without this question it cannot tell who offered: the tab will say so, and it will suggest as Disciplers only people who already disciple somebody.',
  },
  group: {
    gender:
      'The gender pairing rules read this answer. Without this question they cannot be applied to anybody who fills in this form, so it offers only the groups open to men and women alike.',
    groupId:
      'This is what the groups form is for. Without this question nobody who fills it in chooses a group: each one waits in Follow-Up for you to place them.',
  },
}

/**
 * The questions worded from the side, as the editor names them where the side's
 * removal is held up by them.
 */
const WORDED_FROM_THE_SIDE: Partial<Record<string, string>> = {
  experience: 'the first-time question',
  oneToTwo: 'the one-to-two question',
}

/**
 * Why the side cannot go while a question worded from it is still asked: the
 * first-time question, the one-to-two question (Suggestions beyond the
 * one-to-one, ticket 01), or both, named in the order the form asks them.
 */
export const neededFirst = (keys: readonly string[]): string => {
  const names = keys.map((key) => WORDED_FROM_THE_SIDE[key] ?? 'a question')
  const [only] = names
  if (names.length === 1 && only !== undefined) {
    return `${only.charAt(0).toUpperCase()}${only.slice(1)} is worded from this answer, so it cannot be asked without it. Remove ${only} first.`
  }
  const both = asList(names)
  return `${both.charAt(0).toUpperCase()}${both.slice(1)} are worded from this answer, so neither can be asked without it. Remove them first.`
}

/**
 * How many people's answers a removal deletes, and that it cannot be undone.
 * `also` where a sentence about what stops working comes first.
 */
export const answersDeleted = (people: number, also: boolean): string =>
  people === 0
    ? 'Nobody has answered it yet, so no answers are deleted.'
    : `It ${also ? 'also ' : ''}deletes the ${people === 1 ? 'answer 1 person has' : `answers ${people} people have`} already given. This cannot be undone.`

/** The two questions whose removal deletes nothing, said in place of a count. */
export const NOTHING_KEPT: Partial<Record<string, string>> = {
  email: 'The emails people gave are kept with their names and numbers, so no answers are deleted.',
  groupId: 'Everybody stays in the group they joined, and every request waiting stays, so no answers are deleted.',
}

/** The second press. */
export const removeIt = (people: number): string =>
  people === 0 ? 'Remove it' : people === 1 ? 'Remove it and its answer' : `Remove it and its ${people} answers`

/** Said where the question was, once it has gone. */
export const REMOVED_LIVE = 'Removed, live now'

/**
 * *Add a question* offers back each of Discipler's own questions the form no
 * longer asks, by the words it is asked in.
 */
export const ADD_BACK = 'Add back:'
export const addBackLabel = (wording: string, page: string): string => `Add “${wording}” back to ${page}`

/** The buttons for an editor whose script has not run. */
export const moveUp = (wording: string): string => `Move “${wording}” up`
export const moveDown = (wording: string): string => `Move “${wording}” down`
export const dragLabel = (wording: string): string =>
  `Drag “${wording}” to change its place. Arrow keys move it; Enter saves the order.`

/**
 * What an open row says about a question Discipler fixes something about, keyed
 * by the question. Only the questions with something to say have a line.
 */
export const ABOUT: Partial<Record<string, string>> = {
  fullName:
    'Everybody is asked this: a name and a mobile number are who somebody is to Discipler. It is asked on the last page, beside Submit, so what is typed never goes into a web address.',
  phone:
    'Everybody is asked this: Discipler texts this number, and a name and a number are who somebody is. It is asked on the last page, beside Submit, so what is typed never goes into a web address.',
  email:
    'It is asked on the last page, beside Submit, so what is typed never goes into a web address.',
  gender:
    'The gender pairing rules read this answer, so everybody is asked it. Female and Male are fixed.',
  ageBand: 'The age rule reads this answer, so everybody is asked it. The age ranges are fixed.',
  side:
    'Suggested Pairs uses this to tell who offered to disciple and who wants to be discipled, so everybody is asked it. Its two answers are fixed, and the first-time and one-to-two questions are worded from it, so they come on a later page.',
  experience:
    'It is put in the words of the side somebody chose, so it is worded twice and comes on a page after “I’m joining as…”. Its two answers are fixed.',
  oneToTwo:
    'It is put in the words of the side somebody chose, so it is worded twice and comes on a page after “I’m joining as…”. Its two answers are fixed. You see the answer beside each name when you pair people, on the Pair popup and Suggested Pairs; it filters and ranks nobody.',
  availability:
    'Suggested Pairs ranks people by the hours they share, so everybody is asked it. The grid is fixed: an hour at a time, 8am to 8pm, every day.',
  goalId:
    'Suggested Pairs uses this answer as a tiebreaker, and “Other” always comes last with a box to type in. The choices themselves are your goals, edited under “The goals question” below. It is asked on the last page, so what is typed under Other never goes into a web address.',
  groupId:
    'This is what the groups form is for, so everybody is asked it. The choices are your groups, named under “Groups” below, and “I don’t have a group in mind” always comes last. The groups offered are the ones open to the gender given, so it comes on a page after Gender.',
}

const REFUSALS: Record<IntakeFormRefusal, string> = {
  'intake_form.not_found':
    'That question or page is no longer on this form. Somebody may have changed it. This is how it stands now.',
  'intake_form.question_needs_wording': 'A question needs something written on it.',
  'intake_form.page_needs_a_name': 'A page needs a name: it is the line at the top of the page.',
  'intake_form.always_required':
    'Everybody is asked that question: the product needs every answer to it.',
  'intake_form.changed':
    'The form changed while you were rearranging it. This is how it stands now.',
  'intake_form.stays_on_the_last_page':
    'Name, mobile number, email, the goals question and every short or long text question stay on the last page, beside Submit, so what is typed into them never goes into a web address.',
  'intake_form.kind_unknown': 'A question can be short text, long text, one choice, several choices or yes / no.',
  'intake_form.needs_two_choices': 'A choice question needs at least two choices.',
  'intake_form.choices_repeat': 'Two of the choices say the same thing.',
  'intake_form.choice_kept':
    'A choice cannot be emptied: the answers that picked it would go with it. Reword it instead.',
  'intake_form.asked_too_soon':
    'That would ask a question before the answer it is worded from: the first-time and one-to-two questions come after “I’m joining as…”, and the choice of group after Gender.',
  'intake_form.always_asked':
    'Name and mobile number are asked of everybody: they are who somebody is to Discipler, so they cannot be removed.',
  'intake_form.worded_from_it':
    'The first-time and one-to-two questions are worded from “I’m joining as…”, so neither can be asked on a form that does not ask it.',
}

/** The sentence for a refusal that came back on the query string, or null. */
export const formRefusalMessage = (code: string | undefined): string | null =>
  refusalIn(REFUSALS, code)
