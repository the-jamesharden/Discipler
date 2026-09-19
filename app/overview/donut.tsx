import { donutArcs, donutSummary, RADIUS, type DonutSegment } from './donut-geometry'

/**
 * A doughnut as the design draws it: a thick ring filling its card, the first
 * segment starting from the left, and the legend centred beneath it with the
 * labels alone. A segment's count is on hover, as it is in the prototype.
 *
 * Drawn on the server as inline SVG and not by the prototype's charting library:
 * every part of the design's look is geometry, and geometry needs no script. A
 * ring that is in the page when it arrives also has nothing to wait for and no
 * CDN to fail.
 *
 * One circle per segment, each a stroke on the same ring; the arithmetic is in
 * `donut-geometry.ts`. `fill="none"` and not `transparent`, because a transparent
 * fill is still painted for hit-testing, and the hole would answer a hover with
 * whichever segment was drawn last.
 *
 * A ring with nothing to show is its grey track, so an empty Ministry's Overview
 * has a chart-shaped nothing rather than a hole.
 */

export type { DonutSegment } from './donut-geometry'

/**
 * The design's ring is half as thick as it is wide (a 50% cutout). With the
 * stroke centred on `RADIUS`, that is a width of two thirds of it.
 */
const THICKNESS = (RADIUS * 2) / 3
const SIZE = 44
const CENTRE = SIZE / 2

export const Donut = ({
  title,
  segments,
  emptyLabel,
}: {
  readonly title: string
  readonly segments: readonly DonutSegment[]
  readonly emptyLabel: string
}) => {
  const arcs = donutArcs(segments)

  return (
    <div className="chart-box">
      <svg
        className="donut"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={donutSummary(title, segments, emptyLabel)}
      >
        <circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill="none" stroke="var(--cell)" strokeWidth={THICKNESS} />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            className="donut-arc"
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            fill="none"
            stroke={arc.colour}
            strokeWidth={THICKNESS}
            strokeDasharray={`${arc.length} ${100 - arc.length}`}
            strokeDashoffset={arc.offset}
          >
            <title>{`${arc.label}: ${arc.value}`}</title>
          </circle>
        ))}
      </svg>
      {arcs.length === 0 ? (
        <p className="donut-legend muted">{emptyLabel}</p>
      ) : (
        // Every segment is named, the empty ones too: a legend that dropped
        // "Concern (C)" in a good week would read as a chart that cannot show one.
        <ul className="donut-legend">
          {segments.map((segment) => (
            <li key={segment.label}>
              <i style={{ background: segment.colour }} aria-hidden="true" />
              {segment.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
