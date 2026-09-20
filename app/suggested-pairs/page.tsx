import { redirect } from 'next/navigation'
import { getCareNeededReader } from '~/service/container'
import { AdminShell, NotAnAdmin } from '../shell'
import { NO_SUGGESTIONS, NOT_AVAILABLE_YET, ONE_TO_ONE_ONLY, SUGGESTED_PAIRS } from './copy'

export const dynamic = 'force-dynamic'

/**
 * The Suggested Pairs tab. The page exists and the tab is a link, so that the
 * layout does not change the day ticket 04 ships: the ranking function and its
 * pools are that ticket's, and until it lands this renders the prototype's empty
 * state with a line saying suggestions are not available yet. Nothing here is
 * greyed out.
 */
export default async function SuggestedPairsPage() {
  const page = await getCareNeededReader().readSuggestedPairsPage()
  if (page.status === 'not-an-admin') return <NotAnAdmin title={SUGGESTED_PAIRS} />
  if (page.status === 'signed-out') redirect('/login')

  return (
    <AdminShell admin={page.admin} current="suggested-pairs" followUpCount={page.page.followUpCount}>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{SUGGESTED_PAIRS}</h2>
          <span className="muted">{ONE_TO_ONE_ONLY}</span>
        </div>
        <div className="empty">
          <p>{NO_SUGGESTIONS}</p>
          {/* No button into pairing from here: every pairing starts from a row on
              the Roster (Manual pairing, ticket 07), which is what the line below
              already tells an Admin to do. */}
          <p className="muted">{NOT_AVAILABLE_YET}</p>
        </div>
      </div>
    </AdminShell>
  )
}
