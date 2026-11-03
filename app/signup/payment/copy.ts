import type { CodeRefusal } from '~/domain/offers'
import type { TrialRefusal } from '~/service/open-trial'

/**
 * What opening a trial says in words (Exponential launch, ticket 04). The expired line
 * is the spec's, word for word. The rest are drafts for ticket 18 to show or reword when
 * James reviews that page.
 *
 * `Record`s, so a refusal added to the service and left unworded fails the build.
 */
export type PaymentRefusal =
  | TrialRefusal
  | 'payment.not_signed_in'
  | 'payment.not_an_admin'
  | 'payment.bad_cycle'
  | 'payment.not_opened'

const REFUSALS: Record<PaymentRefusal, string> = {
  'payment.not_signed_in': 'Please sign in again to finish setting up.',
  'payment.not_an_admin': 'Only an Admin of the church can add a payment method.',
  'payment.bad_cycle': 'Please choose monthly or yearly.',
  'payment.already_paying': 'Your church is already set up with Discipler.',
  'payment.outside_stripe': "Your church's billing is handled by the Discipler team, so there's nothing to add here.",
  'payment.restart': 'Your church has been with us before. Restart your subscription from Settings, Billing.',
  'payment.not_opened': "We couldn't get the payment form ready just now. Please try again in a minute.",
}

export const paymentRefusalMessage = (refusal: PaymentRefusal): string => REFUSALS[refusal]

const CODE_REFUSALS: Record<CodeRefusal, string> = {
  'offer.code_expired': 'That code has expired, but your free trial still applies.',
  'offer.code_unknown': "We don't recognize that code, but your free trial still applies.",
}

export const codeRefusalMessage = (refusal: CodeRefusal): string => CODE_REFUSALS[refusal]
