import { holdFrom, type DailyCapHold } from '~/domain/daily-cap'
import type { DailyCapHolds, SupportAlerts } from './ports'

/**
 * Twilio's daily limit as a drain meets it (Exponential launch, ticket 07): what the
 * last hold was, and that the limit has just been reached. Telling support@ is kept
 * in here, so nothing a drain does can send the email twice or forget it.
 */
export interface DailyCap {
  /** The hold most recently reached, standing or over, with support@ told about it. */
  latestHold(now: Date): Promise<DailyCapHold | null>
  /** Twilio has just answered 30023. Never throws: the drain has stopped either way. */
  reached(now: Date): Promise<void>
}

export const createDailyCap = ({
  holds,
  alerts,
}: {
  readonly holds: DailyCapHolds
  readonly alerts: SupportAlerts
}): DailyCap => {
  /**
   * Told, then recorded, as the capacity watch does: an email that did not go is not
   * recorded, so the next drain tries again. Two drains that both find it owed send
   * the one email, because its `once` is the day and the vendor drops the second.
   *
   * Caught here, because an alert that could not go is no reason to hold back a
   * church's texts, or to stop holding them.
   */
  const tell = async (hold: DailyCapHold, now: Date): Promise<void> => {
    if (hold.alertedAt) return
    try {
      await alerts.dailyCapReached({ day: hold.day })
      await holds.recordAlerted(hold.day, now)
    } catch (error) {
      console.error(`Could not tell support@ about the daily cap on ${hold.day}`, error)
    }
  }

  return {
    async latestHold(now) {
      const hold = await holds.latest(now)
      if (hold) await tell(hold, now)
      return hold
    },

    async reached(now) {
      try {
        await holds.record(holdFrom(now))
        const hold = await holds.latest(now)
        if (hold) await tell(hold, now)
      } catch (error) {
        // The drain has already stopped. With no record, the next one asks Twilio
        // again and is told again, so this costs one more refused text.
        console.error('Could not record that the daily cap was reached', error)
      }
    },
  }
}
