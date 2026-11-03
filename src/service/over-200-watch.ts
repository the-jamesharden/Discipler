import type { Clock } from '~/domain/clock'
import { PEOPLE_ON_THE_FIRST_PRICE } from '~/domain/launch-terms'
import { closedMonthsToAsk, earliestInstantAskedAbout, over200FollowUpFor } from '~/domain/over-200'
import type { Over200Church, Over200FollowUps, SupportAlerts } from './ports'

export interface Over200Watch {
  readonly followUps: Over200FollowUps
  readonly alerts: Pick<SupportAlerts, 'over200FollowUp'>
  readonly clock: Clock
  /** The first price's Stripe IDs, billed monthly and billed yearly. */
  readonly firstPrices: readonly string[]
}

/** What one pass did: the tick reports it, so the cron log shows the watch ran. */
export interface Over200WatchOutcome {
  /** Emails sent and recorded on this pass. */
  readonly told: number
  /** Churches that could not be read and emails that could not be finished; all are tried again. */
  readonly failed: number
}

const nameOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown')

/** Asks about the closed months not yet answered "yes", and keeps each "yes" before anything is sent. */
const ask = async (
  { followUps, clock, firstPrices }: Over200Watch,
  church: Over200Church,
): Promise<void> => {
  const now = clock.now()
  const months = closedMonthsToAsk(now, church.timeZone).filter((month) => !church.followedUp.includes(month))
  if (months.length === 0) return

  const { history, prices, standing } = await followUps.recordsOf(church.id)
  for (const month of months) {
    const answer = over200FollowUpFor({ month, timeZone: church.timeZone, history, prices, standing, firstPrices })
    if (!answer) continue
    await followUps.record(
      {
        church: church.id,
        churchName: church.name,
        customerId: church.customerId,
        month,
        fewestPeople: answer.fewestPeople,
      },
      now,
    )
  }
}

/**
 * Emails support@ about a church on the first price that stayed above its limit for a
 * whole calendar month (Exponential launch, ticket 14), once per church per month. Run
 * by the scheduled tick once a pass, after every church's own work.
 *
 * **Recorded, then told, then marked told**, like the balance watch. The row is the
 * memory a stateless tick does not have, and it is keyed on the church and the month,
 * so each failure has one ending:
 *
 * - A tick that failed before asking asks on the next pass, because the question is put
 *   to history and history has not moved.
 * - An email that failed stays recorded and untold, and every pass sends what is owed
 *   whichever month it is about, so it cannot be lost by the calendar moving on.
 * - An email that went but was not marked is sent again word for word under the same
 *   key on the next pass, an hour later, and Resend drops it. That key lasts 24 hours,
 *   so a duplicate takes a database that can be read but not written for a whole day.
 *
 * A "no" is not recorded. It is read off history again on the next pass, at the cost of
 * reading the history of a church that held more than the limit in that time.
 *
 * One church failing is logged by its ID and costs nobody else their email.
 */
export const watchOver200Churches = async (watch: Over200Watch): Promise<Over200WatchOutcome> => {
  const { followUps, alerts, clock, firstPrices } = watch
  let failed = 0

  const churches = await followUps.churchesToAsk(
    firstPrices,
    earliestInstantAskedAbout(clock.now()),
    PEOPLE_ON_THE_FIRST_PRICE,
  )
  for (const church of churches) {
    try {
      await ask(watch, church)
    } catch (error) {
      failed += 1
      console.error(`Asking about ministry ${church.id} and the over-200 follow-up failed: ${nameOf(error)}`)
    }
  }

  let told = 0
  for (const followUp of await followUps.unsent()) {
    try {
      await alerts.over200FollowUp(followUp)
      await followUps.recordTold(followUp.church, followUp.month, clock.now())
      told += 1
    } catch (error) {
      failed += 1
      console.error(`Telling support@ about ministry ${followUp.church} and ${followUp.month} failed: ${nameOf(error)}`)
    }
  }

  return { told, failed }
}
