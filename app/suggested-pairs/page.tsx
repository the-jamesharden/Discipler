import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SuggestedPair, SuggestedPerson } from '~/domain/suggestions'
import { getSuggestedPairsReader } from '~/service/container'
import { pairPopupHref } from '../roster/lists'
import { AdminShell, NotAnAdmin, shortDate } from '../shell'
import {
  CREATE_RELATIONSHIP,
  IS_LED,
  LEADS,
  NO_SCHEDULE_OVERLAP,
  NO_SCHEDULE_OVERLAP_NOTE,
  NO_SUGGESTIONS,
  ONE_TO_ONE_ONLY,
  PAIR,
  SUGGESTED_PAIRS,
  TIER_LABEL,
  intakeOn,
} from './copy'

export const dynamic = 'force-dynamic'

/** `Discipler · 25-34 · Career and calling`, the line under a name on a card. */
const roleLine = (role: string, person: SuggestedPerson): string =>
  [role, person.ageBand, person.goal].filter((part) => part !== null).join(' · ')

/**
 * Accepting a suggestion opens the Pair popup from the Discipler with the Disciple
 * already ticked (`.scratch/manual-pairing/spec.md`): the Admin still forms the
 * relationship there, with its Material, so a suggestion never pairs anybody by
 * itself. It opens on *Disciples somebody*, the side the suggestion puts them on,
 * whatever the preset would say (Roles per pairing, ticket 01).
 */
const acceptHref = (pair: SuggestedPair): string =>
  `${pairPopupHref(pair.leader.personId, 'discipler')}&${new URLSearchParams({
    with: pair.participant.personId,
  })}`

/**
 * The Suggested Pairs tab: one-to-one suggestions, each with one of three labels and
 * the one sentence that explains it, and below them the people nobody's schedule
 * meets. Ranked on every load from the Roster as it stands, so a pairing made a
 * moment ago has already changed the list.
 */
export default async function SuggestedPairsPage() {
  const page = await getSuggestedPairsReader().readSuggestedPairsPage()
  if (page.status === 'not-an-admin') return <NotAnAdmin title={SUGGESTED_PAIRS} />
  if (page.status === 'signed-out') redirect('/login')

  const { pairs, noScheduleOverlap } = page.page.suggestions

  return (
    <AdminShell admin={page.admin} current="suggested-pairs" followUpCount={page.page.followUpCount}>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{SUGGESTED_PAIRS}</h2>
          <span className="muted">{ONE_TO_ONE_ONLY}</span>
        </div>

        {pairs.length === 0 ? (
          <div className="empty">
            <p>{NO_SUGGESTIONS}</p>
          </div>
        ) : (
          pairs.map((pair) => (
            <div className="sug" key={pair.participant.personId}>
              {/* A label and no number, anywhere on the card. */}
              <span className={`tier ${pair.tier}`}>{TIER_LABEL[pair.tier]}</span>
              <div className="sug-names">
                <div>
                  <span className="sug-name">{pair.leader.fullName}</span>
                  <span className="sug-role">{roleLine(LEADS, pair.leader)}</span>
                </div>
                <span className="sug-arrow" aria-hidden="true">→</span>
                <div>
                  <span className="sug-name">{pair.participant.fullName}</span>
                  <span className="sug-role">{roleLine(IS_LED, pair.participant)}</span>
                </div>
              </div>
              <div className="sug-reason">{pair.reason}</div>
              <Link className="btn" href={acceptHref(pair)}>
                {CREATE_RELATIONSHIP}
              </Link>
            </div>
          ))
        )}

        {noScheduleOverlap.length > 0 && (
          <div className="nso">
            <h3 className="card-title">{NO_SCHEDULE_OVERLAP}</h3>
            <p className="muted">{NO_SCHEDULE_OVERLAP_NOTE}</p>
            {noScheduleOverlap.map((person) => (
              <div className="nso-row" key={person.personId}>
                <div>
                  <div className="nso-name">{person.fullName}</div>
                  <div className="muted">
                    {[person.ageBand, person.goal, intakeOn(shortDate(person.intakeSubmittedAt))]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </div>
                </div>
                {/* Their own popup, on *Is discipled* whatever the preset would say of
                    them (Roles per pairing, ticket 01): they are here as somebody to be
                    discipled. */}
                <Link className="btn sec" href={pairPopupHref(person.personId, 'disciple')}>
                  {PAIR}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
