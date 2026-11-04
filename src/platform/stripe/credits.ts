import type Stripe from 'stripe'
import { REFERRAL_CREDIT_DESCRIPTION } from '~/domain/referral-credit'
import type { StripeCredits } from '~/service/ports'
import { stripeClient } from './billing'

/**
 * Stripe as the referral credit needs it (Exponential launch, ticket 32). The one write is
 * a negative customer balance transaction, which Stripe takes off that customer's next
 * invoices by itself.
 */

/** Where a balance transaction names the credit it came from. Discipler's ID, and no church's. */
const CREDIT_METADATA_KEY = 'referral_credit'

const idOf = (value: string | { readonly id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null)

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'resource_missing'

/** The charge behind an invoice's payment, which Stripe names through its payment intent. */
const chargeOfPayment = (payment: Stripe.InvoicePayment.Payment): string | null => {
  const direct = idOf(payment.charge)
  if (direct) return direct
  const intent = payment.payment_intent
  return intent && typeof intent === 'object' ? idOf(intent.latest_charge) : null
}

const fingerprintOfDetails = (details: Stripe.Charge.PaymentMethodDetails | null): string | null =>
  details?.card?.fingerprint ?? details?.us_bank_account?.fingerprint ?? null

export const createStripeCredits = (client: () => Stripe = stripeClient): StripeCredits => ({
  async invoice(invoiceId) {
    let invoice: Stripe.Invoice
    try {
      invoice = await client().invoices.retrieve(invoiceId, {
        expand: ['payments.data.payment.payment_intent'],
      })
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }

    const payment = invoice.payments?.data.find((each) => each.status === 'paid')
    const paidAt = invoice.status_transitions?.paid_at
    return {
      customerId: idOf(invoice.customer),
      paid: invoice.status === 'paid',
      amountPaidCents: invoice.amount_paid,
      paidAt: typeof paidAt === 'number' ? new Date(paidAt * 1000) : null,
      chargeId: payment ? chargeOfPayment(payment.payment) : null,
    }
  },

  async charge(chargeId) {
    const charge = await client().charges.retrieve(chargeId)
    return {
      takenBack: charge.refunded || charge.amount_refunded > 0 || charge.disputed,
      fingerprint: fingerprintOfDetails(charge.payment_method_details),
    }
  },

  async customer(customerId) {
    const stripe = client()
    const customer = await stripe.customers.retrieve(customerId)
    const { data } = await stripe.customers.listPaymentMethods(customerId, { limit: 100 })
    return {
      email: customer.deleted ? null : (customer.email ?? null),
      fingerprints: data.flatMap((method) => method.card?.fingerprint ?? method.us_bank_account?.fingerprint ?? []),
    }
  },

  async lookupKeyOfPrice(priceId) {
    const price = await client().prices.retrieve(priceId)
    return price.lookup_key
  },

  async appliedCredit(customerId, creditId) {
    for await (const transaction of client().customers.listBalanceTransactions(customerId, { limit: 100 })) {
      if (transaction.metadata?.[CREDIT_METADATA_KEY] === creditId) return transaction.id
    }
    return null
  },

  async applyCredit({ customerId, creditId, cents }) {
    const transaction = await client().customers.createBalanceTransaction(
      customerId,
      {
        amount: -cents,
        currency: 'usd',
        description: REFERRAL_CREDIT_DESCRIPTION,
        metadata: { [CREDIT_METADATA_KEY]: creditId },
      },
      { idempotencyKey: `referral-credit/${creditId}` },
    )
    return transaction.id
  },
})
