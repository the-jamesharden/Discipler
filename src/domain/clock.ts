/**
 * Every time-dependent rule reads from an injected clock, never from system time.
 *
 * The care rules -- two-week silence, three-week non-meeting, the twenty-four hour
 * sequence timeout, the next-day reminder, the Acceptance reminders, Invitation
 * Link expiry, and Pause expiry -- are all untestable without this seam, because
 * each one needs weeks to pass in a test that runs in milliseconds.
 */

export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

export interface TestClock extends Clock {
  advanceBy(milliseconds: number): void
  advanceTo(instant: Date): void
}

export const createTestClock = (start: Date): TestClock => {
  let current = new Date(start.getTime())

  return {
    now: () => new Date(current.getTime()),
    advanceBy: (milliseconds) => {
      if (milliseconds < 0) {
        throw new Error('A clock does not run backwards; advanceBy needs a positive duration')
      }
      current = new Date(current.getTime() + milliseconds)
    },
    advanceTo: (instant) => {
      if (instant.getTime() < current.getTime()) {
        throw new Error('A clock does not run backwards; advanceTo needs a later instant')
      }
      current = new Date(instant.getTime())
    },
  }
}

export const seconds = (n: number): number => n * 1000
export const minutes = (n: number): number => seconds(n) * 60
export const hours = (n: number): number => minutes(n) * 60
export const days = (n: number): number => hours(n) * 24
export const weeks = (n: number): number => days(n) * 7

/**
 * Whole days elapsed, rounded down. Both places that report how long a
 * relationship has waited -- the escalation event and the cancellation event --
 * ask this rather than each doing the division, so they can never disagree about
 * what a day is.
 */
export const daysSince = (from: Date, now: Date): number =>
  Math.floor((now.getTime() - from.getTime()) / days(1))
