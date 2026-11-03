import { NextResponse, type NextRequest } from 'next/server'
import { getSignUp } from '~/service/container'
import { fieldOf, formOf, refused, whileSignUpIsShut } from '../answer'
import { setAttemptCookie } from '../attempt-cookie'

export const dynamic = 'force-dynamic'

/**
 * Page one's automatic human check (Exponential launch, tickets 11 and 15). Takes the
 * Turnstile token as the form field `token`, from a widget with the action
 * `HUMAN_CHECK_ACTIONS.startSignUp`, and asks Cloudflare about it before anything
 * costs money.
 *
 * Answers `{ passed: true }` with the attempt's cookie set, and the page goes on to
 * ask for an email and a phone. A refusal is `{ refusal, message }`.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const outcome = await getSignUp().passHumanCheck(fieldOf(await formOf(request), 'token'))
  if ('refusal' in outcome) return refused(outcome.refusal)

  const response = NextResponse.json({ passed: true })
  setAttemptCookie(response, request, outcome.attempt)
  return response
}
