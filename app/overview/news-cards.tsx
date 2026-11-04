import Link from 'next/link'
import type { GrowthChoice } from '~/domain/growth'
import { upcomingOfficeHours, type UpcomingOfficeHours } from '~/domain/office-hours'
import { newestUndismissed, type WhatsNewEntry } from '~/domain/whats-new'
import type { SignedInAdmin } from '~/service/ports'
import { NEXT_OFFICE_HOURS } from '../help/office-hours'
import { WHATS_NEW } from '../help/whats-new'
import { Cross, Megaphone, VideoCamera } from '../icons'
import { MEASURE_PARAMETER, SCALE_PARAMETER } from './growth-address'
import {
  DISMISS,
  JOIN_ON_ZOOM,
  OFFICE_HOURS_KICKER,
  OFFICE_HOURS_SENTENCE,
  READ_MORE,
  whatsNewKicker,
} from './news-copy'

/**
 * The What's new and office hours cards, side by side at the top of Overview, above
 * the numbers, and one alone takes the row (Exponential launch, ticket 30;
 * `.lavish/onboarding/s7-cards-top.html`). They read nothing: the entries and the next
 * call are files in the repo, and this Admin's dismissals came with the page's one read.
 *
 * The close button is an ordinary form POST, so it works before script has loaded.
 * Office hours has none, and goes by itself once its date has passed.
 */
export const NewsRow = ({
  entry,
  officeHours,
  chart,
}: {
  readonly entry: WhatsNewEntry | null
  readonly officeHours: UpcomingOfficeHours | null
  readonly chart: GrowthChoice
}) => {
  if (!entry && !officeHours) return null
  return (
    <div className="news-row">
      {entry ? (
        <article className="news-card">
          <form method="post" action="/overview/whats-new/dismiss">
            <input type="hidden" name="entry" value={entry.id} />
            <input type="hidden" name={MEASURE_PARAMETER} value={chart.measure} />
            <input type="hidden" name={SCALE_PARAMETER} value={chart.scale} />
            <button type="submit" className="x" aria-label={DISMISS}>
              <Cross />
            </button>
          </form>
          <p className="kicker">
            <Megaphone />
            {whatsNewKicker(entry.date)}
          </p>
          <h2>{entry.title}</h2>
          <p>{entry.sentence}</p>
          {entry.readMore ? <Link href={entry.readMore}>{READ_MORE}</Link> : null}
        </article>
      ) : null}
      {officeHours ? (
        <article className="news-card" id="office-hours">
          <p className="kicker">
            <VideoCamera />
            {OFFICE_HOURS_KICKER}
          </p>
          <h2>{`${officeHours.date}, ${officeHours.time}`}</h2>
          <p>{OFFICE_HOURS_SENTENCE}</p>
          <a className="btn small" href={officeHours.link} target="_blank" rel="noopener noreferrer">
            {JOIN_ON_ZOOM}
          </a>
        </article>
      ) : null}
    </div>
  )
}

/** The row for this Admin, now. */
export const NewsCards = ({ admin, chart }: { readonly admin: SignedInAdmin; readonly chart: GrowthChoice }) => (
  <NewsRow
    entry={newestUndismissed(WHATS_NEW, admin.whatsNewDismissed)}
    officeHours={upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date())}
    chart={chart}
  />
)
