/**
 * The arithmetic of a ring, kept apart from its markup so it can be driven with
 * no renderer anywhere near it.
 *
 * The ring's radius makes its circumference exactly one hundred units, so a
 * segment's dash length *is* its percentage and its offset is a percentage too.
 */

export interface DonutSegment {
  readonly label: string
  readonly value: number
  readonly colour: string
}

/** One drawn segment: how long it is, and where on the ring it begins. */
export interface DonutArc extends DonutSegment {
  /** Its share of the ring, in the ring's own hundred units. */
  readonly length: number
  /** The `stroke-dashoffset` that puts its start where the last one ended. */
  readonly offset: number
}

/** 100 / (2 * pi): a circumference of exactly one hundred units. */
export const RADIUS = 15.9155

/**
 * Where the first segment begins. A circle's stroke starts at three o'clock and
 * an offset moves it backwards, so fifty units back is the far side of the ring:
 * nine o'clock, which is where the design starts its rings (`rotation: -90` on a
 * chart that would otherwise start at twelve). They run clockwise from there.
 */
const START = 50

/**
 * The segments worth drawing, each with its length and its place on the ring. A
 * segment with nothing in it is left out rather than drawn at no length, and a
 * ring with nothing in it at all has no arcs: the track beneath is what shows.
 */
export const donutArcs = (segments: readonly DonutSegment[]): readonly DonutArc[] => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return []

  let drawn = 0
  return segments.flatMap((segment) => {
    if (segment.value <= 0) return []
    const length = (segment.value / total) * 100
    const arc = { ...segment, length, offset: START - drawn }
    drawn += length
    return [arc]
  })
}

/**
 * The ring in words, for somebody who cannot see it. It carries every count,
 * because the legend beneath the ring carries the labels alone and the counts
 * are otherwise only on hover.
 */
export const donutSummary = (
  title: string,
  segments: readonly DonutSegment[],
  emptyLabel: string,
): string => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return `${title}: ${emptyLabel}`
  return `${title}: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(', ')}`
}
