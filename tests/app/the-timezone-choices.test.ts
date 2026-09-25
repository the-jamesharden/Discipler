import { describe, expect, it } from 'vitest'
import { isKnownTimezone } from '~/domain/week'
import { timezoneChoices } from '../../app/settings/copy'

/**
 * The Timezone control on Ministry Settings. Every Ministry in production kept the
 * `UTC` it was created with, so every check-in hour was read as UTC; the control is
 * a picker that names the common zones the way people say them.
 */
describe('the timezone choices', () => {
  const offered = (current: string) => {
    const { common, everywhere } = timezoneChoices(current)
    return [...common, ...everywhere].map((choice) => choice.value)
  }

  it('leads with the US zones by the name people use', () => {
    const { common } = timezoneChoices('America/Chicago')
    expect(common[0]).toEqual({ value: 'America/New_York', label: 'Eastern time (New York)' })
    expect(common.map((choice) => choice.label)).toContain('Central time (Chicago)')
  })

  it('offers every zone the dispatcher can read a cadence against, and nothing else', () => {
    const values = offered('America/Chicago')
    expect(values).toContain('Europe/London')
    expect(values).toContain('Australia/Sydney')
    expect(values.every(isKnownTimezone)).toBe(true)
  })

  it('still offers the zone a Ministry was created with, so the form never saves another by accident', () => {
    const { common } = timezoneChoices('UTC')
    expect(common[0]).toEqual({ value: 'UTC', label: 'UTC' })
    expect(offered('UTC').filter((value) => value === 'UTC')).toHaveLength(1)
  })

  it('repeats nothing within a group', () => {
    const { common, everywhere } = timezoneChoices('UTC')
    for (const group of [common, everywhere]) {
      const values = group.map((choice) => choice.value)
      expect(new Set(values).size).toBe(values.length)
    }
  })
})
