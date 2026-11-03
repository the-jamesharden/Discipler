import type { Clock } from '~/domain/clock'
import { twilioBalanceIsLow } from '~/domain/twilio-balance'
import type { SupportAlerts, TwilioBalanceFalls, TwilioBalanceReader } from './ports'

export interface TwilioBalanceWatch {
  readonly balance: TwilioBalanceReader
  readonly falls: TwilioBalanceFalls
  readonly alerts: Pick<SupportAlerts, 'twilioBalanceLow'>
  readonly clock: Clock
}

/** What one pass found: the tick reports it, so the cron log shows the watch ran. */
export type TwilioBalanceWatchOutcome = 'fine' | 'recovered' | 'told' | 'still_low'

/**
 * Tells support@ when the Twilio balance is below its floor (Exponential launch,
 * ticket 08): once for each fall, and again only after it has recovered and fallen
 * again. Run by the scheduled tick once a pass, after every church's own work, so it
 * reads the balance as often as the cron runs.
 *
 * **A failed read changes nothing.** The read comes first and throws past everything
 * else, so a Twilio outage sends no false alarm, neither opens nor closes a fall, and
 * the next pass simply reads again. The caller logs it and carries on.
 *
 * Recorded, then told, then marked told, where the capacity watch tells and then
 * records. An email here is keyed on its fall and written only from what the fall
 * recorded, so a retry of one that did not go is the same message under the same key
 * however the balance has moved since, which is what Resend needs in order to drop a
 * repeat rather than refuse it, and a second fall on one day is a new key that it
 * does not drop.
 */
export const watchTwilioBalance = async ({
  balance,
  falls,
  alerts,
  clock,
}: TwilioBalanceWatch): Promise<TwilioBalanceWatchOutcome> => {
  const cents = await balance.readCents()
  const at = clock.now()

  if (!twilioBalanceIsLow(cents)) {
    return (await falls.recordRecovery(at, cents)) ? 'recovered' : 'fine'
  }

  const fall = (await falls.open()) ?? (await falls.recordFall(at, cents))
  if (fall.toldAt) return 'still_low'

  await alerts.twilioBalanceLow(fall)
  await falls.recordTold(fall.id, at)
  return 'told'
}
