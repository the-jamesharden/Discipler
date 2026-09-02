import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkInRates, ratedTotal } from '~/domain/overview'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getCareNeededReader, getOverviewReader } from '~/service/container'
import type { CareNeededItem, OverviewRelationship } from '~/service/ports'
import { AdminShell, NotAnAdmin } from '../shell'
import {
  ALL_RELATIONSHIPS,
  CHECK_IN_RATINGS,
  MEETING_COMPLETION,
  NO_CHECK_INS_YET,
  NO_RELATIONSHIPS,
  OVERVIEW_SUBTITLE,
  QUICK_STATS,
  relationshipCount,
  shortConcern,
  shortFollowUp,
  shortReason,
  statePill,
  TILES,
  withPeople,
} from './copy'
import { Donut } from './donut'

export const dynamic = 'force-dynamic'

/**
 * The Overview: the first of the six tabs, and where `/` sends an Admin.
 *
 * Five tiles, two rings drawn on the server, Quick Stats, and one card per
 * relationship. The rates are the prototype's three definitions and are kept
 * apart: the response rate and the meeting rate must never be conflated.
 *
 * The cards are for triage: who needs a call this week. A pill only when the
 * state is worth naming, so Healthy shows nothing; the flag line comes from the
 * care items and not the state, so an unresolved Concern still shows on a
 * relationship that has since answered. Each card links to the relationship's
 * Follow-Up item where one exists, because there is no relationship detail page.
 */

/** The care items about one relationship, as the short words a card carries. */
const flagsFor = (
  relationship: OverviewRelationship,
  care: readonly CareNeededItem[],
): { readonly flags: readonly string[]; readonly tone: 'needscare' | 'stalled' | 'review' } => {
  const mine = care.filter(
    (item) =>
      (item.source === 'follow_up' ? item.relationshipId : item.relationshipId)
      === relationship.relationshipId,
  )
  const flags = mine
    .map((item) =>
      item.source === 'follow_up'
        ? shortFollowUp[item.payload.kind](item.waitedDays)
        : item.source === 'relationship'
          ? item.reasons.map(shortReason).join(' · ')
          : shortConcern(item.concerns.length),
    )
    // A Needs Care relationship carries no reason of its own; its Concern is the
    // flag, and it is on the list as a badge already.
    .filter((flag) => flag !== '')
  const tone = mine.some((item) => item.source === 'concern')
    ? 'needscare'
    : mine.some((item) => item.source === 'relationship')
      ? 'stalled'
      : 'review'
  return { flags, tone }
}

export default async function OverviewPage() {
  const resolution = await resolveAdmin()
  if (resolution.status === 'not-an-admin') return <NotAnAdmin title="Ministry overview" />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const [overview, care] = await Promise.all([
    getOverviewReader().readOverview(admin.ministryId),
    // Read once and shared: the Needs Follow-Up tile, the tab badge and the flag
    // lines on the cards are all this one list.
    getCareNeededReader().listCareNeeded(admin.ministryId),
  ])

  const rates = checkInRates(overview.counts)
  const notMet = overview.counts.answered - overview.counts.held
  const rated = ratedTotal(overview.counts)
  const flagged = new Set(
    care.flatMap((item) => (item.relationshipId ? [item.relationshipId] : [])),
  )

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
  // five rows are kept.
  const quickStats = [
    ['Total relationships', String(overview.relationships.length + overview.unsurfacedUnaccepted)],
    ['Response completion', `${rates.response}%`],
    ['Meeting rate', `${rates.meeting}%`],
    ['Quality rate', `${rates.quality}%`],
    ['Active relationships', String(overview.active)],
  ] as const

  return (
    <AdminShell admin={admin} current="overview" subtitle={OVERVIEW_SUBTITLE} followUpCount={care.length}>
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
          <h2 className="card-title">{MEETING_COMPLETION}</h2>
          <Donut
            title={MEETING_COMPLETION}
            centre={`${rates.meeting}%`}
            emptyLabel={NO_CHECK_INS_YET}
            segments={[
              { label: 'Met', value: overview.counts.held, colour: 'var(--green-fit)' },
              { label: 'Did not meet', value: notMet, colour: 'var(--red-concern)' },
            ]}
          />
        </div>
        <div className="card">
          <h2 className="card-title">{CHECK_IN_RATINGS}</h2>
          <Donut
            title={CHECK_IN_RATINGS}
            centre={rated === 0 ? '0' : `${overview.counts.rated.outstanding}/${rated}`}
            emptyLabel={NO_CHECK_INS_YET}
            segments={[
              { label: 'Outstanding (A)', value: overview.counts.rated.outstanding, colour: 'var(--green-fit)' },
              { label: 'Good (B)', value: overview.counts.rated.good, colour: 'var(--yellow-fit)' },
              { label: 'Concern (C)', value: overview.counts.rated.concern, colour: 'var(--red-concern)' },
            ]}
          />
        </div>
        <div className="card">
          <h2 className="card-title">{QUICK_STATS}</h2>
          <dl>
            {quickStats.map(([label, value]) => (
              <div key={label} className="qs-row">
                <dt>{label}</dt>
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
              const { flags, tone } = flagsFor(relationship, care)
              const body = (
                <>
                  <div className="rel-leader">
                    {relationship.leaderNames.join(', ') || 'Nobody leading'}
                    {relationship.state !== 'healthy' ? (
                      <>
                        {' '}
                        <span className={`pill ${relationship.state}`}>{statePill[relationship.state]}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="rel-people">{withPeople(relationship.participantNames)}</div>
                  {flags.length > 0 ? (
                    <div className={`rel-reason ${tone}`}>{flags.join(' · ')}</div>
                  ) : null}
                </>
              )
              return flagged.has(relationship.relationshipId) ? (
                <Link
                  key={relationship.relationshipId}
                  className={`rel-card s-${relationship.state}`}
                  href={`/follow-up#relationship-${relationship.relationshipId}`}
                >
                  {body}
                </Link>
              ) : (
                <div key={relationship.relationshipId} className={`rel-card s-${relationship.state}`}>
                  {body}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
