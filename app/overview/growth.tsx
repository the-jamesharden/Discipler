import Link from 'next/link'
import { GROWTH_MEASURES, GROWTH_SCALES } from '~/domain/growth'
import type { OverviewGrowth } from '~/service/ports'
import {
  GROWTH_MEASURE,
  GROWTH_MEASURE_PICKER,
  GROWTH_SCALE,
  GROWTH_SCALE_PICKER,
  GROWTH_TITLE,
  growthChange,
  growthLabel,
  growthNow,
  growthPointTitle,
  growthSummary,
} from './copy'
import { overviewAddress } from './growth-address'
import { plotOf } from './growth-plot'

/**
 * The growth chart (Pastor feedback, ticket 05): full width under the tiles and
 * above the donuts, a green line of how many people were being discipled at the
 * end of each week or month, ending on now. Drawn on the server like the
 * donuts, with no chart library.
 *
 * The dropdown is a `details` of three links, as the Account menu is, and the
 * toggle is two links, as the dashboard's other segmented controls are: both
 * work without script, and what is picked is the address. Each link keeps the
 * other control's choice and nothing else, so picking one opens no card and
 * changes nothing else on the page.
 */
export const GrowthChart = ({ growth }: { readonly growth: OverviewGrowth }) => {
  const { choice, series, timeZone } = growth
  const plot = plotOf(series)
  const first = series.points[0]!.count
  const last = series.points.at(-1)!.count
  const change = last - first
  const many = series.points.length

  return (
    <section className="card growth" aria-labelledby="growth-title">
      <div className="growth-head">
        <h2 className="card-title" id="growth-title">
          {GROWTH_TITLE}
        </h2>
        <div className="growth-controls">
          {/* Keyed by the choice, so a pick made after the page has hydrated
              lands on a closed menu, as a pick made without script does. */}
          <details className="growth-pick" key={`${choice.measure}-${choice.scale}`}>
            <summary aria-label={`${GROWTH_MEASURE_PICKER}: ${GROWTH_MEASURE[choice.measure]}`}>
              {GROWTH_MEASURE[choice.measure]}
              <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <ul className="growth-menu">
              {GROWTH_MEASURES.map((measure) => (
                <li key={measure}>
                  <Link
                    href={overviewAddress({ ...choice, measure })}
                    aria-current={measure === choice.measure ? 'true' : undefined}
                    scroll={false}
                    prefetch={false}
                  >
                    {GROWTH_MEASURE[measure]}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
          <nav className="seg" aria-label={GROWTH_SCALE_PICKER}>
            {GROWTH_SCALES.map((scale) => (
              <Link
                key={scale}
                href={overviewAddress({ ...choice, scale })}
                aria-current={scale === choice.scale ? 'true' : undefined}
                scroll={false}
                prefetch={false}
              >
                {GROWTH_SCALE[scale]}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="growth-now">
        <p className="stat-value">{last}</p>
        <span className="muted">{growthNow(choice.measure, last)}</span>
        <span className={many > 1 && change > 0 ? 'growth-change up' : 'growth-change'}>
          {growthChange(choice.scale, first, last, many)}
        </span>
      </div>

      <figure className="growth-plot" role="img" aria-label={growthSummary(choice.measure, choice.scale, first, last, many)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {plot.rungs.map((rung) => (
            <line key={rung.value} className="grid" x1="0" x2="100" y1={rung.y} y2={rung.y} vectorEffect="non-scaling-stroke" />
          ))}
          {plot.area ? <path className="growth-area" d={plot.area} /> : null}
          {plot.line ? <path className="growth-line" d={plot.line} vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {plot.rungs.map((rung) => (
          <span key={rung.value} className="growth-y" style={{ top: `${rung.y}%` }} aria-hidden="true">
            {rung.value}
          </span>
        ))}
        {plot.points.map((point, index) => {
          const now = index === plot.points.length - 1
          return (
            <span
              key={point.opensAt.toISOString()}
              className={now ? 'growth-dot now' : 'growth-dot'}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={growthPointTitle(choice.scale, point.opensAt, timeZone, point.count, now)}
            />
          )
        })}
        {plot.points
          .filter((point) => point.labelled)
          .map((point) => (
            <span
              key={point.opensAt.toISOString()}
              className={point.minor ? 'growth-x minor' : 'growth-x'}
              style={{ left: `${point.x}%` }}
              aria-hidden="true"
            >
              {growthLabel(choice.scale, point.opensAt, timeZone)}
            </span>
          ))}
      </figure>
    </section>
  )
}
