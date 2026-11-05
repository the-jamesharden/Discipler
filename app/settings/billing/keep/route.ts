import { NextResponse, type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getStripeAccount } from '~/service/container'
import { readPicture } from '../read'

export const dynamic = 'force-dynamic'

/**
 * Keep my subscription (Exponential launch, ticket 33): undoes an end-of-period
 * cancellation at Stripe, and writes nothing here. The webhook stays the only writer of
 * billing state, and hears it from Stripe.
 */
export async function POST(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { status: 303 })

  const admin = await currentAdmin()
  if (!admin) return to('/login')
  if (admin.billing.standing === 'outside_stripe') return to('/settings')

  const read = await readPicture(admin.ministryId, new Date())
  if (read === 'unreachable') return to('/settings/billing?stripe=unreachable')
  if (!read) return to('/settings/billing')

  try {
    await getStripeAccount().keep(read.picture.subscriptionId)
    return to('/settings/billing')
  } catch (error) {
    console.error(`Keeping a subscription failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return to('/settings/billing?stripe=unreachable')
  }
}
