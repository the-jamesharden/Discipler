import type { BillingPicture, PastBill } from '~/domain/billing-picture'
import type { MinistryId } from '~/domain/ids'
import { getBillingRecords, getStripeAccount, stripeIsConfigured } from '~/service/container'

/**
 * What Billing shows, read from Stripe on the server (Exponential launch, ticket 33).
 * `unreachable` covers a deployment with no Stripe too: the page says so and every other
 * page goes on working.
 */
export type BillingRead =
  | { readonly kind: 'unreachable' }
  /** It has no Subscription that began. */
  | { readonly kind: 'none' }
  | {
      readonly kind: 'read'
      readonly customerId: string
      readonly picture: BillingPicture
      readonly bills: readonly PastBill[]
    }

/** The church's customer, or null where it has never had one. */
export const customerOf = async (church: MinistryId): Promise<string | null> =>
  (await getBillingRecords().of(church)).customerId

export const readPicture = async (
  church: MinistryId,
  at: Date,
): Promise<{ readonly customerId: string; readonly picture: BillingPicture } | null | 'unreachable'> => {
  if (!stripeIsConfigured()) return 'unreachable'
  try {
    const customerId = await customerOf(church)
    if (!customerId) return null
    const picture = await getStripeAccount().pictureOf(customerId, at)
    return picture ? { customerId, picture } : null
  } catch (error) {
    console.error(`Reading a church's plan from Stripe failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return 'unreachable'
  }
}

export const readBilling = async (church: MinistryId, at: Date): Promise<BillingRead> => {
  const read = await readPicture(church, at)
  if (read === 'unreachable') return { kind: 'unreachable' }
  if (!read) return { kind: 'none' }
  try {
    return { kind: 'read', ...read, bills: await getStripeAccount().billsOf(read.customerId) }
  } catch (error) {
    console.error(`Reading a church's bills from Stripe failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return { kind: 'unreachable' }
  }
}
