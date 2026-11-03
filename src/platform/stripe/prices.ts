import { startingPrice } from '~/domain/offers'

/**
 * The Stripe lookup keys of the first price, billed monthly and billed yearly. Yearly
 * is the same price billed differently, so a church on either is on it. A lookup key is
 * how the code names a price in whichever Stripe account it is running against, so
 * there is no ID to configure and staging's differ from production's by themselves.
 */
export const FIRST_PRICE_LOOKUP_KEYS: readonly [string, string] = [
  startingPrice('month').lookupKey,
  startingPrice('year').lookupKey,
]

/** As much of Stripe's client as this reads. */
export interface StripePriceList {
  readonly prices: {
    list(params: { lookup_keys: string[]; limit: number }): PromiseLike<{
      readonly data: readonly { readonly id: string; readonly lookup_key: string | null }[]
    }>
  }
}

/**
 * The first price's Stripe IDs (Exponential launch, ticket 14), or null unless Stripe
 * knows both. Null rather than the one it knows, because a yearly church missed for
 * want of a price would be missed in silence. Inactive prices are asked for too: a
 * church stays on a price that has been retired from sale. Throws when Stripe cannot
 * answer.
 */
export const firstPriceIdsIn = async (stripe: StripePriceList): Promise<readonly string[] | null> => {
  const { data } = await stripe.prices.list({
    lookup_keys: [...FIRST_PRICE_LOOKUP_KEYS],
    limit: FIRST_PRICE_LOOKUP_KEYS.length,
  })
  const ids = FIRST_PRICE_LOOKUP_KEYS.map((key) => data.find((price) => price.lookup_key === key)?.id)
  return ids.every((id) => id !== undefined) ? (ids as readonly string[]) : null
}
