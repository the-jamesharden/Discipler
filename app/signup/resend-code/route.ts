import type { NextRequest } from 'next/server'
import { getSignUp } from '~/service/container'
import { networkOf } from '../../auth/network'
import { answerSending, whileSignUpIsShut } from '../answer'
import { attemptFrom } from '../attempt-cookie'

export const dynamic = 'force-dynamic'

/**
 * **Send a new code** (Exponential launch, tickets 11 and 16). Takes nothing but the
 * attempt's cookie, because a new code can only go to the address already on the
 * attempt, and it answers as `send-code` does. The old code stops working.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  return answerSending(
    await getSignUp().resendCode({ attempt: attemptFrom(request), network: networkOf(request.headers) }),
  )
}
