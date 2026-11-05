import { AI_GUIDE_CHAT_KEPT_DAYS, AI_GUIDE_QUESTIONS_PER_DAY } from './launch-terms'

/**
 * Ask Discipler's rules, apart from any vendor or page (Exponential launch, ticket 31,
 * and `docs/adr/0032-the-ai-guide-answers-from-the-help-docs-only.md`). The day's limit
 * and how long a chat is kept are the launch's numbers, in `./launch-terms`.
 */

/** What the box lets anybody type, and the table's own limit too. */
export const LONGEST_QUESTION = 1000

/**
 * The last exchanges of this sign-in's chat sent along with a new question, so a
 * follow-up makes sense. A sign-in can last a year, and without a limit each question
 * would cost more than the one before.
 */
export const EXCHANGES_REMEMBERED = 10

/** "{n} questions left today" shows from this many left down. */
export const FEW_QUESTIONS_LEFT = 5

/** What the Admin typed, trimmed, or null where there is nothing that could be asked. */
export const readQuestion = (typed: string): string | null => {
  const question = typed.trim()
  return question === '' || question.length > LONGEST_QUESTION ? null : question
}

export const questionsLeftAfter = (askedToday: number): number =>
  Math.max(0, AI_GUIDE_QUESTIONS_PER_DAY - askedToday)

/** The instant before which a chat has been kept long enough. */
export const chatsKeptSince = (now: Date): Date =>
  new Date(now.getTime() - AI_GUIDE_CHAT_KEPT_DAYS * 24 * 60 * 60 * 1000)

/** The month a spend stop is recorded under: UTC, the boundary the gateway's budgets reset on. */
export const spendMonthOf = (at: Date): string => at.toISOString().slice(0, 7)

/** One answered question of a chat, as the model is shown it. */
export interface GuideExchange {
  readonly question: string
  readonly answer: string
}

/**
 * The line every answer is told to end with, and what it names. The page the answer
 * came from is drawn by the product and not by the model, so it is always a real page
 * and always in the same place.
 */
const SOURCE_LINE = /(?:^|\n)[ \t]*[*_`]*Source:[*_`\s]*(\/help(?:\/[a-z0-9-]+)?)[#a-z0-9-]*[*_`\s.]*$/i

/** An answer's words with its last line taken off, and the address that line named. */
export const splitAnswerSource = (answer: string): { readonly words: string; readonly source: string | null } => {
  const trimmed = answer.trimEnd()
  const found = SOURCE_LINE.exec(trimmed)
  return found
    ? { words: trimmed.slice(0, found.index).trimEnd(), source: found[1]!.toLowerCase() }
    : { words: trimmed, source: null }
}
