import { signUpIsOpen } from '~/platform/sign-up-switch'
import type { ChurchSignup, SignedInAdmin } from '~/service/ports'

/**
 * Whether a signed-in Admin belongs on the payment step (Exponential launch, ticket 18,
 * Q82), the one answer `/`, `/signup/payment` and Billing all read, so none can send the
 * Admin to a page that sends them back. Each hands in the row its own page read.
 *
 * Yes for a church with a `church_signup` row, not billed outside Stripe, with no
 * confirmed Subscription, that has never had one that began, while sign-up is open.
 * Every other Admin is who they were.
 */
export const paymentStepOf = (admin: SignedInAdmin, signup: ChurchSignup | null): ChurchSignup | null => {
  if (!signUpIsOpen(process.env)) return null
  if (['outside_stripe', 'trialing', 'active', 'past_due'].includes(admin.billing.standing)) return null
  return signup && !signup.began ? signup : null
}
