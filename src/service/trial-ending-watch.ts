import type { Clock } from '~/domain/clock'
import { firstNameOf } from '~/domain/payment-reminder'
import { TRIAL_ENDING_LOOKS_AHEAD_MS, trialEndingEmail, trialEndingEmailIsDue } from '~/domain/trial-ending'
import { whyNotSent } from './email-sender'
import type { EmailSender, StripeAccount, TrialEndingNotices } from './ports'

export interface TrialEndingWatch {
  readonly notices: TrialEndingNotices
  readonly account: Pick<StripeAccount, 'pictureOf'>
  readonly sender: EmailSender
  readonly clock: Clock
  readonly links: { readonly billing: () => URL; readonly logo: () => URL }
}

export interface TrialEndingOutcome {
  readonly sent: number
  /** Emails that did not go or were not marked, each tried again on the next tick. */
  readonly failed: number
}

/**
 * The email every Admin gets a week before a trial ends (Exponential launch, ticket 33),
 * run by the scheduled tick after every church's own work.
 *
 * **What it says is Stripe's**, read as it goes, so the amount and the card are what will
 * really happen. Stripe having changed its mind since the last event counts: a trial that
 * is no longer one, or is being cancelled, or has a plant year on it, gets no email.
 *
 * **An approved church plant gets none at all.** It is told it will be charged nothing,
 * and that sentence was not drawn (ticket 33's brief); the alternative is with James.
 *
 * **Sent, then marked**, per Admin. One church or Admin failing is logged by ID and costs
 * nobody else their email.
 */
export const watchTrialEndings = async ({
  notices,
  account,
  sender,
  clock,
  links,
}: TrialEndingWatch): Promise<TrialEndingOutcome> => {
  const now = clock.now()
  const candidates = await notices.toConsider(now, new Date(now.getTime() + TRIAL_ENDING_LOOKS_AHEAD_MS))

  let sent = 0
  let failed = 0
  for (const candidate of candidates) {
    const { church, timeZone, trialEndsAt, subscriptionId } = candidate
    if (!trialEndingEmailIsDue({ trialEndsAt, timeZone, now })) continue

    try {
      const picture = await account.pictureOf(candidate.customerId, now)
      if (
        !picture ||
        picture.subscriptionId !== subscriptionId ||
        picture.status !== 'trialing' ||
        picture.cancelsAt ||
        !picture.nextPayment ||
        picture.offers.some(({ kind }) => kind === 'plant_year')
      ) {
        continue
      }

      for (const admin of candidate.admins) {
        try {
          await sender.send(
            trialEndingEmail({
              church,
              userId: admin.userId,
              churchName: candidate.churchName,
              firstName: firstNameOf(admin.fullName),
              to: admin.to,
              trialEndsAt: picture.trial?.endsAt ?? trialEndsAt,
              timeZone,
              picture,
              billing: links.billing(),
              logo: links.logo(),
            }),
          )
          await notices.recordSent({ church, subscriptionId, userId: admin.userId, at: now })
          sent += 1
        } catch (error) {
          failed += 1
          console.error(`The trial-ending email for church ${church} did not go: ${whyNotSent(error)}`)
        }
      }
    } catch (error) {
      failed += candidate.admins.length
      console.error(
        `The trial-ending email for church ${church} could not read Stripe: ${error instanceof Error ? error.name : 'unknown'}`,
      )
    }
  }

  return { sent, failed }
}
