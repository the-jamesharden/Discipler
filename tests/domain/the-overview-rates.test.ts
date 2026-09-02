import { describe, expect, it } from 'vitest'
import { NO_CHECK_INS, checkInRates, percentage, ratedTotal } from '~/domain/overview'

/**
 * The three rates on the Overview are pure arithmetic over four counts, and the
 * thing worth proving about them is that they are three different fractions: a
 * response rate over sent, a meeting rate over answered, and a quality rate over
 * rated. A reader that put the meeting count over the sent count would show a
 * number nothing on the screen could explain, and the prototype's definitions say
 * in as many words that the first two must not be conflated.
 */

describe('a percentage', () => {
  it('reads zero when there is nothing to divide by', () => {
    // Zero rather than NaN, because an empty Ministry's Overview reads *0%*, which
    // is the honest empty state the tab promises, rather than a blank.
    expect(percentage(0, 0)).toBe(0)
    expect(percentage(3, 0)).toBe(0)
  })

  it('is a whole number', () => {
    expect(percentage(1, 3)).toBe(33)
    expect(percentage(2, 3)).toBe(67)
    expect(percentage(1, 8)).toBe(13)
    expect(percentage(7, 7)).toBe(100)
  })
})

describe('the three rates', () => {
  it('all read zero for a Ministry with no check-ins', () => {
    expect(checkInRates(NO_CHECK_INS)).toEqual({ response: 0, meeting: 0, quality: 0 })
  })

  it('run over three different denominators', () => {
    // Ten weeks asked about; eight answered; six of those said they met; five of
    // the six rated the meeting, and one of the five rated it a concern.
    const rates = checkInRates({
      sent: 10,
      answered: 8,
      held: 6,
      rated: { outstanding: 2, good: 2, concern: 1 },
    })

    expect(rates).toEqual({
      // 8 of 10 asked.
      response: 80,
      // 6 of the 8 *answered*, not of the 10 sent -- a Leader who has not
      // replied has not said they did not meet.
      meeting: 75,
      // 4 of the 5 *rated*, not of the 6 held: a meeting nobody rated yet is not
      // a bad one.
      quality: 80,
    })
  })

  it('does not conflate the meeting rate with the response rate', () => {
    // Every question answered, and every answer was *we did not meet*. The
    // response rate is perfect and the meeting rate is nil; a single number for
    // both would have to be wrong about one of them.
    const faithfulButNotMeeting = checkInRates({
      sent: 4,
      answered: 4,
      held: 0,
      rated: { outstanding: 0, good: 0, concern: 0 },
    })
    expect(faithfulButNotMeeting).toEqual({ response: 100, meeting: 0, quality: 0 })

    // Half the questions answered, and every answer was a meeting. Half a
    // response rate, a full meeting rate.
    const quietButMeeting = checkInRates({
      sent: 4,
      answered: 2,
      held: 2,
      rated: { outstanding: 1, good: 1, concern: 0 },
    })
    expect(quietButMeeting).toEqual({ response: 50, meeting: 100, quality: 100 })
  })

  it('counts outstanding and good together over everything rated', () => {
    const counts = {
      sent: 3,
      answered: 3,
      held: 3,
      rated: { outstanding: 1, good: 1, concern: 1 },
    }
    expect(ratedTotal(counts)).toBe(3)
    expect(checkInRates(counts).quality).toBe(67)
  })

  it('rounds each rate to a whole percentage', () => {
    const rates = checkInRates({
      sent: 3,
      answered: 2,
      held: 1,
      rated: { outstanding: 0, good: 0, concern: 1 },
    })
    expect(rates).toEqual({ response: 67, meeting: 50, quality: 0 })
  })
})
