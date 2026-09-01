import type { PasswordChangeRefusal } from '~/domain/accounts'
import { PASSWORD_TOO_SHORT } from '../invitation/copy'
import { refusalsIn } from '../refusals'

/**
 * Everything the change-your-password surface says in words. The boundary refuses
 * in codes and this screen owns the sentences, the way `app/login/failures.ts` and
 * `app/roster/reset/copy.ts` already do it.
 *
 * A `Record`, so a code added to `PasswordChangeRefusal` and left unworded fails
 * the build rather than falling through to a sentence that names nothing.
 */
const REFUSALS: Record<PasswordChangeRefusal, string> = {
  // The invitation form's sentence, unchanged: it is the same rule at the same
  // length, and two wordings of one rule would eventually disagree about the number.
  'account.password_too_short': PASSWORD_TOO_SHORT,
  'account.passwords_differ': 'The two new passwords do not match.',
  'account.current_password_wrong': 'That is not your current password.',
}

/**
 * The sentences for whatever came back on the query string, in the order they
 * arrived -- which is field order, so a person reads their mistakes top to bottom.
 * A wrong current password always arrives alone: the form's own rules are checked
 * first and together, and the platform is asked only once they pass.
 */
export const passwordChangeRefusalMessages = (codes: string | undefined): readonly string[] =>
  refusalsIn(REFUSALS, codes)

/**
 * The heading, and the words on every link to the page. The route kept the name
 * it was given during ticket 28's grilling; every word a person reads says what the
 * page does.
 */
export const CHANGE_YOUR_PASSWORD = 'Change your password'

/**
 * What pressing the button does, said before the button and not after it. Success
 * ends every session on the account, this one included, and a person who was not
 * told lands on a sign-in page and reads it as failure --
 * `docs/adr/0016-a-password-change-ends-every-session.md` names this as the
 * consequence the surface has to say up front.
 */
export const SIGNS_YOU_OUT_EVERYWHERE =
  'Changing your password signs you out everywhere, including here. You will sign in '
  + 'again with the new one.'

export const CHANGE_ACTION = 'Change the password'
