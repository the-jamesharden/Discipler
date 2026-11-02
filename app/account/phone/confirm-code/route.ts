import type { NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getPhoneCheck } from '~/service/container'
import { answered, refused, signedOut } from '../answer'

export const dynamic = 'force-dynamic'

/**
 * **Confirm**, for the test check-in's card (Exponential launch, tickets 09 and
 * 28). Checks the code the Admin typed, the form field `code`, against the one
 * texted to their own phone.
 *
 * Answers `{ verified: true, phone, phoneShown }` once Twilio approves it, after
 * which this Admin is never asked about this phone again. A wrong code is
 * `{ refusal: 'phone_check.wrong_code', message, triesLeft }`; the fifth ends the
 * attempt, and from then on, as for an expired code, the card offers a new one.
 *
 * Ticket 28's Confirm and send can call `getPhoneCheck().confirmCode` itself and
 * send the test in the same request; this route is the check alone.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return signedOut()

  const form = await request.formData().catch(() => null)
  const typed = form?.get('code')

  const outcome = await getPhoneCheck().confirmCode(admin, typeof typed === 'string' ? typed : '')
  if ('verified' in outcome) return answered('verified', outcome.verified)
  return outcome.refusal === 'phone_check.wrong_code'
    ? refused(outcome.refusal, outcome.triesLeft)
    : refused(outcome.refusal)
}
