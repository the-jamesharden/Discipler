import type { NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getTestCheckIn } from '~/service/container'
import { answering, signedOut } from '../answer'

export const dynamic = 'force-dynamic'

/**
 * **Confirm and send** (Exponential launch, ticket 28): the form field `code`, and the
 * test in the same request if it is right. Answers `{ sent: true, left }` or
 * `{ refusal, message, triesLeft? }`.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return signedOut()

  const form = await request.formData().catch(() => null)
  const typed = form?.get('code')
  return answering(await getTestCheckIn().confirm(admin, typeof typed === 'string' ? typed : ''))
}
