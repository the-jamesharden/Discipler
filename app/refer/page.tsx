import { redirect } from 'next/navigation'
import { referralLinkShown } from '~/domain/referrals'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { getReferReader } from '~/service/container'
import { AdminShell, NotAnAdmin } from '../shell'
import { GiftOpen } from '../icons'
import { REFER } from './copy'
import { YourLink } from './your-link'

export const dynamic = 'force-dynamic'

/**
 * The Refer page (Exponential launch, ticket 32), reached from the header's "Refer a
 * church". There is no text box, no email draft and no list of invited churches, and
 * Discipler sends no invitations: all it hands out is the link and a note to go with it.
 *
 * The page's document holds the code and nothing about any church the code ever brought,
 * so nothing here could show one.
 */
export default async function ReferPage() {
  const resolution = await getReferReader().readReferPage()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={REFER.title} />
  if (resolution.status === 'signed-out') redirect('/login')

  const { admin, page } = resolution

  return (
    <AdminShell admin={admin} current={null} followUpCount={page.followUpCount}>
      <div className="page-head">
        <div>
          <h1>
            <GiftOpen />
            {REFER.title}
          </h1>
          <p className="lede">{REFER.lede}</p>
        </div>
      </div>

      <div className="offer-hero">
        <p className="big">
          {REFER.offer[0]}
          <br />
          {REFER.offer[1]}
        </p>
        <p>{REFER.offerLine}</p>
      </div>

      <ol className="how">
        {REFER.steps.map((step, index) => (
          <li key={step}>
            <b>{index + 1}</b>
            {step}
          </li>
        ))}
      </ol>

      <div className="card">
        <h2 className="card-title refer-link-title">{REFER.yourLink}</h2>
        <YourLink church={admin.ministryName} initialLink={referralLinkShown(appBaseUrl(), page.code)} />
        <p className="refer-fine">{REFER.fine}</p>
      </div>
    </AdminShell>
  )
}
