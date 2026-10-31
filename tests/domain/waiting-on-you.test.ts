import { describe, expect, it } from 'vitest'
import { isAnybodyWaiting, showingOf } from '~/domain/waiting-on-you'

/**
 * The unpaired pop-up (Exponential launch, ticket 29): when it has anything to
 * say, and which showing of it a visit to the Overview belongs to. It shows once
 * a showing, and a showing is one sign-in on one of the church's own days.
 */

describe('whether anybody is waiting on the Admin', () => {
  it('is nobody when both counts are zero', () => {
    expect(isAnybodyWaiting({ toPair: 0, awaitingIntake: 0 })).toBe(false)
  })

  it('is somebody when either count is above zero', () => {
    expect(isAnybodyWaiting({ toPair: 1, awaitingIntake: 0 })).toBe(true)
    expect(isAnybodyWaiting({ toPair: 0, awaitingIntake: 3 })).toBe(true)
  })
})

describe('which showing a visit belongs to', () => {
  const NEW_YORK = 'America/New_York'
  const session = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'

  it('is the same one all day long for one sign-in', () => {
    // 7am and 11pm on Monday 2 November 2026 in New York.
    expect(showingOf(session, new Date('2026-11-02T12:00:00Z'), NEW_YORK)).toBe(
      showingOf(session, new Date('2026-11-03T04:00:00Z'), NEW_YORK),
    )
  })

  it('is a new one at midnight in the church, not at midnight in Greenwich', () => {
    // 7:30pm and 8:30pm on the same New York evening, either side of UTC midnight.
    expect(showingOf(session, new Date('2026-11-02T23:30:00Z'), NEW_YORK)).toBe(
      showingOf(session, new Date('2026-11-03T00:30:00Z'), NEW_YORK),
    )
    // 11:59pm Monday and 12:01am Tuesday in New York.
    expect(showingOf(session, new Date('2026-11-03T04:59:00Z'), NEW_YORK)).not.toBe(
      showingOf(session, new Date('2026-11-03T05:01:00Z'), NEW_YORK),
    )
  })

  it('is a new one for a new sign-in on the same day', () => {
    const now = new Date('2026-11-02T15:00:00Z')
    expect(showingOf(session, now, NEW_YORK)).not.toBe(
      showingOf('9a0d6c2e-6f1e-4c43-8a8b-1c2d3e4f5a6b', now, NEW_YORK),
    )
  })
})
