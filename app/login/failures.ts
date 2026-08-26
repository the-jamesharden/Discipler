/**
 * Sign-in failures travel from the route handler to the sign-in page as codes, not
 * as prose. The wording lives here, next to the page that renders it, so nothing a
 * stranger puts in `?error=` can appear inside the app's own error styling -- and
 * so the copy is changed in one place rather than at each redirect.
 */
export type SignInFailure = 'missing-credentials' | 'no-such-account'

const messages: Record<SignInFailure, string> = {
  'missing-credentials': 'Enter your email and password.',
  // Deliberately vague: a precise message would tell an outsider which email
  // addresses belong to a Ministry.
  'no-such-account': 'That email and password did not match.',
}

/** Unrecognised codes fall back rather than render, so an invented one says nothing. */
export const signInFailureMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return messages[code as SignInFailure] ?? 'Something went wrong. Try signing in again.'
}
