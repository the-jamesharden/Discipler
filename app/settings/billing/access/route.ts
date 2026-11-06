import { NextResponse } from 'next/server'
import { resolveAdmin } from '~/platform/supabase/current-admin'

export const dynamic = 'force-dynamic'

/**
 * The small read the restart page's waiting state asks (Exponential launch, ticket 33):
 * whether the church has access again, as the webhook writes it, and nothing else.
 */
export async function GET() {
  const resolution = await resolveAdmin()
  const hasAccess = resolution.status === 'admin' && resolution.admin.billing.hasAccess
  return NextResponse.json({ hasAccess }, { headers: { 'cache-control': 'no-store' } })
}
