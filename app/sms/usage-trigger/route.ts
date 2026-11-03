import { NextResponse, type NextRequest } from 'next/server'
import { signedByTwilio } from '~/platform/twilio/inbound-signature'
import { usageTriggerFired } from '~/platform/twilio/usage-trigger'
import { getSupportAlerts } from '~/service/container'

/**
 * Twilio's Usage Trigger posts here when one day's spending passes the amount set on
 * it, and support@ is emailed (Exponential launch, ticket 08). The trigger itself is
 * set in Twilio, not here, and the amount is kept there.
 *
 * Only Twilio may speak here, proved the way `/sms/inbound` proves it. A forgery
 * could only send support@ a false alarm, but an alarm that anybody can sound is one
 * nobody goes on believing.
 *
 * Under `/sms` because that short name is already reserved, so a church can never
 * hold this address.
 */
export async function POST(request: NextRequest) {
  // A body that is not a form cannot be what Twilio signed, so it is refused like any
  // other forgery rather than failing as a 500.
  const form = await request.formData().catch(() => null)
  if (!form) return new NextResponse(null, { status: 403 })

  const parameters = Object.fromEntries(
    [...form.entries()].flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
  ) as Record<string, string>

  if (!signedByTwilio(process.env, request.url, request.headers, parameters)) {
    return new NextResponse(null, { status: 403 })
  }

  try {
    await getSupportAlerts().twilioSpendPassed(usageTriggerFired(parameters))
  } catch (error) {
    // A 5xx, because Twilio retries one a few times. It fires at most once a day, so
    // those retries are all the chance this alarm has.
    console.error('Telling support@ that a day of Twilio spending passed its mark failed', error)
    return new NextResponse(null, { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
