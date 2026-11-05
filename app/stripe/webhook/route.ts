import { after, NextResponse, type NextRequest } from 'next/server'
import { stripeInboxEntryOf } from '~/domain/billing'
import { systemClock } from '~/domain/clock'
import { admittedStripeEvent, comesFromStripe } from '~/platform/stripe/webhook'
import { getStripeEventInbox, processStripeEventAfterTheResponse } from '~/service/container'
import { networkOf } from '../../auth/network'

/**
 * Only Stripe may speak here (Exponential launch, ticket 03), and only from Stripe's
 * published addresses (ticket 37).
 *
 * The body is read raw, because the signature is over the bytes Stripe sent and a
 * parsed and reserialised body would not match them. A refused request gets a 400 and
 * nothing else, whichever check it failed.
 *
 * All this does with an event it admits is keep it and answer, because Stripe gives up
 * on an endpoint that is slow, and the work reads Stripe's own API. A replayed event
 * finds its row already there and changes nothing. Should keeping it fail, the 500
 * makes Stripe send it again.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Said in the log, because Stripe moving to an address not on the list would look like
  // this and like nothing else: billing would stop changing, with no error anywhere.
  if (!comesFromStripe(networkOf(request.headers), process.env)) {
    console.warn('A request reached the Stripe webhook from an address not on Stripe\'s list')
    return new NextResponse(null, { status: 400 })
  }

  const event = admittedStripeEvent(
    await request.text(),
    request.headers.get('stripe-signature'),
    process.env,
  )
  if (!event) return new NextResponse(null, { status: 400 })

  await getStripeEventInbox().receive(stripeInboxEntryOf(event), systemClock.now())

  // A replay too: a resend from the Dashboard is how somebody retries an event by
  // hand, and one already processed cannot be claimed.
  after(() => processStripeEventAfterTheResponse(event.id))

  return NextResponse.json({ received: true })
}
