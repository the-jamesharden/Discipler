import { describe, expect, it } from 'vitest'
import { donutArcs, donutSummary } from '../../app/overview/donut-geometry'

/**
 * The arithmetic of the Overview's two rings, with no markup anywhere near it.
 * The ring's circumference is one hundred units, so a segment's length is its
 * percentage, and the design starts the first segment from the left of the ring
 * and runs clockwise.
 */

const seg = (label: string, value: number) => ({ label, value, colour: 'var(--x)' })

describe('the arcs of a ring', () => {
  it('starts the first segment at nine o’clock and runs each one on from the last', () => {
    const arcs = donutArcs([seg('Completed', 3), seg('Missed', 1)])

    expect(arcs.map((arc) => arc.label)).toEqual(['Completed', 'Missed'])
    expect(arcs.map((arc) => arc.length)).toEqual([75, 25])
    // A circle's stroke begins at three o'clock and an offset moves it backwards,
    // so fifty units back is the far side of the ring: nine o'clock.
    expect(arcs[0]!.offset).toBe(50)
    expect(arcs[1]!.offset).toBe(50 - 75)
  })

  it('draws nothing for a segment with nothing in it, and keeps the rest in order', () => {
    const arcs = donutArcs([seg('Outstanding (A)', 2), seg('Good (B)', 0), seg('Concern (C)', 2)])

    expect(arcs.map((arc) => arc.label)).toEqual(['Outstanding (A)', 'Concern (C)'])
    expect(arcs.map((arc) => arc.length)).toEqual([50, 50])
    expect(arcs[1]!.offset).toBe(0)
  })

  it('covers the whole ring, whatever the counts', () => {
    const arcs = donutArcs([seg('a', 1), seg('b', 1), seg('c', 1)])
    expect(arcs.reduce((sum, arc) => sum + arc.length, 0)).toBeCloseTo(100, 10)
  })

  it('has no arcs at all where there is nothing to show', () => {
    expect(donutArcs([seg('Completed', 0), seg('Missed', 0)])).toEqual([])
    expect(donutArcs([])).toEqual([])
  })
})

describe('what a ring says to somebody who cannot see it', () => {
  it('names the chart and every count, since the legend carries the labels alone', () => {
    expect(donutSummary('Meeting Completion', [seg('Completed', 12), seg('Missed', 3)], 'No check-ins yet')).toBe(
      'Meeting Completion: Completed 12, Missed 3',
    )
  })

  it('says there is nothing yet rather than reading out zeros', () => {
    expect(donutSummary('Check-In Ratings', [seg('Good (B)', 0)], 'No check-ins yet')).toBe(
      'Check-In Ratings: No check-ins yet',
    )
  })
})
