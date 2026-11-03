import { describe, expect, it } from 'vitest'
import { ministryId } from '~/domain/ids'
import {
  readSeenSteps,
  SETUP_HISTORY,
  SETUP_STEPS,
  setupMeterOf,
  testCheckInSent,
  tourFinished,
  type SetupStep,
} from '~/domain/setup-meter'

/**
 * The setup meter as the page session hands it over (Exponential launch, ticket 26).
 * The steps themselves are read from history in SQL and proved over HTTP; this is the
 * reading of that answer.
 */

const answer = (done: readonly SetupStep[], seen: readonly SetupStep[] = []) => ({
  finished: false,
  done: Object.fromEntries(SETUP_STEPS.map((step) => [step, done.includes(step)])),
  seen,
  day: 1,
  hour: 9,
})

describe('the setup meter', () => {
  it('has seven steps, in the order the bar draws them', () => {
    expect(SETUP_STEPS).toEqual([
      'check_in_time',
      'tour',
      'test_check_in',
      'roster',
      'intake',
      'relationship',
      'accepted',
    ])
  })

  it('keeps the steps in order whatever order they were done in', () => {
    const meter = setupMeterOf(answer(['accepted', 'check_in_time', 'roster']))

    expect(meter).toMatchObject({
      shown: true,
      done: ['check_in_time', 'roster', 'accepted'],
    })
  })

  it('says which done steps this Admin has not yet seen', () => {
    const meter = setupMeterOf(answer(['check_in_time', 'roster', 'intake'], ['roster']))

    expect(meter).toMatchObject({ unseen: ['check_in_time', 'intake'] })
  })

  it('never calls a step unseen that is not done', () => {
    const meter = setupMeterOf(answer(['roster'], ['intake', 'roster']))

    expect(meter).toMatchObject({ unseen: [] })
  })

  it('carries the check-in day and hour the badge words', () => {
    expect(setupMeterOf(answer([]))).toMatchObject({ checkIn: { day: 1, hour: 9 } })
  })

  it('is not shown to an Admin who has seen the badge', () => {
    expect(setupMeterOf({ finished: true })).toEqual({ shown: false })
  })

  it('raises on an answer with a step missing, rather than reading it as not done', () => {
    const { done, ...rest } = answer([])
    const { tour: _tour, ...withoutTour } = done

    expect(() => setupMeterOf({ ...rest, done: withoutTour })).toThrow(/tour/)
  })

  describe('what the tour and the test check-in record', () => {
    const ministry = ministryId('11111111-1111-4111-8111-111111111111')
    const at = new Date('2026-11-04T10:00:00Z')

    it('records the tour finished, by whoever pressed Done', () => {
      expect(tourFinished({ ministryId: ministry, finishedBy: 'admin-1', at })).toEqual({
        ministryId: ministry,
        occurredAt: at,
        type: SETUP_HISTORY.tourFinished,
        subjectType: 'ministry',
        subjectId: ministry,
        payload: { finishedBy: 'admin-1' },
      })
    })

    it('records a test check-in sent, by whoever sent it', () => {
      expect(testCheckInSent({ ministryId: ministry, sentBy: 'admin-1', at })).toEqual({
        ministryId: ministry,
        occurredAt: at,
        type: SETUP_HISTORY.testCheckInSent,
        subjectType: 'ministry',
        subjectId: ministry,
        payload: { sentBy: 'admin-1' },
      })
    })
  })

  describe('reading what a page says was seen', () => {
    it('keeps the steps it knows, once each', () => {
      expect(readSeenSteps('roster,intake,roster')).toEqual(['roster', 'intake'])
    })

    it('drops anything else, because the column refuses it', () => {
      expect(readSeenSteps('roster,everything,,')).toEqual(['roster'])
    })

    it('reads nothing as nothing', () => {
      expect(readSeenSteps(null)).toEqual([])
    })
  })
})
