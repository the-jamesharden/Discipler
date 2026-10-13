import type { IntakeForm, OwnQuestion, OwnQuestionKey } from './intake-form'
import { readWording } from './wording'

/**
 * The answers to a Ministry's own Intake questions (Pastor feedback, ticket 12):
 * short text, long text, one choice, several choices and yes or no.
 *
 * They are shown to an Admin, on the person page and on the pair card, and they
 * are never matched on. Nothing that ranks, pairs or filters people reads them:
 * Suggested Pairs, the pairing rules and the age rule run on Discipler's own
 * questions, whose meaning the product knows, and a Ministry's own question means
 * whatever the Ministry meant by it. That is a rule about what future code may do,
 * so a test fences this module off from the pairing code
 * (`tests/domain/own-answers-are-never-matched-on.test.ts`).
 *
 * Only types come in from `intake-form.ts`, because `intake.ts` reads a
 * submission's answers through here and `intake-form.ts` already reads
 * `intake.ts`.
 */

/**
 * One answer as it is stored: the words typed, the id of the one choice, the ids
 * of the several, or yes as true and no as false. Never the wording of a choice:
 * an answer points at the choice, so a reworded choice keeps its answers
 * (ADR-0014).
 */
export type OwnAnswerValue = string | readonly string[] | boolean

export interface OwnAnswer {
  readonly key: OwnQuestionKey
  readonly value: OwnAnswerValue
}

/**
 * The answers as a form sends them: every value under each `custom:` field, as
 * strings. A choice is its id, yes and no are `yes` and `no`, and typed words are
 * what was typed.
 */
export type OwnAnswersAsSent = Readonly<Record<string, readonly string[]>>

/** The two values a yes-or-no question sends. */
export const YES = 'yes'
export const NO = 'no'

/**
 * How much somebody may type. A short text is a line, and a long text a few
 * paragraphs; the boxes stop there, and a body that goes past them was not typed
 * into the form Discipler served.
 */
export const SHORT_TEXT_LIMIT = 200
export const LONG_TEXT_LIMIT = 4000

export type OwnAnswerRefusal =
  /** A question the form asks and does not let be left, left. */
  | 'intake.question_unanswered'
  /**
   * An answer the form could not have sent: a choice it did not offer, two where
   * it takes one, or an answer to a question it does not ask.
   */
  | 'intake.answer_unreadable'
  | 'intake.answer_too_long'

export type OwnReading =
  | { readonly answers: readonly OwnAnswer[] }
  | { readonly refusals: readonly OwnAnswerRefusal[] }

/**
 * What somebody typed into a long box: line breaks kept, since a paragraph is
 * what the box is for, and the space around the whole trimmed. Null for nothing.
 */
const readParagraphs = (raw: string | undefined): string | null => {
  const text = (raw ?? '').replace(/\r\n?/g, '\n').trim()
  return text === '' ? null : text
}

/**
 * One answer, or why it cannot be one; null where it was left. Tagged rather than
 * a bare string either way, because what somebody types can be any string at all,
 * a refusal code included.
 */
type ReadOne = { readonly value: OwnAnswerValue } | { readonly refusal: OwnAnswerRefusal } | null

const unreadable: ReadOne = { refusal: 'intake.answer_unreadable' }

const readOne = (question: OwnQuestion, sent: readonly string[]): ReadOne => {
  switch (question.kind) {
    case 'short_text':
    case 'long_text': {
      if (sent.length > 1) return unreadable
      const text = question.kind === 'short_text' ? readWording(sent[0]) : readParagraphs(sent[0])
      if (text === null) return null
      const limit = question.kind === 'short_text' ? SHORT_TEXT_LIMIT : LONG_TEXT_LIMIT
      return text.length > limit ? { refusal: 'intake.answer_too_long' } : { value: text }
    }
    case 'one_choice': {
      if (sent.length === 0 || (sent.length === 1 && sent[0] === '')) return null
      if (sent.length > 1) return unreadable
      const id = sent[0]!
      return question.choices.some((choice) => choice.id === id) ? { value: id } : unreadable
    }
    case 'several_choices': {
      const picked = new Set(sent.filter((value) => value !== ''))
      if (picked.size === 0) return null
      if ([...picked].some((value) => !question.choices.some((choice) => choice.id === value))) {
        return unreadable
      }
      // In the order the form offers them, whatever order they arrived in.
      return { value: question.choices.filter((choice) => picked.has(choice.id)).map((choice) => choice.id) }
    }
    case 'yes_no': {
      if (sent.length === 0 || (sent.length === 1 && sent[0] === '')) return null
      if (sent.length > 1) return unreadable
      return sent[0] === YES ? { value: true } : sent[0] === NO ? { value: false } : unreadable
    }
  }
}

/**
 * Every answer to the Ministry's own questions on the version of the form somebody
 * answered, read as `readIntakeForm` reads the rest: every problem at once, and an
 * answer to a question the form does not ask refused rather than dropped.
 */
export const readOwnAnswers = (
  questions: readonly OwnQuestion[],
  sent: OwnAnswersAsSent,
): OwnReading => {
  const refusals = new Set<OwnAnswerRefusal>()
  const answers: OwnAnswer[] = []

  for (const key of Object.keys(sent)) {
    if (!questions.some((question) => question.key === key)) refusals.add('intake.answer_unreadable')
  }

  for (const question of questions) {
    const read = readOne(question, sent[question.key] ?? [])
    if (read === null) {
      if (question.required) refusals.add('intake.question_unanswered')
    } else if ('refusal' in read) {
      refusals.add(read.refusal)
    } else {
      answers.push({ key: question.key, value: read.value })
    }
  }

  return refusals.size > 0 ? { refusals: [...refusals] } : { answers }
}

/** A stored answer, as the database hands it back: whatever is in the row. */
export interface StoredOwnAnswer {
  readonly key: string
  readonly value: unknown
}

/** One answer as an Admin is shown it: under the question as the Ministry words it now. */
export interface OwnAnswerShown {
  readonly question: OwnQuestion
  readonly value: OwnAnswerValue
}

/** Whether a stored value is the shape its question's kind stores. */
const fits = (question: OwnQuestion, value: unknown): value is OwnAnswerValue => {
  switch (question.kind) {
    case 'short_text':
    case 'long_text':
      return typeof value === 'string' && value !== ''
    case 'one_choice':
      return typeof value === 'string' && question.choices.some((choice) => choice.id === value)
    case 'several_choices':
      return (
        Array.isArray(value)
        && value.length > 0
        && value.every((id) => question.choices.some((choice) => choice.id === id))
      )
    case 'yes_no':
      return typeof value === 'boolean'
  }
}

/**
 * Somebody's answers to the Ministry's own questions, each under the question as
 * the Ministry's form words it now, in the order the form asks them. Looked up by
 * key in the Ministry's forms as they stand, so a reworded question or choice
 * shows its new words over the answers given to its old ones (ADR-0014). An
 * answer whose question the forms no longer ask, or whose value its question
 * cannot hold, is left out rather than guessed at.
 */
export const ownAnswersShown = (
  forms: readonly IntakeForm[],
  stored: readonly StoredOwnAnswer[],
): readonly OwnAnswerShown[] => {
  const asked = forms.flatMap((form) =>
    form.pages.flatMap((page) =>
      page.questions.filter((question): question is OwnQuestion => question.key.startsWith('custom:')),
    ),
  )
  return asked.flatMap((question) => {
    const answer = stored.find((each) => each.key === question.key)
    return answer && fits(question, answer.value) ? [{ question, value: answer.value }] : []
  })
}

/**
 * What an answer says, as the words of its choices: the one, the several in the
 * form's order, or the typed words. Yes and no are the screen's to word, so this
 * hands back the boolean.
 */
export const choiceWordsOf = (question: OwnQuestion, value: OwnAnswerValue): readonly string[] => {
  const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  return question.choices.filter((choice) => ids.includes(choice.id)).map((choice) => choice.wording)
}

/**
 * A stored answer as the form sends it, to be offered back on the reopened page:
 * the words typed, the ids picked, or `yes` or `no`. Nothing for a value that is
 * not one an answer can be.
 */
export const asSent = (value: unknown): readonly string[] =>
  typeof value === 'string'
    ? [value]
    : typeof value === 'boolean'
      ? [value ? YES : NO]
      : Array.isArray(value)
        ? value.filter((each): each is string => typeof each === 'string')
        : []
