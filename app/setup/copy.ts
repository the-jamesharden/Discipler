import type { AccountCreationRefusal } from '~/domain/accounts'
import type { MinistrySetupRefusal } from '~/domain/errors'
import { PASSWORD_TOO_SHORT } from '../invitation/copy'
import { refusalIn } from '../refusals'

/**
 * The Ministry Setup Link's page renders its own wording from codes, like every
 * other surface. Nothing a caller supplied is reflected back, and nothing here
 * names a church to somebody whose token did not resolve.
 *
 * "Whoever set this up for you" is the operator: there is no Admin yet to name,
 * because making one is what the page is for.
 */
type Problem = MinistrySetupRefusal | AccountCreationRefusal

const PROBLEMS: Record<Problem, string> = {
  'setup.not_found':
    'This link isn’t one we recognise. Check you copied the whole of it, or ask whoever set this up for you to send it again.',
  'setup.expired':
    'This link has expired. Ask whoever set this up for you to send a new one. Nothing is lost.',
  'setup.already_used':
    'Your ministry is already set up with this link. Sign in with your phone number and password.',
  'account.password_too_short': PASSWORD_TOO_SHORT,
  'account.no_number_on_file':
    'This link carries no phone number, so there’s nothing to sign you in with. Ask whoever set this up for you to send a new one.',
  'account.already_exists':
    'There’s already an account for this number, so a new ministry can’t be opened on it. Ask whoever set this up for you.',
}

/**
 * A code this page does not recognise reads as a link it does not recognise,
 * which is the one sentence that is true of every unknown thing on the query
 * string and reflects none of it.
 */
export const setupProblemMessage = (code?: string): string | null =>
  code ? (refusalIn(PROBLEMS, code) ?? PROBLEMS['setup.not_found']) : null
