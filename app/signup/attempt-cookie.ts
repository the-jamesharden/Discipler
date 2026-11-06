import type { NextRequest, NextResponse } from 'next/server'
import { PENDING_SIGNUP_KEPT_HOURS, type SignUpAttemptToken } from '~/domain/sign-up-attempt'

/**
 * The cookie one sign-up attempt lives in (Exponential launch, ticket 11).
 *
 * httpOnly, so nothing on a page can read it; SameSite=Lax, so another site's form
 * cannot post with it; and scoped to `/signup`, the only place it means anything. A
 * code is bound to it, so a code typed in another browser proves nothing.
 *
 * A page under `/signup` reads it with `cookies().get(SIGN_UP_ATTEMPT_COOKIE)` and
 * hands the value to `getSignUp().standing`.
 */
export const SIGN_UP_ATTEMPT_COOKIE = 'discipler_signup_attempt'

export const attemptFrom = (request: NextRequest): string | undefined =>
  request.cookies.get(SIGN_UP_ATTEMPT_COOKIE)?.value

export const setAttemptCookie = (
  response: NextResponse,
  request: NextRequest,
  attempt: SignUpAttemptToken,
): void => {
  response.cookies.set(SIGN_UP_ATTEMPT_COOKIE, attempt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/signup',
    maxAge: PENDING_SIGNUP_KEPT_HOURS * 60 * 60,
  })
}

/**
 * The attempt is spent, so its cookie goes with it. By a date in the past, not `maxAge: 0`:
 * a route that also sets a cookie through `next/headers`, as signing in does, has Next read
 * this one back and write it again, and that drops a zero, leaving a live empty cookie.
 */
export const clearAttemptCookie = (response: NextResponse): void => {
  response.cookies.set(SIGN_UP_ATTEMPT_COOKIE, '', { path: '/signup', expires: new Date(0) })
}
