/**
 * Sign-in failures travel from the route handler to the sign-in page as codes, not
 * as prose. The wording lives here, next to the page that renders it, so nothing a
 * stranger puts in `?error=` can appear inside the app's own error styling -- and
 * so the copy is changed in one place rather than at each redirect.
 */
import { SIGN_IN_WINDOW_MINUTES } from '~/domain/sign-in-limit'
import { isRefusalIn } from '../refusals'

export type SignInFailure =
  | 'missing-credentials'
  | 'unreadable-phone'
  | 'no-such-account'
  | 'too-many-attempts'

/**
 * The sign-in guessing limit's one sentence, shared with the change-your-password
 * form, which is held to the same limit (Exponential launch, ticket 13).
 *
 * The same whether or not the account exists, because the limit is reached the
 * same way for both. It names the longest wait there can be: the window rolls, so
 * a try opens up as soon as the oldest of the ten failures is fifteen minutes old.
 */
export const TOO_MANY_ATTEMPTS = `Too many tries. Wait ${SIGN_IN_WINDOW_MINUTES} minutes, then try again.`

const messages: Record<SignInFailure, string> = {
  'missing-credentials': 'Enter your email or phone and your password.',
  /**
   * Separate from the one below, and the difference is worth the extra code. An
   * entry with no `@` that Discipler could not read as a number is a typo the person
   * can fix, and says nothing about any account; folding it into "that did not match"
   * would have them retyping a correct password against a number that was never going
   * to be looked up.
   */
  'unreadable-phone': 'That does not look like an email or a phone number. Include the area code.',
  // Deliberately vague, and one sentence for an unknown email, an unknown phone and
  // a wrong password: a precise message would tell an outsider which of them belong
  // to a Ministry.
  'no-such-account': 'That email or phone and password did not match.',
  'too-many-attempts': TOO_MANY_ATTEMPTS,
}

/**
 * Unrecognised codes fall back rather than render, so an invented one says nothing.
 *
 * Through `isRefusalIn` rather than a bare index, because what arrives here is
 * whatever somebody typed into the query string: `__proto__` and `constructor` are
 * both indexable on a plain object, and neither is a sentence a page can render.
 */
export const signInFailureMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return isRefusalIn(messages, code)
    ? messages[code]
    : 'Something went wrong. Try signing in again.'
}
