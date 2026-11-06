import { NextResponse, type NextRequest } from 'next/server'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getStripeAccount } from '~/service/container'
import { readPicture } from '../read'

export const dynamic = 'force-dynamic'

/**
 * Update payment method and Cancel subscription (Exponential launch, ticket 33): one POST
 * for any Admin, which opens Stripe's billing page at that step for the customer Discipler
 * stored. Nothing the browser sends says whose.
 *
 * Stripe's billing page will not cancel a Subscription on a schedule, so for one of those
 * Cancel opens the question on Billing instead, and `../cancel` does it.
 */
export async function POST(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { status: 303 })

  const admin = await currentAdmin()
  if (!admin) return to('/login')
  if (admin.billing.standing === 'outside_stripe') return to('/settings')

  const step = (await request.formData()).get('step') === 'cancel' ? 'cancel' : 'update_method'

  const read = await readPicture(admin.ministryId, new Date())
  if (read === 'unreachable') return to('/settings/billing?stripe=unreachable')
  if (!read) return to('/settings/billing')
  if (step === 'cancel' && read.picture.onASchedule) return to('/settings/billing?cancel=ask')

  try {
    const address = await getStripeAccount().portalAddress({
      customerId: read.customerId,
      step,
      subscriptionId: read.picture.subscriptionId,
      returnTo: new URL('/settings/billing', appBaseUrl()).href,
    })
    return NextResponse.redirect(address, { status: 303 })
  } catch (error) {
    console.error(`Opening Stripe's billing page failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return to('/settings/billing?stripe=unreachable')
  }
}
