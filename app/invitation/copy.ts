import {
  LONGEST_PASSWORD_BYTES,
  SHORTEST_PASSWORD,
  type AccountCreationRefusal,
  type NewPasswordRefusal,
} from '~/domain/accounts'
import { CHURCH_HAS_NO_ACCESS_TO_TEXTING } from '../texting-gate-copy'
import type { InvitationRefusal } from '~/domain/errors'
import { asList } from '~/domain/outbound-copy'

/**
 * The page renders its own wording from codes, like every other surface. Nothing
 * a caller supplied is reflected back into it, and nothing here names a Ministry
 * or a person to somebody whose token did not resolve.
 */

/**
 * Only the refusals minting an account can produce. A reset is refused in codes of
 * its own and reaches an Admin on the Roster, never a Leader holding a link.
 */
type Problem = InvitationRefusal | AccountCreationRefusal

/**
 * The sentences for the one password rule, `newPasswordRefusal`. Exported because
 * the Ministry Setup Link and the change-your-password surface apply the same rule,
 * and two wordings of it would eventually disagree about the numbers -- which are
 * read from the constants for the same reason.
 *
 * The ceiling is counted in bytes and said in characters. They are the same number
 * for anything typed on an English keyboard, and nobody reaches it by typing.
 */
export const PASSWORD_REFUSALS: Record<NewPasswordRefusal, string> = {
  'account.password_too_short': `Choose a password of at least ${SHORTEST_PASSWORD} characters.`,
  'account.password_too_long': `Choose a password of no more than ${LONGEST_PASSWORD_BYTES} characters.`,
  'account.password_too_common':
    'That password is one of the most common, so it is easy to guess. Choose another.',
}

const PROBLEMS: Record<Problem, string> = {
  'invitation.not_found':
    'This link isn’t one we recognise. Check you copied the whole of it, or ask whoever invited you to send it again.',
  'invitation.expired':
    'This link has expired. Ask whoever invited you to send you a new one - nothing is lost.',
  'invitation.already_used':
    'You’ve already set up your account with this link. Sign in with your phone number and password.',
  'invitation.not_a_leader': 'This link isn’t yours to accept.',
  // An Admin's act from a page. The person page says it; nobody holding the link can
  // meet it, and this entry is here because this table is every refusal's.
  'invitation.church_has_no_access': CHURCH_HAS_NO_ACCESS_TO_TEXTING,
  'invitation.declined':
    'You declined this invitation, so this link doesn’t open it any more. If you’ve changed your mind, let whoever invited you know.',
  ...PASSWORD_REFUSALS,
  'account.no_number_on_file':
    'We don’t have a phone number for you, so there’s nothing to sign you in with. Let whoever invited you know.',
  'account.already_exists':
    'There’s already an account for this number. Sign in with your phone number and password.',
}

/**
 * `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `__proto__`,
 * `toString` and `constructor` all pass it and hand back something that is not a
 * string -- which React then refuses to render, turning a query string anybody
 * can type into a 500 on a page a signed-out Leader reaches with a real link.
 */
export const invitationProblemMessage = (code?: string): string | null => {
  if (!code) return null
  return Object.hasOwn(PROBLEMS, code)
    ? PROBLEMS[code as Problem]
    : PROBLEMS['invitation.not_found']
}

/**
 * The reveal: who they have been paired with. One name and four are the same
 * sentence with a different list in it -- copy branches on the count and never on
 * the kind the relationship was formed as, and the list is the one every message
 * is written with.
 *
 * *Paired*, which is the product's word for it and the Admin's (James,
 * 2026-09-21); it said *matched*.
 */
export const revealHeading = (names: readonly string[]): string =>
  `You’ve been paired with ${names.length === 0 ? 'someone' : asList(names)}`

/**
 * Who they would be leading with, under the reveal (Manual pairing, recut ticket
 * 01). An Admin may add a Leader to a group that already has one, so the holder
 * of a link decides whether to lead knowing who they would be joining.
 * Null for somebody leading alone, which is nearly everybody: no sentence, rather
 * than one about nobody.
 */
export const leadingWithSentence = (names: readonly string[]): string | null =>
  names.length === 0 ? null : `You will be leading with ${asList(names)}.`

/**
 * Declining (Manual pairing, recut ticket 06; decided by James on 2026-09-21).
 * The confirmation is one question in his words and two buttons, and explains
 * nothing else.
 */
export const ACCEPT = 'Accept and start'
export const DECLINE = 'Decline'
export const DECLINE_QUESTION = 'Are you sure you want to decline this invitation?'
export const YES_DECLINE = 'Yes, decline'
export const GO_BACK = 'Go back'

export const DECLINED_HEADING = 'Thanks for letting us know'

/**
 * What a declined link says, straight after declining and every time it is
 * opened again. It branches on how many they were paired with and never on the
 * kind the relationship was formed as, like the reveal. No name is in it: they
 * are no longer somebody the relationship is shown to.
 */
export const declinedMessage = (ministryName: string, pairedWithCount: number): string =>
  `We’ve told ${ministryName} you won’t be ${
    pairedWithCount === 1 ? 'taking this on' : 'leading this group'
  }. Nothing else is needed from you, and nobody else has been contacted.`
