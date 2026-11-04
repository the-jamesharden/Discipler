import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { directoryFor } from '../../app/search/pages'

/**
 * Search lists Office hours while the Help menu does (Exponential launch, tickets 24 and
 * 30). The file ships empty, so this is that file filled in as the routine step says.
 */

vi.mock('../../app/help/office-hours', () => ({
  NEXT_OFFICE_HOURS: {
    date: '2026-11-12',
    time: '12:00',
    timezone: 'America/Chicago',
    link: 'https://example.com/the-call',
  },
}))

const officeHoursRows = (query: string) =>
  directoryFor(query, null)
    .flatMap((group) => group.rows)
    .filter((row) => row.label === 'Office hours')

describe('search and the next office hours', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('finds Office hours while there is a next call, with the address the menu gives it', () => {
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))

    expect(officeHoursRows('office').map((row) => row.href)).toEqual(['/overview#office-hours'])
    expect(officeHoursRows('')).toHaveLength(1)
  })

  it('drops it once the date has passed, without being reloaded', () => {
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
    expect(officeHoursRows('office')).toHaveLength(1)

    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'))
    expect(officeHoursRows('office')).toEqual([])
    expect(officeHoursRows('')).toEqual([])
  })
})
