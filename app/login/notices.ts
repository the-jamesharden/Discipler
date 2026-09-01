import { refusalIn } from '../refusals'

/**
 * Why somebody is looking at the sign-in page when nothing went wrong. Beside the
 * failure codes and travelling the same way: the page owns the wording, and
 * nothing typed into the query string is rendered.
 *
 * One code so far. A person bounced to a sign-in page with no explanation reads it
 * as failure and tries the old password, so the surface that just ended their
 * session says why here.
 */
export type SignInNotice = 'password-changed'

const NOTICES: Record<SignInNotice, string> = {
  'password-changed': 'Your password has changed. Sign in with the new one.',
}

/** The sentence for a notice on the query string, or null for one this page does not know. */
export const signInNoticeMessage = (code: string | undefined): string | null =>
  refusalIn(NOTICES, code)
