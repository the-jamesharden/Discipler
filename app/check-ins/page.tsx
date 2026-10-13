import Link from 'next/link'
import { redirect } from 'next/navigation'
import { relationshipIdFrom } from '~/domain/ids'
import { getCheckInsReader } from '~/service/container'
import type { CheckInThisWeek } from '~/service/ports'
import { careOutcomeMessage, careRefusalMessage } from '../follow-up/copy'
import { readTheConcerns } from '../pair-card/open'
import { PairCard } from '../pair-card/pair-card'
import { AdminShell, NotAnAdmin, shortDate } from '../shell'
import {
  checkInLine,
  COMPLETED,
  CONCERN_COLUMN,
  CONCERNS,
  GOOD_COLUMN,
  NOTHING_YET,
  OKAY_COLUMN,
  OUTSTANDING_COLUMN,
  PENDING,
  sentOn,
  THIS_WEEKS_CHECK_INS,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * The Check-Ins tab: this ISO week's relationship-weeks, in the Ministry's own
 * timezone. Three counts, the date the week's asking began, and one column per
 * answer the satisfaction question offers: four since it offered A to D (Pastor
 * feedback, ticket 03).
 *
 * Each column lists its relationships with the date answered, D concern as A, B
 * and C do (Pastor feedback, ticket 09): by name, never by the Concern's words.
 * A D whose Concern is still unresolved is marked red. Every row opens the pair
 * card over the tab, or for a Group the same card in its group form, as the
 * Overview's cards do: this same page at `?card=`, so the address says which
 * card is open, it works without script, and closing it is a link back to
 * `/check-ins`. The card opens with this week's answer in its band, and with the
 * Concern's words where that answer raised one; opening it records the reading,
 * exactly as on the Overview.
 *
 * A concern answered to the three-answer question before the change is stored as
 * `concern`, as one answered D is, so it sits in the D column with them.
 */

const Column = ({ checkIns }: { readonly checkIns: readonly CheckInThisWeek[] }) =>
  checkIns.length === 0 ? (
    <p className="empty">{NOTHING_YET}</p>
  ) : (
    <ul className="ci-list">
      {checkIns.map((checkIn) => (
        <li key={checkIn.relationshipId}>
          {/* No prefetch: opening a card reads its Concern and records the
              reading, which only an Admin's press may do. */}
          <Link
            id={`ci-${checkIn.relationshipId}`}
            className={checkIn.concernOpen ? 'ci-card d' : 'ci-card'}
            href={`/check-ins?card=${checkIn.relationshipId}`}
            scroll={false}
            prefetch={false}
          >
            <div>{checkInLine(checkIn.leaderNames, checkIn.participantNames)}</div>
            {checkIn.answeredAt ? <div className="ci-when">{shortDate(checkIn.answeredAt)}</div> : null}
          </Link>
        </li>
      ))}
    </ul>
  )

export default async function CheckInsPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; done?: string; error?: string }>
}) {
  const query = await searchParams
  // Whatever arrives in the address is whatever somebody typed there: an id or
  // nothing, and the card is read only for a relationship this Admin's own
  // Ministry holds.
  const asked = relationshipIdFrom(query.card)

  // One read: the session verdict, the week, the badge's number and the card
  // come from one document.
  const page = await getCheckInsReader().readCheckInsPage(asked)
  if (page.status === 'not-an-admin') return <NotAnAdmin title="Check-Ins" />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { week, followUpCount, card, cardThisWeek } = page.page

  // Opening the card reads its Concerns, and records the reading as *Read the
  // concern* does. After the read and never instead of it.
  const words = card ? await readTheConcerns(card, admin) : []
  const now = new Date()
  const outcome = careOutcomeMessage(query.done)
  const refusal = careRefusalMessage(query.error)
  const notice = refusal
    ? { tone: 'refused' as const, said: refusal }
    : outcome
      ? { tone: 'done' as const, said: outcome }
      : null

  const answered = week.checkIns.filter((checkIn) => checkIn.answeredAt !== null)
  const pending = week.checkIns.length - answered.length
  const outstanding = answered.filter((checkIn) => checkIn.satisfaction === 'outstanding')
  const good = answered.filter((checkIn) => checkIn.satisfaction === 'good')
  const okay = answered.filter((checkIn) => checkIn.satisfaction === 'okay')
  const concern = answered.filter((checkIn) => checkIn.satisfaction === 'concern')
  const openConcerns = concern.filter((checkIn) => checkIn.concernOpen).length

  return (
    <AdminShell admin={admin} current="check-ins" followUpCount={followUpCount}>
      {/* What a card's action did, said here once the card it came from has
          gone: the relationship ended, and there is no card to say it on. */}
      {notice && !card ? (
        <p className={notice.tone === 'refused' ? 'toast error' : 'toast'} role={notice.tone === 'refused' ? 'alert' : 'status'}>
          {notice.said}
        </p>
      ) : null}
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
              <span>{OKAY_COLUMN}</span>
              <span>{okay.length}</span>
            </div>
            <Column checkIns={okay} />
          </div>
          <div>
            <div className="ci-col-head d">
              <span>{CONCERN_COLUMN}</span>
              <span>{concern.length}</span>
            </div>
            <Column checkIns={concern} />
          </div>
        </div>
      </div>

      {card ? (
        <PairCard
          card={card}
          words={words}
          now={now}
          // Back to the row it was opened from: without script the browser
          // scrolls there, and with it the page has not moved.
          close={`/check-ins#ci-${card.relationshipId}`}
          back={`/check-ins?card=${card.relationshipId}`}
          notice={notice}
          thisWeek={cardThisWeek}
        />
      ) : null}
    </AdminShell>
  )
}
