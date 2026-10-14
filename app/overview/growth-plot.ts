import type { GrowthSeries } from '~/domain/growth'

/**
 * Where everything on the growth chart goes (Pastor feedback, ticket 05), in
 * percent of the plot: the line and the grid are drawn in a stretched SVG, and
 * the dots and the labels sit over it as HTML at the same percentages. So the
 * chart fills the card at any width with text that stays its own size, which a
 * fixed-shape SVG cannot do between a phone and a desk, and none of it needs a
 * script.
 */

/** One rung on the left: a count, and how far down the plot it sits. */
export interface Rung {
  readonly value: number
  readonly y: number
}

export interface PlottedPoint {
  readonly x: number
  readonly y: number
  readonly count: number
  /** The label under it, if it gets one. */
  readonly labelled: boolean
  /** A label a phone drops, so the ones it keeps do not run into each other. */
  readonly minor: boolean
  readonly opensAt: Date
}

export interface Plot {
  readonly rungs: readonly Rung[]
  readonly points: readonly PlottedPoint[]
  /** The line, as an SVG path over a 100 by 100 box; empty with a single point. */
  readonly line: string
  /** The shading under it. */
  readonly area: string
}

/** How many labels the bottom carries at the most, on a desk. A phone keeps every other one. */
const MOST_LABELS = 7

/** Rungs at a step of one, two or five times a power of ten: 1, 2, 5, 10, 20, 50 ... */
const niceStep = (raw: number): number => {
  if (raw <= 1) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power
}

/**
 * The counts' range, rounded out to whole steps, with four or so between. Not
 * from zero: a line of 14 to 27 drawn from zero is a line flattened into the
 * top of the card. A flat line is given two either side, never below zero.
 */
export const rungsFor = (counts: readonly number[]): { readonly low: number; readonly high: number; readonly step: number } => {
  let least = Math.min(...counts)
  let most = Math.max(...counts)
  if (least === most) {
    least = Math.max(0, least - 2)
    most = least + 4
  }
  const step = niceStep((most - least) / 4)
  const low = Math.floor(least / step) * step
  const high = Math.max(Math.ceil(most / step) * step, low + step)
  return { low, high, step }
}

const rounded = (value: number) => Math.round(value * 100) / 100

export const plotOf = (series: GrowthSeries): Plot => {
  const { points, slots } = series
  const { low, high, step } = rungsFor(points.map((point) => point.count))
  const yOf = (value: number) => rounded(100 - ((value - low) / (high - low)) * 100)
  // The points are the last of the slots: a young Ministry's begin part way across.
  const first = slots - points.length
  const xOf = (slot: number) => (slots === 1 ? 100 : rounded((slot / (slots - 1)) * 100))

  // Labelled back from now, so the last point always has one.
  const stride = Math.max(1, Math.ceil(points.length / MOST_LABELS))

  const plotted = points.map((point, index): PlottedPoint => {
    const fromTheEnd = points.length - 1 - index
    return {
      x: xOf(first + index),
      y: yOf(point.count),
      count: point.count,
      labelled: fromTheEnd % stride === 0,
      minor: fromTheEnd % (stride * 2) !== 0,
      opensAt: point.opensAt,
    }
  })

  const rungs: Rung[] = []
  for (let value = low; value <= high; value += step) rungs.push({ value, y: yOf(value) })

  const line =
    plotted.length > 1 ? plotted.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ') : ''
  const area = line ? `${line} L${plotted.at(-1)!.x},100 L${plotted[0]!.x},100 Z` : ''

  return { rungs, points: plotted, line, area }
}
