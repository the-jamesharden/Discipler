import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import {
  firstNameOf,
  PAYMENT_REMINDER_LOOKS_BACK_MS,
  paymentReminderEmail,
  paymentReminderIsDue,
  paymentReminderSaysTheOffer,
} from '~/domain/payment-reminder'
import { whyNotSent } from './email-sender'
import type { ChurchSignups, EmailSender } from './ports'

export interface PaymentReminderWatch {
  readonly signups: Pick<ChurchSignups, 'remindersToConsider' | 'recordReminderSent'>
  readonly sender: EmailSender
  readonly clock: Clock
  /** Where "Start" goes, the logo is and the signed "Don't send me reminders" for a church. */
  readonly links: {
    readonly start: () => URL
    readonly logo: () => URL
    readonly stop: (church: MinistryId) => URL
  }
}

/** What one pass did: the tick reports it, so the cron log shows the watch ran. */
export interface PaymentReminderOutcome {
  readonly sent: number
  /** Reminders that did not go or were not marked; each is tried again while the day lasts. */
  readonly failed: number
}

/**
 * The one reminder a church that left the payment step is sent (Exponential launch,
 * ticket 18), run by the scheduled tick once a pass, after every church's own work.
 *
 * **Sent, then marked.** A send that failed is tried on the next tick that day. A send
 * that went and was not marked is sent again under the same key on the next tick, and
 * Resend drops it, because the day it can happen on is shorter than the key's 24 hours.
 * So one reminder cannot become two without a database that can be read but not written
 * for a whole day, and then the day has ended and nothing more goes anyway.
 *
 * One church failing is logged by its ID and costs nobody else their email.
 */
export const watchPaymentReminders = async ({
  signups,
  sender,
  clock,
  links,
}: PaymentReminderWatch): Promise<PaymentReminderOutcome> => {
  const now = clock.now()
  const candidates = await signups.remindersToConsider(new Date(now.getTime() - PAYMENT_REMINDER_LOOKS_BACK_MS))

  let sent = 0
  let failed = 0
  for (const candidate of candidates) {
    if (!paymentReminderIsDue({ openedAt: candidate.openedAt, timeZone: candidate.timeZone, now })) continue

    try {
      await sender.send(
        paymentReminderEmail({
          church: candidate.church,
          churchName: candidate.churchName,
          firstName: firstNameOf(candidate.fullName),
          to: candidate.to,
          start: links.start(),
          stop: links.stop(candidate.church),
          logo: links.logo(),
          offerSaved: paymentReminderSaysTheOffer(candidate.carriedCode, now),
        }),
      )
      await signups.recordReminderSent(candidate.church, now)
      sent += 1
    } catch (error) {
      failed += 1
      console.error(`The payment reminder for church ${candidate.church} did not go: ${whyNotSent(error)}`)
    }
  }

  return { sent, failed }
}
