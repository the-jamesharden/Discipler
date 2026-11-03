import type { DailyCap } from '~/service/daily-cap'

/**
 * A drain with no daily cap in its story, for the suites about something else. The
 * daily cap itself is `tests/domain/the-daily-cap.test.ts`.
 */
export const noDailyCap: DailyCap = {
  latestHold: async () => null,
  reached: async () => undefined,
}
