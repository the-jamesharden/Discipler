import type { NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getTestCheckIn } from '~/service/container'
import { answering, signedOut } from '../answer'

export const dynamic = 'force-dynamic'

/**
 * **Send test** and **Send another** (Exponential launch, ticket 28). The phone is the
 * session's own, read on the server. The field `agreed` says the card showed the
 * agreement above the button.
 *
 * Answers `{ sent: true, left }`, or `{ verify: true, phoneShown }` where a code has gone
 * to a phone not yet checked, or `{ refusal, message }`.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return signedOut()

  const form = await request.formData().catch(() => null)
  return answering(await getTestCheckIn().press(admin, { agreed: form?.get('agreed') === 'yes' }))
}
