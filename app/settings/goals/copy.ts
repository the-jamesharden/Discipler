import type { GoalRefusal } from '~/domain/errors'

/**
 * Everything the Discipleship Goal settings say in words, in one place. The
 * boundary deals in codes and the screen decides how to say them, for the same
 * reason the Roster's copy is its own module: rewording what an Admin reads is a
 * different reason to change than anything the domain changes for.
 */

const REFUSALS: Record<GoalRefusal, string> = {
  'goal.not_found': 'That option is no longer on this list. Somebody may have removed it.',
  'goal.needs_wording': 'An option needs something written on it.',
  'goal.already_offered': 'This ministry already offers an option worded like that.',
  'goal.last_one':
    'This is the only option left. Intake asks everyone to choose one, so add another before removing this.',
}

// `Object.hasOwn` and never `in`, which walks the prototype chain: `__proto__`,
// `toString` and `valueOf` are all `in` this object and none of them is a refusal.
// The query string is whatever somebody typed there, so `in` would hand this
// screen an object or a function to render and take the page down with it.
const isRefusal = (code: string): code is GoalRefusal => Object.hasOwn(REFUSALS, code)

/**
 * The wording for a refusal that came back on the query string, or null for one
 * this screen does not recognise.
 *
 * Never echoed. What arrives in the query string is whatever somebody typed there,
 * so an unknown code renders nothing rather than reflecting itself into the page.
 */
export const refusalMessage = (code: string | undefined): string | null =>
  code !== undefined && isRefusal(code) ? REFUSALS[code] : null

/**
 * What removing this option would cost, said as a sentence rather than as a number
 * beside a warning triangle.
 *
 * The count is people and not submissions, and the sentence says so. An Admin
 * deciding whether to tidy a list before a new semester is deciding about
 * congregants, and *7 answers* reads as rows in a table.
 */
export const removalWarning = (label: string, chosenBy: number): string =>
  chosenBy === 0
    ? `Nobody has chosen “${label}”. Removing it changes nothing about anyone’s intake.`
    : chosenBy === 1
      ? `1 person has chosen “${label}”. Removing it loses their answer for good — they keep their intake and their availability and stay pairable, but they will be ranked on availability alone until they answer again.`
      : `${chosenBy} people have chosen “${label}”. Removing it loses their answers for good — they keep their intake and their availability and stay pairable, but they will be ranked on availability alone until they answer again.`

/** How many people currently hold this option as their answer, said on the row. */
export const chosenByLabel = (chosenBy: number): string =>
  chosenBy === 1 ? 'Chosen by 1 person' : `Chosen by ${chosenBy} people`
