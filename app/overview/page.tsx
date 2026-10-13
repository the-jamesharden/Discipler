import Link from 'next/link'
import { redirect } from 'next/navigation'
import { relationshipIdFrom } from '~/domain/ids'
import { checkInRates, ratedTotal } from '~/domain/overview'
import { getOverviewReader } from '~/service/container'
import { careOutcomeMessage, careRefusalMessage } from '../follow-up/copy'
import { readTheConcerns } from '../pair-card/open'
import { PairCard } from '../pair-card/pair-card'
import { AdminShell, NotAnAdmin } from '../shell'
import {
  ALL_RELATIONSHIPS,
  CHECK_IN_RATINGS,
  LAST_WEEK,
  MEETING_COMPLETION,
  NO_CHECK_INS_LAST_WEEK,
  NO_RELATIONSHIPS,
  OVERVIEW_SUBTITLE,
  QUICK_STATS,
  relationshipCount,
  TILES,
  withPeople,
} from './copy'
import { Donut } from './donut'
import { flagsFor } from './flags'
import { cardPill, needOf } from './need'

export const dynamic = 'force-dynamic'

/**
 * The Overview: the first of the six tabs, and where `/` sends an Admin.
 *
 * Five tiles, two rings drawn on the server, Quick Stats, and one card per
 * relationship. The rates are the prototype's three definitions and are kept
 * apart: the response rate and the meeting rate must never be conflated. They
 * and both rings are over last week, and every one of them says so.
 *
 * The cards are for triage: who needs a call this week. Each is coloured by
 * what it needs and carries the word for it (Pastor feedback, ticket 02): green
 * and *Healthy*, yellow and *Stalled*, red while a Concern is unresolved, grey
 * and *Paused* or *Awaiting acceptance*. The flag line comes from the care items
 * and not the state, so an unresolved Concern still shows, and still colours the
 * card red, on a relationship that has since answered.
 *
 * Pressing any card opens the pair card over the page (Pastor feedback, ticket
 * 07), or for a Group the same card in its group form (ticket 08): this same
 * page at `?card=`, so the address says which card is open, it works without
 * script, and closing it is a link back to `/overview`.
 */

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; done?: string; error?: string }>
}) {
  const query = await searchParams
  // Whatever arrives in the address is whatever somebody typed there: an id or
  // nothing, and the card is read only for a relationship this Admin's own
  // Ministry holds.
  const asked = relationshipIdFrom(query.card)

  // One read: the session verdict, the tab, the Care Needed list and the card
  // come from one document, so the Needs Follow-Up tile, the tab badge, the flag
  // lines on the cards and the card itself are all this one list.
  const page = await getOverviewReader().readOverviewPage(asked)
  if (page.status === 'not-an-admin') return <NotAnAdmin title="Ministry overview" />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { overview, care, card } = page.page

  // Opening the card reads its Concerns, and records the reading as *Read the
  // concern* does. After the read and never instead of it.
  const words = card ? await readTheConcerns(card.concerns, admin) : []
  const now = new Date()
  const outcome = careOutcomeMessage(query.done)
  const refusal = careRefusalMessage(query.error)
  const notice = refusal
    ? { tone: 'refused' as const, said: refusal }
    : outcome
      ? { tone: 'done' as const, said: outcome }
      : null

  const rates = checkInRates(overview.counts)
  const notMet = overview.counts.answered - overview.counts.held
  const rated = ratedTotal(overview.counts)

  const tiles = [
    {
      label: TILES.active.label,
      value: String(overview.active),
      sub: overview.paused > 0 ? TILES.activeWithPaused(overview.paused) : TILES.active.sub,
    },
    { label: TILES.meeting.label, value: `${rates.meeting}%`, sub: TILES.meeting.sub },
    { label: TILES.response.label, value: `${rates.response}%`, sub: TILES.response.sub },
    { label: TILES.thisWeek.label, value: String(overview.completedThisWeek), sub: TILES.thisWeek.sub },
    { label: TILES.followUp.label, value: String(care.length), sub: TILES.followUp.sub },
  ]

  // Quick Stats' *Text-message response rate* row is the same number as its
  // *Response completion* row in the prototype; the duplicate is dropped and
  // five rows are kept. The three rates sit between two headcounts, which are now
  // and not last week, so each rate row says its week rather than the panel.
  const quickStats = [
    ['Total relationships', String(overview.relationships.length + overview.unsurfacedUnaccepted), false],
    ['Response completion', `${rates.response}%`, true],
    ['Meeting rate', `${rates.meeting}%`, true],
    ['Quality rate', `${rates.quality}%`, true],
    ['Active relationships', String(overview.active), false],
  ] as const

  return (
    <AdminShell admin={admin} current="overview" subtitle={OVERVIEW_SUBTITLE} followUpCount={care.length}>
      {/* What a card's action did, said here once the card it came from has
          gone: the relationship ended, and there is no card to say it on. */}
      {notice && !card ? (
        <p className={notice.tone === 'refused' ? 'toast error' : 'toast'} role={notice.tone === 'refused' ? 'alert' : 'status'}>
          {notice.said}
        </p>
      ) : null}
      <ul className="stats">
        {tiles.map((tile) => (
          <li key={tile.label} className="stat">
            <div className="stat-label">{tile.label}</div>
            <div className="stat-value">{tile.value}</div>
            <div className="stat-sub">{tile.sub}</div>
          </li>
        ))}
      </ul>

      <div className="charts">
        <div className="card">
          <div className="chart-head">
            <h2 className="card-title">{MEETING_COMPLETION}</h2>
            <span className="muted">{LAST_WEEK}</span>
          </div>
          <Donut
            title={MEETING_COMPLETION}
            figure={`${rates.meeting}%`}
            emptyLabel={NO_CHECK_INS_LAST_WEEK}
            segments={[
              { label: 'Met', value: overview.counts.held, colour: 'var(--green-fit)' },
              { label: 'Did not meet', value: notMet, colour: 'var(--red-concern)' },
            ]}
          />
        </div>
        <div className="card">
          <div className="chart-head">
            <h2 className="card-title">{CHECK_IN_RATINGS}</h2>
            <span className="muted">{LAST_WEEK}</span>
          </div>
          <Donut
            title={CHECK_IN_RATINGS}
            figure={rated === 0 ? '0' : `${overview.counts.rated.outstanding}/${rated}`}
            emptyLabel={NO_CHECK_INS_LAST_WEEK}
            segments={[
              { label: 'Outstanding (A)', value: overview.counts.rated.outstanding, colour: 'var(--green-fit)' },
              { label: 'Good (B)', value: overview.counts.rated.good, colour: 'var(--light-green-fit)' },
              { label: 'Okay (C)', value: overview.counts.rated.okay, colour: 'var(--yellow-fit)' },
              { label: 'Concern (D)', value: overview.counts.rated.concern, colour: 'var(--red-concern)' },
            ]}
          />
        </div>
        <div className="card">
          <h2 className="card-title">{QUICK_STATS}</h2>
          <dl>
            {quickStats.map(([label, value, lastWeek]) => (
              <div key={label} className="qs-row">
                <dt>
                  {label}
                  {lastWeek ? <span className="muted">{` · ${LAST_WEEK.toLowerCase()}`}</span> : null}
                </dt>
                <dd className="qs-val">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{ALL_RELATIONSHIPS}</h2>
          <span className="muted">{relationshipCount(overview.active, overview.unsurfacedUnaccepted)}</span>
        </div>
        {overview.relationships.length === 0 ? (
          <p className="empty">{NO_RELATIONSHIPS}</p>
        ) : (
          <div className="rel-grid">
            {overview.relationships.map((relationship) => {
              const { flags, tone } = flagsFor(relationship.relationshipId, care)
              const pill = cardPill(relationship)
              const className = `rel-card need-${needOf(relationship)}`
              const body = (
                <>
                  <div className="rel-leader">
                    {relationship.leaderNames.join(', ') || 'Nobody leading'}
                    {pill ? (
                      <>
                        {' '}
                        <span className={`pill ${pill.state}`}>{pill.label}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="rel-people">{withPeople(relationship.participantNames)}</div>
                  {flags.length > 0 ? (
                    <div className={`rel-reason ${tone}`}>{flags.join(' · ')}</div>
                  ) : null}
                </>
              )
              // No prefetch: opening a card reads its Concern and records the
              // reading, which only an Admin's press may do.
              return (
                <Link
                  key={relationship.relationshipId}
                  id={`rel-${relationship.relationshipId}`}
                  className={className}
                  href={`/overview?card=${relationship.relationshipId}`}
                  scroll={false}
                  prefetch={false}
                >
                  {body}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {card ? (
        <PairCard
          card={card}
          words={words}
          now={now}
          // Back to the card it was opened from: without script the browser
          // scrolls there, and with it the page has not moved.
          close={`/overview#rel-${card.relationshipId}`}
          back={`/overview?card=${card.relationshipId}`}
          notice={notice}
        />
      ) : null}
    </AdminShell>
  )
}
