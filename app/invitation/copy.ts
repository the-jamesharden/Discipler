import type { AccountRefusal } from '~/domain/accounts'
import type { InvitationRefusal } from '~/domain/errors'

/**
 * The page renders its own wording from codes, like every other surface. Nothing
 * a caller supplied is reflected back into it, and nothing here names a Ministry
 * or a person to somebody whose token did not resolve.
 */

type Problem = InvitationRefusal | AccountRefusal

const PROBLEMS: Record<Problem, string> = {
  'invitation.not_found':
    'This link isn’t one we recognise. Check you copied the whole of it, or ask whoever invited you to send it again.',
  'invitation.expired':
    'This link has expired. Ask whoever invited you to send you a new one — nothing is lost.',
  'invitation.already_used':
    'You’ve already set up your account with this link. Sign in with your phone number and password.',
  'invitation.not_a_leader': 'This link isn’t yours to accept.',
  'account.password_too_short': 'Choose a password of at least 8 characters.',
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
 * Who they are meeting with. One name and four are the same sentence with a
 * different list in it -- copy branches on the count and never on the kind the
 * relationship was formed as.
 */
export const asList = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? 'someone')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
