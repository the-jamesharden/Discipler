import { NextResponse, type NextRequest } from 'next/server'
import { getSignUp } from '~/service/container'
import { fieldOf, formOf, refused, whileSignUpIsShut } from '../answer'
import { attemptFrom } from '../attempt-cookie'

export const dynamic = 'force-dynamic'

/**
 * **Continue** on the code page (Exponential launch, tickets 11 and 16). Takes the
 * code as the form field `code`, in the body and never the address, and the attempt
 * from its cookie.
 *
 * Answers `{ verified: true, email }`, and the page goes on to "Set up your account".
 * A wrong code is `{ refusal: 'signup.wrong_code', message, triesLeft }`. On
 * `signup.code_expired` and `signup.too_many_tries` the page offers a new code, and
 * on `signup.already_verified`, which is the second of a double click, it goes on.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const outcome = await getSignUp().confirmCode({
    attempt: attemptFrom(request),
    typed: fieldOf(await formOf(request), 'code'),
  })
  if ('verified' in outcome) return NextResponse.json({ verified: true, email: outcome.verified })
  return outcome.refusal === 'signup.wrong_code'
    ? refused(outcome.refusal, { triesLeft: outcome.triesLeft })
    : refused(outcome.refusal)
}
