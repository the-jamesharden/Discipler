import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getCheckInsReader } from '~/service/container'
import type { CheckInThisWeek } from '~/service/ports'
import { AdminShell, NotAnAdmin, shortDate } from '../shell'
import {
  checkInLine,
  COMPLETED,
  CONCERN_COLUMN,
  CONCERN_TEXT_NOT_HERE,
  CONCERNS,
  concernsRaised,
  GO_TO_FOLLOW_UP,
  GOOD_COLUMN,
  NO_OPEN_CONCERNS,
  NOTHING_YET,
  OUTSTANDING_COLUMN,
  PENDING,
  sentOn,
  THIS_WEEKS_CHECK_INS,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * The Check-Ins tab: this ISO week's relationship-weeks, in the Ministry's own
 * timezone. Three counts, the date the week's asking began, and three columns.
 *
 * Outstanding and Good list each answered relationship with the date answered.
 * Concern is a sealed count with a note that the words are not listed here and a
 * link to Follow-Up. Nothing on this page reads Concern text; that stays a
 * recorded act on its own page.
 */

const Column = ({ checkIns }: { readonly checkIns: readonly CheckInThisWeek[] }) =>
  checkIns.length === 0 ? (
    <p className="empty">{NOTHING_YET}</p>
  ) : (
    <ul className="ci-list">
      {checkIns.map((checkIn) => (
        <li key={checkIn.relationshipId} className="ci-card">
          <div>{checkInLine(checkIn.leaderNames, checkIn.participantNames)}</div>
          {checkIn.answeredAt ? <div className="ci-when">{shortDate(checkIn.answeredAt)}</div> : null}
        </li>
      ))}
    </ul>
  )

export default async function CheckInsPage() {
  const resolution = await resolveAdmin()
  if (resolution.status === 'not-an-admin') return <NotAnAdmin title="Check-Ins" />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const week = await getCheckInsReader().readThisWeeksCheckIns(admin.ministryId)

  const answered = week.checkIns.filter((checkIn) => checkIn.answeredAt !== null)
  const pending = week.checkIns.length - answered.length
  const outstanding = answered.filter((checkIn) => checkIn.satisfaction === 'outstanding')
  const good = answered.filter((checkIn) => checkIn.satisfaction === 'good')
  const concern = answered.filter((checkIn) => checkIn.satisfaction === 'concern')
  const openConcerns = concern.filter((checkIn) => checkIn.concernOpen).length

  return (
    <AdminShell admin={admin} current="check-ins">
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{THIS_WEEKS_CHECK_INS}</h2>
          <span className="muted">{sentOn(week.sentAt ? shortDate(week.sentAt) : null)}</span>
        </div>

        <ul className="ci-stats">
          <li className="ci-stat">
            <div className="ci-stat-val">{answered.length}</div>
            <div className="muted">{COMPLETED}</div>
          </li>
          <li className="ci-stat">
            <div className="ci-stat-val pending">{pending}</div>
            <div className="muted">{PENDING}</div>
          </li>
          <li className="ci-stat">
            <div className="ci-stat-val concern">{openConcerns}</div>
            <div className="muted">{CONCERNS}</div>
          </li>
        </ul>

        <div className="ci-cols">
          <div>
            <div className="ci-col-head a">
              <span>{OUTSTANDING_COLUMN}</span>
              <span>{outstanding.length}</span>
            </div>
            <Column checkIns={outstanding} />
          </div>
          <div>
            <div className="ci-col-head b">
              <span>{GOOD_COLUMN}</span>
              <span>{good.length}</span>
            </div>
            <Column checkIns={good} />
          </div>
          <div>
            <div className="ci-col-head c">
              <span>{CONCERN_COLUMN}</span>
              <span>{concern.length}</span>
            </div>
            {/* Sealed: the count and nothing else. An Admin reaches Concern text
                one Person at a time, from Follow-Up, where reading it is recorded. */}
            <div className="sealed">
              {openConcerns > 0 ? (
                <>
                  <div className="sealed-count">{openConcerns}</div>
                  <div className="sealed-label">{concernsRaised(openConcerns)}</div>
                  <p className="sealed-note">{CONCERN_TEXT_NOT_HERE}</p>
                  <Link className="btn sec" href="/follow-up">
                    {GO_TO_FOLLOW_UP}
                  </Link>
                </>
              ) : (
                <div className="sealed-label">{NO_OPEN_CONCERNS}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
