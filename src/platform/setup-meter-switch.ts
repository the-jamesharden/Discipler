import type { Environment } from './deployment'

/**
 * Whether the setup meter's bar is drawn on this deployment (Exponential launch, ticket
 * 26). Off until tickets 27 and 28 ship, because two of its seven steps cannot be done
 * until then, so a live Admin would see a bar stuck below 100% with no way to finish it
 * or close it (James, 2026-11-03).
 *
 * `SETUP_METER_ON=true` and nothing else turns it on, so an unset variable and a typo
 * leave it off. Only the drawing waits: the steps are read from history whichever way
 * this is set, so a church's progress is already right on the day it comes on, and a
 * step's confetti has not been played. The test runs turn it on, because the bar is
 * what they test.
 */
export const setupMeterIsOn = (env: Environment): boolean => env.SETUP_METER_ON === 'true'
