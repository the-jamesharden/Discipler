import { NextResponse, type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getStripeAccount } from '~/service/container'
import { readPicture } from '../read'

export const dynamic = 'force-dynamic'

/**
 * "Yes, cancel my subscription", for a Subscription on a schedule, which Stripe's billing
 * page refuses (Exponential launch, ticket 33). The church's standing is the webhook's to
 * write, from the event this causes; the page reads Stripe, so it says so at once.
 */
export async function POST(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { status: 303 })

  const admin = await currentAdmin()
  if (!admin) return to('/login')
  if (admin.billing.standing === 'outside_stripe') return to('/settings')

  const read = await readPicture(admin.ministryId, new Date())
  if (read === 'unreachable') return to('/settings/billing?stripe=unreachable')
  if (!read || !read.picture.onASchedule) return to('/settings/billing')

  try {
    await getStripeAccount().cancelOnItsSchedule(read.picture.subscriptionId)
    return to('/settings/billing')
  } catch (error) {
    console.error(`Cancelling on a schedule failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return to('/settings/billing?stripe=unreachable')
  }
}
