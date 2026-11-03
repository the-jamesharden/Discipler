import type { NextRequest } from 'next/server'
import { getSignUp } from '~/service/container'
import { networkOf } from '../../auth/network'
import { answerSending, fieldOf, formOf, whileSignUpIsShut } from '../answer'
import { attemptFrom } from '../attempt-cookie'

export const dynamic = 'force-dynamic'

/**
 * **Email me a code** (Exponential launch, tickets 11 and 15). Takes the form fields
 * `email` and `phone`, and the attempt from its cookie.
 *
 * Answers `{ sent: true, email, resendInSeconds }` whether or not the address has an
 * account: its owner is sent a notice instead, and nothing here can tell them apart.
 * A refusal is `{ refusal, message }`, with `resendInSeconds` when it is too soon. On
 * `signup.human_check_needed` the page goes back to page one, which is also what a
 * different address asks for.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const form = await formOf(request)
  return answerSending(
    await getSignUp().sendCode({
      attempt: attemptFrom(request),
      email: fieldOf(form, 'email'),
      phone: fieldOf(form, 'phone'),
      network: networkOf(request.headers),
    }),
  )
}
