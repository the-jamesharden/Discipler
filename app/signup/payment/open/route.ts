import { NextResponse, type NextRequest } from 'next/server'
import { isBillingCycle } from '~/domain/offers'
import { adminEmailFromToken, resolveAdmin } from '~/platform/supabase/current-admin'
import { getTrialWork } from '~/service/container'
import { openTrial } from '~/service/open-trial'
import { fieldOf, formOf, whileSignUpIsShut } from '../../answer'
import { codeRefusalMessage, paymentRefusalMessage, type PaymentRefusal } from '../copy'

export const dynamic = 'force-dynamic'

const STATUS: Record<PaymentRefusal, number> = {
  'payment.not_signed_in': 401,
  'payment.not_an_admin': 403,
  'payment.bad_cycle': 422,
  'payment.already_paying': 409,
  'payment.outside_stripe': 409,
  'payment.restart': 409,
  'payment.not_opened': 502,
}

const refused = (refusal: PaymentRefusal) =>
  NextResponse.json({ refusal, message: paymentRefusalMessage(refusal) }, { status: STATUS[refusal] })

/**
 * **Start free trial**, on its way to the payment step (Exponential launch, ticket 04).
 * Takes the form fields `cycle` (`month` or `year`) and `code`, and nothing else is
 * read: which church, its customer, its price and its free days are the server's.
 *
 * Answers `{ clientSecret, intentType: 'setup', publishableKey, trialEndsAt, offer,
 * codeRefusal }`, which is what the Payment Element needs and what the page says about
 * it (ticket 18). A code that did not apply is not a refusal: `codeRefusal` carries its
 * sentence, and the rest goes on at the normal price.
 *
 * This unlocks nothing. Access comes from Stripe, through the webhook, once the Element
 * has confirmed the setup intent.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const resolution = await resolveAdmin()
  if (resolution.status === 'signed-out') return refused('payment.not_signed_in')
  if (resolution.status === 'not-an-admin') return refused('payment.not_an_admin')

  const form = await formOf(request)
  const cycle = fieldOf(form, 'cycle')
  if (!isBillingCycle(cycle)) return refused('payment.bad_cycle')

  // Read before anything is made at Stripe, so a deployment missing it makes nothing.
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) return refused('payment.not_opened')

  const { admin } = resolution
  try {
    const opened = await openTrial(getTrialWork(), {
      church: admin.ministryId,
      churchName: admin.ministryName,
      adminEmail: await adminEmailFromToken(),
      cycle,
      code: fieldOf(form, 'code'),
    })
    if ('refusal' in opened) return refused(opened.refusal)

    return NextResponse.json({
      clientSecret: opened.clientSecret,
      intentType: 'setup',
      publishableKey,
      trialEndsAt: opened.trialEndsAt.toISOString(),
      offer: opened.offer,
      codeRefusal: opened.codeRefusal
        ? { refusal: opened.codeRefusal, message: codeRefusalMessage(opened.codeRefusal) }
        : null,
    })
  } catch (error) {
    // By its name alone: a Stripe error's message names customers and objects.
    console.error(`Opening a trial failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return refused('payment.not_opened')
  }
}
