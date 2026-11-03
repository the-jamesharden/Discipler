import type { StripeEventRefusal } from '~/domain/billing'
import { EmailField, emailBody, emailSubject } from '~/domain/email'
import type { CapacityConcern } from '~/domain/shared-numbers'
import { TWILIO_BALANCE_FLOOR_CENTS, dollars } from '~/domain/twilio-balance'
import type { EmailSender, SupportAlerts } from './ports'

const NOT_SAID = 'Twilio did not say'

const amountOf = (cents: number | null): string => (cents === null ? NOT_SAID : dollars(cents))

/** `2026-11-09 15:00 UTC`. */
const atTheMinute = (at: Date): string => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`

const CONCERN_SAYS: Readonly<Record<CapacityConcern, string>> = {
  recipients: 'The shared numbers carry close to as many people as they safely can.',
  one_phone: 'The person in the most churches has at most one shared number left.',
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
})
