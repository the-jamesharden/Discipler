import type { StripeEventRefusal } from '~/domain/billing'
import { EmailField, emailBody, emailSubject } from '~/domain/email'
import { REFERRAL_CREDIT_DESCRIPTION, type ReferralCreditReview } from '~/domain/referral-credit'
import type { CapacityConcern } from '~/domain/shared-numbers'
import { MONTHLY_PRICE_CENTS, PEOPLE_ON_THE_FIRST_PRICE, REFERRAL_CREDIT_HELD_DAYS } from '~/domain/launch-terms'
import { TWILIO_BALANCE_FLOOR_CENTS, dollars } from '~/domain/twilio-balance'
import type { CalendarMonth } from '~/domain/week'
import type { EmailSender, SupportAlerts } from './ports'

const NOT_SAID = 'Twilio did not say'

const amountOf = (cents: number | null): string => (cents === null ? NOT_SAID : dollars(cents))

/** `2026-11-09 15:00 UTC`. */
const atTheMinute = (at: Date): string => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`

/** `October 2026`. A month is a label here, so it is read in no zone but its own. */
const monthAsWritten = (month: CalendarMonth): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  )

/** `$97`: both prices are whole dollars. */
const wholeDollars = (cents: number): string => `$${cents / 100}`

const CONCERN_SAYS: Readonly<Record<CapacityConcern, string>> = {
  recipients: 'The shared numbers carry close to as many people as they safely can.',
  one_phone: 'The person in the most churches has at most one shared number left.',
}

const REVIEW_SAYS: Readonly<Record<ReferralCreditReview, string>> = {
  billed_outside_stripe: 'The inviting church is billed outside Stripe, so this is yours to settle by hand.',
  no_live_subscription: 'The inviting church has no running subscription, so it has no next bill to take this off.',
  unknown_price: "The inviting church is on a price that isn't in Discipler's catalog, so Discipler can't say what one month of it is.",
  no_charge: 'The payment has no charge at Stripe, so Discipler could not check whether it was refunded or disputed.',
  same_customer: 'Both churches are the same Stripe customer.',
  shared_payment: 'Both churches pay with the same card or bank account.',
  shared_email_domain: 'The two churches share an email domain.',
}

const REFUSAL_SAYS: Readonly<Record<StripeEventRefusal, string>> = {
  customer_unknown: 'Its Stripe customer belongs to no church in Discipler.',
  church_mismatch: 'It names a different church from the one its Stripe customer belongs to.',
}

/**
 * What support@ is told about, sent as email through the one sender (Exponential
 * launch, tickets 06 and 10). Counts and a day only: an email field takes out
 * anything shaped like a phone number, so none of the shared numbers could be
 * listed even by mistake.
 */
export const createEmailSupportAlerts = (sender: EmailSender): SupportAlerts => ({
  async sharedNumbersNearCapacity({ concern, load, day }) {
    const { numbers, recipients, mostChurchesOnOnePhone } = load
    await sender.send({
      kind: 'numbersNearCapacity',
      subject: emailSubject`The shared numbers are near capacity`,
      body: emailBody`${EmailField.line(CONCERN_SAYS[concern])}

Right now ${EmailField.line(String(numbers))} numbers carry ${EmailField.line(String(recipients))} (phone, church) pairs, and one phone is in ${EmailField.line(String(mostChurchesOnOnePhone))} churches.

Buy a number into the discipler-sms Messaging Service in Twilio, then add it to the shared set with npm run shared-number against production. Until one is added, a church's first text to a phone that already hears from every number waits on the queue.`,
      once: `numbers-near-capacity:${concern}:${numbers}:${day}`,
    })
  },

  async textingGateUnread({ day }) {
    await sender.send({
      kind: 'textingGateUnread',
      subject: emailSubject`The texting gate could not read a church's access`,
      body: emailBody`On at least one church, the query that says whether it may text failed on ${EmailField.line(day)}.

Discipler keeps texting when that happens, so a broken read cannot silence a church. That means a church without a live subscription may be sending texts until this is fixed. Look at the database first, and at the app.billing_has_access function.

This email is sent once a day for as long as it goes on.`,
      once: `texting-gate-unread:${day}`,
    })
  },

  async twilioBalanceLow({ id, balanceCents, fellAt }) {
    const floor = EmailField.line(dollars(TWILIO_BALANCE_FLOOR_CENTS))
    await sender.send({
      kind: 'twilioBalanceLow',
      subject: emailSubject`The Twilio balance is below ${floor}`,
      body: emailBody`The Twilio balance was ${EmailField.line(dollars(balanceCents))} when Discipler read it at ${EmailField.line(atTheMinute(fellAt))}, which is below ${floor}.

Auto-recharge should have refilled it before now, so a recharge may have failed. Check the card and the auto-recharge setting in Twilio's billing. If the balance runs out, every church's texts and phone codes stop.

This email is not sent again until the balance has recovered and fallen again.`,
      once: id,
    })
  },

  async twilioSpendPassed({ spentCents, markCents, watching, once }) {
    await sender.send({
      kind: 'twilioSpendPassed',
      subject: emailSubject`A day of Twilio spending passed its mark`,
      body: emailBody`Twilio's usage trigger fired: one day's spending has passed the amount set on it.

Spent so far: ${EmailField.line(amountOf(spentCents))}
The amount set: ${EmailField.line(amountOf(markCents))}
What it watches: ${EmailField.line(watching ?? NOT_SAID)}

Nothing has been stopped, and texts keep going. Look at usage in Twilio's console to see what is sending.`,
      once,
    })
  },

  // Nothing in it but the day, so a retry is the same email and the vendor's
  // idempotency key can drop it.
  async dailyCapReached({ day }) {
    await sender.send({
      kind: 'dailyCapReached',
      subject: emailSubject`Twilio's daily text limit was reached`,
      body: emailBody`Twilio answered a text with error 30023 on ${EmailField.line(day)}, Pacific time: Discipler's brand has reached its daily limit.

Discipler has stopped sending for every church. Nothing is lost: every text stays on the queue. Sending starts again after midnight Pacific, and what was held goes out once it is morning at each church.

This email is sent once a day. If it keeps coming, the registration needs a higher limit.`,
      once: `daily-cap:${day}`,
    })
  },

  // The church's name and its Stripe customer, so someone can follow up, and a count:
  // nobody in the congregation. Written only from what was recorded, so a retry is the
  // same message under the same key.
  async over200FollowUp({ church, churchName, customerId, month, fewestPeople }) {
    const name = EmailField.line(churchName)
    const limit = EmailField.line(String(PEOPLE_ON_THE_FIRST_PRICE))
    const written = EmailField.line(monthAsWritten(month))
    await sender.send({
      kind: 'over200FollowUp',
      subject: emailSubject`${name} stayed above ${limit} people through ${written}`,
      body: emailBody`${name} had more than ${limit} people in active relationships for the whole of ${written}, in the church's own time zone. The fewest at any moment that month was ${EmailField.line(String(fewestPeople))}.

It is on the ${EmailField.line(wholeDollars(MONTHLY_PRICE_CENTS.upToTheLimit))} price. Nothing moves it to ${EmailField.line(wholeDollars(MONTHLY_PRICE_CENTS.aboveTheLimit))} on its own, so someone should follow up with the church.

Stripe customer: ${EmailField.line(customerId)}

This email is sent once for each month a church stays above the limit.`,
      once: `over-200:${church}:${month}`,
    })
  },

  // The event's ID is all anybody needs: it opens in the Stripe Dashboard, and it
  // keeps a church's details out of an inbox.
  async billingEventRefused({ eventId, eventType, refusal }) {
    await sender.send({
      kind: 'billingEventRefused',
      subject: emailSubject`A Stripe event was refused`,
      body: emailBody`Discipler refused Stripe event ${EmailField.line(eventId)} (${EmailField.line(eventType)}) and recorded nothing from it.

${EmailField.line(REFUSAL_SAYS[refusal])}

Open the event in the Stripe Dashboard to see whose it is. Nothing further happens on its own.`,
      once: `billing-event-refused:${eventId}`,
    })
  },

  // The names and the Stripe customers, so that James can look at both and settle it:
  // this goes to the founders and nobody else, and no church ever hears the other's name.
  async referralCreditForReview(review) {
    const none = 'None'
    await sender.send({
      kind: 'referralCreditReview',
      subject: emailSubject`A referral credit is waiting for you`,
      body: emailBody`${EmailField.line(review.invitingChurchName)} earned a referral credit: ${EmailField.line(review.invitedChurchName)}, which it invited, paid its first real bill on ${EmailField.line(atTheMinute(review.paidAt))}, and ${EmailField.line(String(REFERRAL_CREDIT_HELD_DAYS))} days have passed with no refund or dispute.

Discipler has not applied it. ${EmailField.line(REVIEW_SAYS[review.because])}

Inviting church's Stripe customer: ${EmailField.line(review.invitingCustomerId ?? none)}
Invited church's Stripe customer: ${EmailField.line(review.invitedCustomerId ?? none)}
Referral: ${EmailField.line(review.referralId)}

If it should stand, take one month of the inviting church's price off its bill by hand: in Stripe, as a credit on the customer's balance described as "${EmailField.line(REFERRAL_CREDIT_DESCRIPTION)}", or on its invoice if it is billed outside Stripe. Nothing further happens on its own.`,
      once: `referral-credit-review:${review.creditId}`,
    })
  },
})
