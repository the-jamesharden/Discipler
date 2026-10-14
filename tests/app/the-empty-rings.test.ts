import { describe, expect, it } from 'vitest'
import { NO_CHECK_INS, type CheckInCounts } from '~/domain/overview'
import { meetingRingEmpty, ratingsRingEmpty } from '../../app/overview/copy'

/**
 * What each of the Overview's two rings says when it has nothing to draw
 * (James, 2026-10-14, follow-up to PR #27). Each ring its own words, because
 * the two are empty for different reasons: Meeting Completion is over the
 * answered weeks and Check-In Ratings over the rated ones, so a week whose
 * questions all went unanswered is not a week with no check-ins.
 */

const counts = (sent: number, answered: number, held: number, rated = 0): CheckInCounts => ({
  sent,
  answered,
  held,
  rated: { outstanding: rated, good: 0, okay: 0, concern: 0 },
})

describe('an empty ring', () => {
  it('says no check-ins on both rings only when none were sent', () => {
    expect(meetingRingEmpty(NO_CHECK_INS)).toBe('No check-ins last week')
    expect(ratingsRingEmpty(NO_CHECK_INS)).toBe('No check-ins last week')
  })

  it('says nothing answered on Meeting Completion when check-ins went out and none came back', () => {
    expect(meetingRingEmpty(counts(3, 0, 0))).toBe('Nothing answered last week')
  })

  it('says nothing rated on Check-In Ratings when nothing was rated', () => {
    // Unanswered, or answered *we did not meet*, which asks for no rating.
    expect(ratingsRingEmpty(counts(3, 0, 0))).toBe('Nothing rated last week')
    expect(ratingsRingEmpty(counts(3, 2, 0))).toBe('Nothing rated last week')
  })
})
