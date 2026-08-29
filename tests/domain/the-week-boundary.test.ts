import { describe, expect, it } from 'vitest'
import {
  cadenceInstantOf,
  calendarMonthOf,
  isoWeek,
  isoWeekOf,
  type Cadence,
} from '~/domain/week'

/**
 * A week is the ISO week in the Ministry timezone, and the timezone is the whole
 * point: two Ministries reading the same instant are in different weeks, different
 * months and different days, and every rule that counts weeks reads this.
 */

const at = (iso: string) => new Date(iso)

const cadence = (day: number, hour: number): Cadence => ({ day, hour })

describe('the ISO week a moment falls in', () => {
  // Sunday 23:30 UTC, which is already Monday in Sydney. One instant, two weeks.
  const sundayNight = at('2026-08-30T23:30:00Z')

  it('is the week of the Ministry timezone and not of UTC', () => {
    expect(isoWeekOf(sundayNight, 'UTC')).toBe('2026-W35')
    expect(isoWeekOf(sundayNight, 'Australia/Sydney')).toBe('2026-W36')
  })

  it('runs Monday to Sunday', () => {
    expect(isoWeekOf(at('2026-08-24T00:00:00Z'), 'UTC')).toBe('2026-W35')
    expect(isoWeekOf(at('2026-08-30T23:59:59Z'), 'UTC')).toBe('2026-W35')
    expect(isoWeekOf(at('2026-08-31T00:00:00Z'), 'UTC')).toBe('2026-W36')
  })

  // The reason the year is carried with the number rather than derived from the
  // date: `2026-W53` and `2027-W01` are consecutive weeks whose days share a
  // January, and a bare week number would make them collide every few years.
  it('carries the ISO year, which is not always the calendar year', () => {
    // Thursday 1 January 2026, so the week that begins in December is 2026-W01.
    expect(isoWeekOf(at('2025-12-29T12:00:00Z'), 'UTC')).toBe('2026-W01')
    expect(isoWeekOf(at('2026-01-01T12:00:00Z'), 'UTC')).toBe('2026-W01')
    // Sunday 3 January 2027 still belongs to 2026's fifty-third week.
    expect(isoWeekOf(at('2027-01-03T12:00:00Z'), 'UTC')).toBe('2026-W53')
  })
})

describe('the calendar month a moment falls in', () => {
  it('is resolved against the Ministry timezone', () => {
    const lastMoment = at('2026-08-31T23:30:00Z')
    expect(calendarMonthOf(lastMoment, 'UTC')).toBe('2026-08')
    expect(calendarMonthOf(lastMoment, 'Australia/Sydney')).toBe('2026-09')
  })
})

describe('the instant a week comes due', () => {
  it('is the cadence day and hour, local to the Ministry', () => {
    // Monday 9am in London during British Summer Time.
    expect(cadenceInstantOf(isoWeek('2026-W35'), 'Europe/London', cadence(1, 9))).toEqual(
      at('2026-08-24T08:00:00Z'),
    )
  })

  // `checkin_day` is 0-6 with 0 meaning Sunday, which is both Postgres's `dow`
  // and JavaScript's `getDay`. Sunday is the *last* day of an ISO week, so a
  // Ministry asking on Sundays is asked at the end of the week it belongs to and
  // never at the start of the next one.
  it('puts Sunday at the end of its ISO week, not the start of the next', () => {
    expect(cadenceInstantOf(isoWeek('2026-W35'), 'UTC', cadence(0, 9))).toEqual(
      at('2026-08-30T09:00:00Z'),
    )
    expect(cadenceInstantOf(isoWeek('2026-W35'), 'UTC', cadence(6, 9))).toEqual(
      at('2026-08-29T09:00:00Z'),
    )
  })

  // The hour is local, so the instant moves and the Leader's morning does not.
  it('holds the local hour across a daylight saving change', () => {
    expect(cadenceInstantOf(isoWeek('2026-W44'), 'America/New_York', cadence(1, 9))).toEqual(
      at('2026-10-26T13:00:00Z'),
    )
    expect(cadenceInstantOf(isoWeek('2026-W45'), 'America/New_York', cadence(1, 9))).toEqual(
      at('2026-11-02T14:00:00Z'),
    )
  })

  it('lands inside the week it was asked for', () => {
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const instant = cadenceInstantOf(isoWeek('2026-W35'), 'Europe/London', cadence(day, 8))
      expect(isoWeekOf(instant, 'Europe/London')).toBe('2026-W35')
    }
  })
})

describe('reading an ISO week from a string', () => {
  it('round-trips a well-formed one', () => {
    expect(isoWeek('2026-W35')).toBe('2026-W35')
    // A long ISO year really does have a fifty-third week.
    expect(isoWeek('2026-W53')).toBe('2026-W53')
  })

  /**
   * The reason this validates rather than casting like the other brands here.
   * `Number('')` is `0`, and zero is an integer -- so a guard written as an
   * integer check accepts `-W35`, hands `Date.UTC` a year of zero, and gets 1900
   * back. That would stamp a cadence on an outbound row eight-score years out and
   * report no error at all.
   */
  it('refuses a string that is not one, rather than resolving it to a wrong week', () => {
    for (const notAWeek of ['-W35', '2026-W', '2026-W99', '2026-W00', '26-W3', '']) {
      expect(() => isoWeek(notAWeek)).toThrow(/is not an ISO week/)
    }
  })
})
