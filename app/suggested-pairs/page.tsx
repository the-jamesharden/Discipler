import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveAdmin } from '~/platform/supabase/current-admin'
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
  const resolution = await resolveAdmin()
  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={SUGGESTED_PAIRS} />
  if (resolution.status === 'signed-out') redirect('/login')

  return (
    <AdminShell admin={resolution.admin} current="suggested-pairs">
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{SUGGESTED_PAIRS}</h2>
          <span className="muted">{ONE_TO_ONE_ONLY}</span>
        </div>
        <div className="empty">
          <p>{NO_SUGGESTIONS}</p>
          <p className="muted">{NOT_AVAILABLE_YET}</p>
          <p style={{ marginTop: '1rem' }}>
            <Link className="btn sec" href="/roster/pair">
              Pair manually
            </Link>
          </p>
        </div>
      </div>
    </AdminShell>
  )
}
