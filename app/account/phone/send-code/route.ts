import { currentAdmin } from '~/platform/supabase/current-admin'
import { getPhoneCheck } from '~/service/container'
import { answered, refused, signedOut } from '../answer'

export const dynamic = 'force-dynamic'

/**
 * **Text me a code**, for the test check-in's card (Exponential launch, tickets 09
 * and 28). Texts a 6-digit code to the phone on the signed-in Admin's own Roster
 * row, or resends one while the attempt is open.
 *
 * Takes nothing from the request. The phone is the session's own, read on the
 * server; a route that took a number would text codes to anybody's.
 *
 * Answers `{ sent: true, phone, phoneShown }`, or `{ verified: true, phone,
 * phoneShown }` for a phone this Admin has already verified, in which case nothing
 * was sent and the card goes straight on. A refusal is `{ refusal, message }`.
 */
export async function POST() {
  const admin = await currentAdmin()
  if (!admin) return signedOut()

  const outcome = await getPhoneCheck().sendCode(admin)
  if ('refusal' in outcome) return refused(outcome.refusal)
  return 'sent' in outcome ? answered('sent', outcome.sent) : answered('verified', outcome.verified)
}
