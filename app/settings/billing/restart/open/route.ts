import { NextResponse, type NextRequest } from 'next/server'
import { isBillingCycle } from '~/domain/offers'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { restartTheSubscription, stripeIsConfigured } from '~/service/container'

export const dynamic = 'force-dynamic'

/**
 * Makes the Subscription the restart page then confirms (Exponential launch, ticket 33).
 * The browser says monthly or yearly and nothing else. Opening unlocks nothing: access comes
 * back when the webhook reads a live Subscription.
 */
export async function POST(request: NextRequest) {
  const answer = (body: object, status = 200) =>
    NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })

  const admin = await currentAdmin()
  if (!admin) return answer({ refusal: 'restart.signed_out' }, 401)

  const said = (await request.json().catch(() => null)) as { cycle?: unknown } | null
  if (!isBillingCycle(said?.cycle)) return answer({ refusal: 'restart.unknown_cycle' }, 400)
  if (!stripeIsConfigured()) return answer({ refusal: 'restart.not_opened' }, 503)

  try {
    return answer(await restartTheSubscription(admin.ministryId, said.cycle))
  } catch (error) {
    console.error(`Opening a restart failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return answer({ refusal: 'restart.not_opened' }, 502)
  }
}
