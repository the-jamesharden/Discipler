import { SUPPORT_ADDRESS } from '~/domain/email'
import { PASSWORD_RESET_LINK_MINUTES } from '~/domain/launch-terms'
import type { ForgotPasswordRefusal } from '~/service/forgot-password'

/**
 * What "Forgot your password?" says in words (Exponential launch, ticket 22). The words
 * of the four pages are James's, from mock-up 6 (`.lavish/forgot-and-code/`). The
 * refusals are drafts inside those approved pages, for him to read at review, and are
 * listed in `docs/open-questions.md`.
 *
 * The form's client code reads this, so the password rule's words are apart, in
 * `./[token]/copy.ts`, and the list of common passwords stays on the server.
 */

export const FORGOT_LINK = 'Forgot your password?'
export const SUBTITLE = 'Reset your password'
export const BACK_TO_SIGN_IN = 'Back to sign in'

/** `f1-request.html`. */
export const REQUEST_PAGE = {
  title: 'Reset your password',
  emailLabel: 'Email',
  emailHint: "We'll email you a link to choose a new password.",
  submit: 'Send me the link',
} as const

/** `f2-sent.html`, said to everybody, including an address where nothing was sent (James, 2026-11-04). */
export const SENT_PAGE = {
  title: 'Check your email',
  sentBefore: 'Email sent. The link to choose a new password is in your inbox at ',
  sentAfter: `. It works for ${PASSWORD_RESET_LINK_MINUTES} minutes.`,
  cantFindIt: "Can't find it? Please check your spam or promotions folder. The email comes from notify.trydiscipler.com.",
} as const

/** `f4-link-dead.html`. */
export const DEAD_LINK_PAGE = {
  title: 'This link has run out',
  said: 'This link has run out or has already been used.',
  again: 'Send me a new link',
} as const

/** Drafted, for James: the mock-up draws neither. */
export const FORGOT_REFUSALS: Record<ForgotPasswordRefusal, string> = {
  'forgot.not_human': "We couldn't confirm you're a real person. Please try again.",
  'forgot.bad_email': "That doesn't look like an email address. Please check it and try again.",
}

/** Drafted, for James: the page has no JavaScript-free way past Cloudflare. */
export const NEEDS_A_SCRIPT = `This page needs JavaScript. Please turn it on, or write to ${SUPPORT_ADDRESS} and we'll help.`
