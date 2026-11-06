import { SHORTEST_PASSWORD } from '~/domain/accounts'
import type { ChoosingRefusal } from '~/service/forgot-password'
import { PASSWORD_REFUSALS } from '../../../invitation/copy'
import { refusalIn } from '../../../refusals'

/** `f3-new-password.html`, James's words (Exponential launch, ticket 22). */
export const NEW_PASSWORD_PAGE = {
  title: 'Choose a new password',
  label: `Choose a new password (minimum ${SHORTEST_PASSWORD} characters)`,
  hint: `Use at least ${SHORTEST_PASSWORD} characters.`,
  submit: 'Save new password',
} as const

type NewPasswordProblem = Exclude<ChoosingRefusal, 'forgot.link_dead'>

const PROBLEMS: Record<NewPasswordProblem, string> = {
  ...PASSWORD_REFUSALS,
  // Drafted, for James: the link is still live, so pressing again is the right advice.
  'forgot.not_saved': "We couldn't save your new password just now. Please try again in a minute.",
}

/** The sentence for a code on the query string, or null for one this page does not know. */
export const newPasswordProblem = (code: string | undefined): string | null => refusalIn(PROBLEMS, code)
