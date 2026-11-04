import { signUpIsOpen } from '~/platform/sign-up-switch'
import { getChurchSignups } from '~/service/container'
import type { ChurchSignup, SignedInAdmin } from '~/service/ports'

/**
 * Whether a signed-in Admin belongs on the payment step (Exponential launch, ticket 18,
 * Q82), the one answer `/` and `/signup/payment` both read, so neither can send the
 * Admin to a page that sends them back.
 *
 * Yes for a church with a `church_signup` row, not billed outside Stripe, with no
 * confirmed Subscription, that has never had one that began, while sign-up is open.
 * Every other Admin is who they were, so SAU BCM, Anthem and Example Ministry never see
 * it, and those whose standing says so already are not asked about at all.
 */
export const paymentStepOf = async (admin: SignedInAdmin): Promise<ChurchSignup | null> => {
  if (!signUpIsOpen(process.env)) return null
  if (['outside_stripe', 'trialing', 'active', 'past_due'].includes(admin.billing.standing)) return null

  const signup = await getChurchSignups().of(admin.ministryId)
  return signup && !signup.began ? signup : null
}
