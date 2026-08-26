import { describe, expect, it } from 'vitest'
import { createTestClock, days, hours, weeks } from '~/domain/clock'

describe('the injected clock', () => {
  const start = new Date('2026-03-02T09:00:00Z')

  it('reports the instant it was given', () => {
    expect(createTestClock(start).now()).toEqual(start)
  })

  it('lets a test move weeks forward in milliseconds', () => {
    const clock = createTestClock(start)

    clock.advanceBy(weeks(2))

    expect(clock.now()).toEqual(new Date('2026-03-16T09:00:00Z'))
  })

  it('measures the durations the care rules are written in', () => {
    const clock = createTestClock(start)

    clock.advanceBy(hours(24))
    expect(clock.now()).toEqual(new Date('2026-03-03T09:00:00Z'))

    clock.advanceBy(days(4))
    expect(clock.now()).toEqual(new Date('2026-03-07T09:00:00Z'))
  })

  it('can be moved to a specific instant', () => {
    const clock = createTestClock(start)

    clock.advanceTo(new Date('2026-04-01T00:00:00Z'))

    expect(clock.now()).toEqual(new Date('2026-04-01T00:00:00Z'))
  })

  it('hands out copies, so a caller cannot reach in and change the time', () => {
    const clock = createTestClock(start)

    clock.now().setFullYear(1999)

    expect(clock.now()).toEqual(start)
  })

  it('refuses to run backwards', () => {
    const clock = createTestClock(start)

    expect(() => clock.advanceBy(-1)).toThrow(/backwards/)
    expect(() => clock.advanceTo(new Date('2026-01-01T00:00:00Z'))).toThrow(/backwards/)
  })
})
