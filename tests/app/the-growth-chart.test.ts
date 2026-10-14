import { describe, expect, it } from 'vitest'
import type { GrowthPoint, GrowthSeries } from '~/domain/growth'
import { growthChange, growthLabel, growthNow, growthPointTitle, growthSummary } from '../../app/overview/copy'
import { growthChoiceFrom, overviewAddress } from '../../app/overview/growth-address'
import { plotOf, rungsFor } from '../../app/overview/growth-plot'

/**
 * The growth chart's drawing, words and address (Pastor feedback, ticket 05).
 * What is counted is the domain's and is tested there; this is where it goes on
 * the card and what the card says about it.
 */

const seriesOf = (counts: readonly number[], slots = 12): GrowthSeries => ({
  slots,
  points: counts.map(
    (count, index): GrowthPoint => ({
      opensAt: new Date(Date.UTC(2026, 6, 20 + index * 7, 5)),
      countedAt: new Date(Date.UTC(2026, 6, 27 + index * 7, 5)),
      count,
    }),
  ),
})

describe('the rungs on the left', () => {
  it('round the range out to whole steps, as the mock-up drew 14 to 27', () => {
    expect(rungsFor([14, 15, 15, 17, 18, 18, 20, 22, 22, 24, 25, 27])).toEqual({ low: 10, high: 30, step: 5 })
  })

  it('give a flat line room either side, never below zero', () => {
    expect(rungsFor([0, 0, 0])).toEqual({ low: 0, high: 4, step: 1 })
    expect(rungsFor([7])).toEqual({ low: 5, high: 9, step: 1 })
    expect(rungsFor([1, 1])).toEqual({ low: 0, high: 4, step: 1 })
  })

  it('step in ones for small counts and in tens for large ones', () => {
    expect(rungsFor([2, 5])).toEqual({ low: 2, high: 5, step: 1 })
    expect(rungsFor([40, 180])).toEqual({ low: 0, high: 200, step: 50 })
  })
})

describe('the plot', () => {
  it('runs twelve weeks from edge to edge, and labels every other one back from now', () => {
    const plot = plotOf(seriesOf([14, 15, 15, 17, 18, 18, 20, 22, 22, 24, 25, 27]))

    expect(plot.points[0]!.x).toBe(0)
    expect(plot.points.at(-1)!.x).toBe(100)
    expect(plot.points.at(-1)!.y).toBe(15)
    expect(plot.points.map((point) => point.labelled)).toEqual([
      false, true, false, true, false, true, false, true, false, true, false, true,
    ])
    // A phone keeps every other label of those.
    expect(plot.points.filter((point) => point.labelled && !point.minor)).toHaveLength(3)
    expect(plot.line.startsWith('M0,80 L9.09,75')).toBe(true)
    expect(plot.area.endsWith('L100,100 L0,100 Z')).toBe(true)
  })

  it('puts a young Ministry’s few points at the right of the slots', () => {
    const plot = plotOf(seriesOf([1, 2, 3], 12))
    expect(plot.points.map((point) => point.x)).toEqual([81.82, 90.91, 100])
  })

  it('draws a single point and no line for a Ministry younger than a week', () => {
    const plot = plotOf(seriesOf([3]))
    expect(plot.points).toHaveLength(1)
    expect(plot.points[0]).toMatchObject({ x: 100, labelled: true })
    expect(plot.line).toBe('')
    expect(plot.area).toBe('')
    expect(plot.rungs.map((rung) => rung.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('labels at most seven points across many months', () => {
    const plot = plotOf(seriesOf(Array.from({ length: 30 }, (_, n) => n), 30))
    expect(plot.points.filter((point) => point.labelled).length).toBeLessThanOrEqual(7)
    expect(plot.points.at(-1)!.labelled).toBe(true)
  })
})

describe('the words', () => {
  it('say what is counted now', () => {
    expect(growthNow('total', 27)).toBe('people discipled now')
    expect(growthNow('mentorship', 1)).toBe('person in mentorship now')
    expect(growthNow('groups', 12)).toBe('people in groups now')
  })

  it('say the change across the chart, with a real minus sign and no colour of its own to carry', () => {
    expect(growthChange('weeks', 14, 27, 12)).toBe('+13 in 12 weeks')
    expect(growthChange('months', 9, 7, 4)).toBe('−2 in 4 months')
    expect(growthChange('weeks', 5, 5, 12)).toBe('No change in 12 weeks')
    expect(growthChange('months', 0, 1, 2)).toBe('+1 in 2 months')
  })

  it('say how new a Ministry with one point is, rather than a change of nothing', () => {
    expect(growthChange('weeks', 3, 3, 1)).toBe('Opened this week')
    expect(growthChange('months', 3, 3, 1)).toBe('Opened this month')
  })

  it('sum the line up for somebody who cannot see it', () => {
    expect(growthSummary('total', 'weeks', 14, 27, 12)).toBe('Total discipled over the last 12 weeks: 14 to 27')
    expect(growthSummary('groups', 'months', 2, 2, 1)).toBe('People in groups now: 2')
  })

  it('label a week by its Monday and a month by its name, in the Ministry Timezone', () => {
    // Midnight on Monday 27 July in Chicago is 5am UTC.
    expect(growthLabel('weeks', new Date('2026-07-27T05:00:00Z'), 'America/Chicago')).toBe('27 Jul')
    expect(growthLabel('months', new Date('2026-08-01T05:00:00Z'), 'America/Chicago')).toBe('Aug')
    expect(growthLabel('months', new Date('2027-01-01T06:00:00Z'), 'America/Chicago')).toBe('Jan 2027')
  })

  it('give each point its own words for a pointer resting on it', () => {
    const monday = new Date('2026-07-27T05:00:00Z')
    expect(growthPointTitle('weeks', monday, 'America/Chicago', 14, false)).toBe('Week of 27 Jul: 14')
    expect(growthPointTitle('months', monday, 'America/Chicago', 14, false)).toBe('Jul 2026: 14')
    expect(growthPointTitle('weeks', monday, 'America/Chicago', 27, true)).toBe('Now: 27')
  })
})

describe('the address', () => {
  it('opens on Total discipled by weeks when it says nothing', () => {
    expect(growthChoiceFrom({})).toEqual({ measure: 'total', scale: 'weeks' })
  })

  it('reads what was picked, and the opening choice for anything it does not know', () => {
    expect(growthChoiceFrom({ growth: 'groups', by: 'months' })).toEqual({ measure: 'groups', scale: 'months' })
    expect(growthChoiceFrom({ growth: 'everybody', by: 'years' })).toEqual({ measure: 'total', scale: 'weeks' })
  })

  it('writes the opening choice as plain /overview, and anything else into the query', () => {
    expect(overviewAddress({ measure: 'total', scale: 'weeks' })).toBe('/overview')
    expect(overviewAddress({ measure: 'mentorship', scale: 'weeks' })).toBe('/overview?growth=mentorship')
    expect(overviewAddress({ measure: 'total', scale: 'months' })).toBe('/overview?by=months')
    expect(overviewAddress({ measure: 'groups', scale: 'months' }, 'abc')).toBe('/overview?card=abc&growth=groups&by=months')
  })
})
