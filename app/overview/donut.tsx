/**
 * A doughnut drawn on the server as inline SVG, from the numbers each one needs.
 * The prototype loads Chart.js from a CDN and carries a no-Chart fallback; a
 * server-drawn ring needs neither and keeps the no-JavaScript rule.
 *
 * One circle per segment, each a stroke on the same ring. The circumference is
 * made 100 units by the radius, so a segment's dash length is its percentage and
 * its offset is the percentage drawn before it. A ring with nothing to show is
 * drawn grey, so an empty Ministry's Overview has a chart-shaped nothing rather
 * than a hole.
 *
 * The figure and the counts sit beside the ring, not on it: the ring is left
 * clear, and the numbers read as a column next to it.
 */

export interface DonutSegment {
  readonly label: string
  readonly value: number
  readonly colour: string
}

/** 100 / (2 * pi): a circumference of exactly one hundred units. */
const RADIUS = 15.9155

export const Donut = ({
  title,
  segments,
  figure,
  emptyLabel,
}: {
  readonly title: string
  readonly segments: readonly DonutSegment[]
  /** The headline figure beside the ring: a rate, usually. */
  readonly figure: string
  readonly emptyLabel: string
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  let drawn = 0

  return (
    <div className="chart-box">
      <svg className="donut" viewBox="0 0 42 42" role="img" aria-label={`${title}: ${figure}`}>
        <circle cx="21" cy="21" r={RADIUS} fill="transparent" stroke="var(--cell)" strokeWidth="5" />
        {total > 0
          ? segments.map((segment) => {
              const share = (segment.value / total) * 100
              // Offset from the top rather than from three o'clock, which is where a
              // circle's stroke starts: 25 puts the first segment's start at twelve.
              const offset = 25 - drawn
              drawn += share
              return segment.value > 0 ? (
                <circle
                  key={segment.label}
                  cx="21"
                  cy="21"
                  r={RADIUS}
                  fill="transparent"
                  stroke={segment.colour}
                  strokeWidth="5"
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={offset}
                />
              ) : null
            })
          : null}
      </svg>
      <div className="donut-figures">
        <p className="donut-figure">{figure}</p>
        <ul className="donut-legend">
          {total === 0 ? (
            <li className="muted">{emptyLabel}</li>
          ) : (
            segments.map((segment) => (
              <li key={segment.label}>
                <i style={{ background: segment.colour }} aria-hidden="true" />
                {`${segment.label}: ${segment.value}`}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
