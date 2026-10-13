import { choiceWordsOf, type OwnAnswerShown } from '~/domain/own-answers'
import { YES_NO_LABEL } from './intake/copy'

/**
 * Somebody's answers to the Ministry's own Intake questions (Pastor feedback,
 * ticket 12), as term and description pairs to sit in the list of what they said
 * at Intake: each question as the form words it now, and what they answered. The
 * person page draws them, and the pair card and the group card under the person
 * they belong to. Never the Roster row.
 *
 * Several choices are said in the form's order; a long answer keeps its lines.
 */
export const OwnAnswers = ({ answers }: { readonly answers: readonly OwnAnswerShown[] }) =>
  answers.map(({ question, value }) => (
    <OwnAnswer key={question.key} wording={question.wording} said={saidOf({ question, value })} />
  ))

/**
 * The question across the whole list and the answer under it, rather than the
 * question in the narrow column the list's own terms sit in: a Ministry's
 * question is a sentence, and *Age* and *Hoping for* are a word or two.
 */
const OwnAnswer = ({ wording, said }: { readonly wording: string; readonly said: string }) => (
  <>
    <dt className="own-question">{wording}</dt>
    <dd className="own-answer">{said}</dd>
  </>
)

/** What an answer says, in words. */
export const saidOf = ({ question, value }: OwnAnswerShown): string =>
  typeof value === 'boolean'
    ? YES_NO_LABEL[value ? 'yes' : 'no']
    : question.kind === 'short_text' || question.kind === 'long_text'
      ? String(value)
      : choiceWordsOf(question, value).join(', ')
