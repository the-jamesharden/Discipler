import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupMeterIsOn } from '~/platform/setup-meter-switch'
import type { SignedInAdmin } from '~/service/ports'
import { SetupMeter } from '../../app/setup-meter'

/**
 * The bar stays off on production until tickets 27 and 28 ship, because two of its seven
 * steps cannot be done until then. The over-HTTP suite runs with it on, so what it
 * draws is held there and only whether it is drawn is held here.
 */
describe('the setup meter switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const admin = {
    ministryName: 'Grace Church',
    setup: { shown: true, done: {}, seen: [], day: 2, hour: 9 },
  } as unknown as SignedInAdmin

  it('is on for exactly `true`, so an unset variable or a typo leaves it off', () => {
    expect(setupMeterIsOn({})).toBe(false)
    expect(setupMeterIsOn({ SETUP_METER_ON: '' })).toBe(false)
    expect(setupMeterIsOn({ SETUP_METER_ON: 'TRUE' })).toBe(false)
    expect(setupMeterIsOn({ SETUP_METER_ON: '1' })).toBe(false)
    expect(setupMeterIsOn({ SETUP_METER_ON: 'true' })).toBe(true)
  })

  it('draws nothing for an Admin who would be shown the bar, while it is off', () => {
    vi.stubEnv('SETUP_METER_ON', '')
    expect(SetupMeter({ admin })).toBeNull()
  })
})
