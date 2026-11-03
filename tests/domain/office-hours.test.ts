import { describe, expect, it } from 'vitest'
import { upcomingOfficeHours, type OfficeHours } from '~/domain/office-hours'

/**
 * Office hours (Exponential launch, ticket 30): the next call comes from a file, and
 * everything that shows it asks here, so it is gone from all of them once its date
 * has passed.
 */

const hours: OfficeHours = {
  date: '2026-11-12',
  time: '12:00',
  timezone: 'America/Chicago',
  link: 'https://example.com/the-call',
}

describe('the next office hours', () => {
  it('is nothing while the file names no date', () => {
    expect(upcomingOfficeHours(null, new Date('2026-11-04T15:00:00Z'))).toBeNull()
  })

  it('says its date and its time as the mock-up does, in the zone the file gives', () => {
    expect(upcomingOfficeHours(hours, new Date('2026-11-04T15:00:00Z'))).toEqual({
      date: 'Thursday, November 12',
      time: '12pm CT',
      link: 'https://example.com/the-call',
    })
  })

  it('writes the minutes only where there are some, and morning as morning', () => {
    const at = (time: string) => upcomingOfficeHours({ ...hours, time }, new Date('2026-11-04T15:00:00Z'))?.time

    expect(at('12:30')).toBe('12:30pm CT')
    expect(at('09:00')).toBe('9am CT')
    expect(at('00:15')).toBe('12:15am CT')
    expect(at('15:00')).toBe('3pm CT')
  })

  it('stays through the whole of its date in the file’s zone, and is gone the moment the next begins', () => {
    // 11:59pm on the 12th in Chicago, which is already the 13th in UTC.
    expect(upcomingOfficeHours(hours, new Date('2026-11-13T05:59:00Z'))).not.toBeNull()
    // Midnight in Chicago.
    expect(upcomingOfficeHours(hours, new Date('2026-11-13T06:00:00Z'))).toBeNull()
  })

  it('is nothing for a date long past', () => {
    expect(upcomingOfficeHours(hours, new Date('2027-03-01T15:00:00Z'))).toBeNull()
  })
})
