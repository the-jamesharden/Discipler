/**
 * Sign-in failures travel from the route handler to the sign-in page as codes, not
 * as prose. The wording lives here, next to the page that renders it, so nothing a
 * stranger puts in `?error=` can appear inside the app's own error styling -- and
 * so the copy is changed in one place rather than at each redirect.
 */
import { isRefusalIn } from '../refusals'

export type SignInFailure = 'missing-credentials' | 'unreadable-phone' | 'no-such-account'

const messages: Record<SignInFailure, string> = {
  'missing-credentials': 'Enter your phone number and password.',
  /**
   * Separate from the one below, and the difference is worth the extra code. A
   * number Discipler could not read is a typo the person can fix; folding it into
   * "that did not match" would have them retyping a correct password against a
   * number that was never going to be looked up.
   */
  'unreadable-phone': 'That does not look like a phone number. Include the area code.',
  // Deliberately vague: a precise message would tell an outsider which phone
  // numbers belong to a Ministry.
  'no-such-account': 'That phone number and password did not match.',
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
