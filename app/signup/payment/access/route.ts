import { NextResponse } from 'next/server'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { whileSignUpIsShut } from '../../answer'

export const dynamic = 'force-dynamic'

/**
 * The small read the payment step's waiting state asks (Exponential launch, ticket 18):
 * whether the church has access, as the webhook writes it. Asks nobody but the church's
 * own record, and answers nothing else. Takes nothing from the browser.
 */
export async function GET() {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const resolution = await resolveAdmin()
  const hasAccess = resolution.status === 'admin' && resolution.admin.billing.hasAccess
  return NextResponse.json({ hasAccess }, { headers: { 'cache-control': 'no-store' } })
}
