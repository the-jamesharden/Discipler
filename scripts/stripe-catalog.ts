/**
 * Creates Discipler's product, prices and coupons in one Stripe account (Exponential
 * launch, ticket 04). A person runs this once per account, staging's sandbox first,
 * with a key that may write them, which is more than the app's restricted key may:
 *
 *   STRIPE_SECRET_KEY=... npm run stripe:catalog
 *
 * It only adds what is missing, so running it twice changes nothing. It prints which
 * Stripe IDs it made or found, and those are in the public catalog in
 * `src/domain/offers.ts` already. It prints no key.
 */

// Loaded only now, so a mistyped invocation is refused before the modules are touched.
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Usage: STRIPE_SECRET_KEY=... npm run stripe:catalog')
  process.exit(2)
}

const [{ createCatalog }, { stripeClient }] = await Promise.all([
  import('../src/platform/stripe/catalog'),
  import('../src/platform/stripe/billing'),
])

const { created, alreadyThere, different } = await createCatalog(stripeClient())

console.log(JSON.stringify({ created, alreadyThere, different }, null, 2))

if (different.length > 0) {
  console.error('Those under "different" are not what the catalog says. Nothing was changed.')
  process.exit(1)
}
