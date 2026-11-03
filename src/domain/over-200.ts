import { subscriptionIsLive, type BillingStanding, type SubscriptionStatus } from './billing'
import { fewestPeopleInActiveRelationships, type GrowthHistory } from './growth'
import { PEOPLE_ON_THE_FIRST_PRICE } from './launch-terms'
import { calendarMonthOf, monthAfter, monthOpensAt, type CalendarMonth } from './week'

/**
 * The over-200 follow-up (Exponential launch, ticket 14): a church on the first price
 * that stays above its limit for a whole calendar month causes one email asking
 * someone to follow up. Nothing here moves a church to another price.
 *
 * The question is put to history, never to a running total, so a past month has the
 * same answer whenever it is asked:
 *
 * - **A month is the church's own**, from midnight on its first to midnight on the
 *   first of the next, on the wall in the Ministry Timezone. A month only has an
 *   answer once it has closed there.
 * - **Above means above at every instant.** Exactly at the limit is not above it, and
 *   a dip of a minute spoils the month. Getting this wrong costs a month's delay in a
 *   follow-up about a church hovering at the line.
 * - **A whole month means a whole month on the price.** The church has to have been on
 *   a live Subscription at the first price from the instant the month opened until
 *   now. So a church that signed up mid-month is first answered for the first whole
 *   calendar month after it, however many people it brought with it, and a church that
 *   has since moved to the higher price, or ended, is not followed up at all. A church
 *   billed outside Stripe is on no price.
 */

/**
 * How many closed months a pass asks about. The last one is enough for any tick that
 * failed; the one before it is for a month in which no tick ran at all.
 */
export const MONTHS_ASKED_ABOUT = 2

/** What one row of a church's billing history said at the moment it was recorded. */
export interface ChurchPriceRecord {
  readonly at: Date
  readonly status: SubscriptionStatus
  readonly priceId: string | null
}

export interface Over200Question {
  readonly month: CalendarMonth
  readonly timeZone: string
  readonly history: GrowthHistory
  /** In the order they were recorded, each with a Subscription. */
  readonly prices: readonly ChurchPriceRecord[]
  /** Where the church stands now, which is the one statement of who is billed and how. */
  readonly standing: BillingStanding
  /** The first price's Stripe IDs, billed monthly and billed yearly. */
  readonly firstPrices: readonly string[]
}

export interface Over200Answer {
  readonly month: CalendarMonth
  /** The lowest the count reached in the month, which is above the limit. */
  readonly fewestPeople: number
}

/** The closed months a pass asks about at this church, oldest first. */
export const closedMonthsToAsk = (now: Date, timeZone: string): readonly CalendarMonth[] => {
  const thisMonth = calendarMonthOf(now, timeZone)
  return Array.from({ length: MONTHS_ASKED_ABOUT }, (_, index) =>
    monthAfter(thisMonth, index - MONTHS_ASKED_ABOUT),
  )
}

/**
 * An instant before any of the months asked about opened, in any zone. One whole month
 * further back than it has to be, which is the simple way of being sure.
 */
export const earliestInstantAskedAbout = (now: Date): Date =>
  monthOpensAt(monthAfter(calendarMonthOf(now, 'UTC'), -(MONTHS_ASKED_ABOUT + 1)), 'UTC')

/** Whether every record from the month's opening on, and the last before it, is at the first price and live. */
const onTheFirstPriceSince = (
  prices: readonly ChurchPriceRecord[],
  firstPrices: readonly string[],
  opens: Date,
): boolean => {
  let onItAtTheOpening = false
  for (const { at, status, priceId } of prices) {
    const onIt = subscriptionIsLive(status) && priceId !== null && firstPrices.includes(priceId)
    if (at.getTime() <= opens.getTime()) onItAtTheOpening = onIt
    else if (!onIt) return false
  }
  return onItAtTheOpening
}

/** The standings of a church paying, or on its way to paying, through Stripe. */
const ON_A_STRIPE_PRICE: readonly BillingStanding[] = ['trialing', 'active', 'past_due']

/** The follow-up a closed month calls for at this church, or null where it calls for none. */
export const over200FollowUpFor = ({
  month,
  timeZone,
  history,
  prices,
  standing,
  firstPrices,
}: Over200Question): Over200Answer | null => {
  if (!ON_A_STRIPE_PRICE.includes(standing)) return null

  const opens = monthOpensAt(month, timeZone)
  if (!onTheFirstPriceSince(prices, firstPrices, opens)) return null

  const fewestPeople = fewestPeopleInActiveRelationships(history, opens, monthOpensAt(monthAfter(month, 1), timeZone))
  return fewestPeople > PEOPLE_ON_THE_FIRST_PRICE ? { month, fewestPeople } : null
}
