import type Stripe from 'stripe'
import { STRIPE_COUPONS, STRIPE_PRICES, STRIPE_PRODUCT, type CatalogCoupon } from '~/domain/offers'
import { BILLING_PORTAL_CONFIGURATION_MARK } from './account'

/**
 * Creates what Discipler sells in one Stripe account (Exponential launch, ticket 04),
 * and only what is missing, so a second run changes nothing. A person runs it, once per
 * account; see `scripts/stripe-catalog.ts`. Nothing in the app calls it.
 *
 * Stripe's prices and coupons cannot be changed once made, so one that differs from
 * this is reported rather than quietly left, and a person decides what to do about it.
 */
export interface CatalogResult {
  readonly created: readonly string[]
  readonly alreadyThere: readonly string[]
  /** There, and not what the catalog says. Nothing was done about these. */
  readonly different: readonly string[]
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && (error as { code?: unknown }).code === 'resource_missing'

const orNull = async <T>(read: Promise<T>): Promise<T | null> => {
  try {
    return await read
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

const BILLING_PORTAL_NAME = 'billing_portal'

/**
 * Stripe's billing page as the spec has it (ticket 33): no login page and no plan
 * switching, so it is reached only from Billing, and nothing moves a Subscription between
 * prices. A cancellation takes effect at the end of what is paid for.
 */
const BILLING_PORTAL: Stripe.BillingPortal.ConfigurationCreateParams = {
  name: 'Discipler',
  metadata: BILLING_PORTAL_CONFIGURATION_MARK,
  login_page: { enabled: false },
  features: {
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
    subscription_update: { enabled: false },
    customer_update: { enabled: false },
    invoice_history: { enabled: true },
  },
}

const billingPortalDiffers = (there: Stripe.BillingPortal.Configuration): boolean =>
  there.login_page.enabled ||
  there.features.subscription_update.enabled ||
  !there.features.payment_method_update.enabled ||
  !there.features.subscription_cancel.enabled ||
  there.features.subscription_cancel.mode !== 'at_period_end'

const couponDiffers = (coupon: CatalogCoupon, there: Stripe.Coupon): boolean =>
  there.duration !== 'forever' ||
  ('percentOff' in coupon
    ? there.percent_off !== coupon.percentOff
    : there.amount_off !== coupon.centsOff || there.currency !== 'usd')

export const createCatalog = async (client: Stripe): Promise<CatalogResult> => {
  const created: string[] = []
  const alreadyThere: string[] = []
  const different: string[] = []

  const product = await orNull(client.products.retrieve(STRIPE_PRODUCT.id))
  if (product) {
    alreadyThere.push(STRIPE_PRODUCT.id)
    if (product.name !== STRIPE_PRODUCT.name) different.push(STRIPE_PRODUCT.id)
  } else {
    await client.products.create({ id: STRIPE_PRODUCT.id, name: STRIPE_PRODUCT.name })
    created.push(STRIPE_PRODUCT.id)
  }

  for (const price of STRIPE_PRICES) {
    const { data } = await client.prices.list({ lookup_keys: [price.lookupKey], limit: 1 })
    const there = data[0]
    if (there) {
      alreadyThere.push(price.lookupKey)
      if (
        there.unit_amount !== price.cents ||
        there.currency !== 'usd' ||
        there.recurring?.interval !== price.cycle
      ) {
        different.push(price.lookupKey)
      }
      continue
    }
    await client.prices.create({
      product: STRIPE_PRODUCT.id,
      lookup_key: price.lookupKey,
      unit_amount: price.cents,
      currency: 'usd',
      recurring: { interval: price.cycle },
    })
    created.push(price.lookupKey)
  }

  const coupons: readonly CatalogCoupon[] = Object.values(STRIPE_COUPONS)
  for (const coupon of coupons) {
    const there = await orNull(client.coupons.retrieve(coupon.id))
    if (there) {
      alreadyThere.push(coupon.id)
      if (couponDiffers(coupon, there)) different.push(coupon.id)
      continue
    }
    await client.coupons.create({
      id: coupon.id,
      name: coupon.name,
      duration: 'forever',
      ...('percentOff' in coupon
        ? { percent_off: coupon.percentOff }
        : { amount_off: coupon.centsOff, currency: 'usd' }),
    })
    created.push(coupon.id)
  }

  const { data: configurations } = await client.billingPortal.configurations.list({ active: true, limit: 100 })
  const portal = configurations.find(
    ({ metadata }) => metadata?.discipler === BILLING_PORTAL_CONFIGURATION_MARK.discipler,
  )
  if (portal) {
    alreadyThere.push(BILLING_PORTAL_NAME)
    if (billingPortalDiffers(portal)) different.push(BILLING_PORTAL_NAME)
  } else {
    await client.billingPortal.configurations.create(BILLING_PORTAL)
    created.push(BILLING_PORTAL_NAME)
  }

  return { created, alreadyThere, different }
}
