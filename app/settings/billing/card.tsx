import Link from 'next/link'
import { Suspense } from 'react'
import type { SignedInAdmin } from '~/service/ports'
import { BILLING, settingsLine } from './copy'
import { readPicture } from './read'

/**
 * The Billing card, first in Settings (Exponential launch, ticket 33). Its line comes from
 * Stripe, so it streams in: a slow Stripe never holds Settings up, and a missing one leaves
 * the way to Billing standing. A church billed outside Stripe sees no card at all.
 */

/** The line with what follows its last ` · `, the payment method, kept in one piece. */
export const SettingsLineWords = ({ line }: { readonly line: string }) => {
  const last = line.lastIndexOf(' · ')
  if (last === -1) return <p>{line}</p>
  const method = last + ' · '.length
  return (
    <p>
      {line.slice(0, method)}
      <span className="unbroken">{line.slice(method)}</span>
    </p>
  )
}

const Line = async ({ admin, timeZone }: { readonly admin: SignedInAdmin; readonly timeZone: string }) => {
  if (admin.billing.standing === 'ended') return <p>{BILLING.banner.ended}</p>
  const read = await readPicture(admin.ministryId, new Date())
  if (read === 'unreachable') return <p>{BILLING.lede(admin.ministryName)}</p>
  return read ? <SettingsLineWords line={settingsLine(read.picture, timeZone)} /> : <p>{BILLING.noSubscription}</p>
}

export const BillingCard = ({ admin, timeZone }: { readonly admin: SignedInAdmin; readonly timeZone: string }) => {
  if (admin.billing.standing === 'outside_stripe') return null
  return (
    <div className="card bill-card" id="billing">
      <div>
        <h2 className="card-title">{BILLING.title}</h2>
        <Suspense fallback={<p>{BILLING.lede(admin.ministryName)}</p>}>
          <Line admin={admin} timeZone={timeZone} />
        </Suspense>
      </div>
      <Link className="btn small sec" href="/settings/billing">
        {BILLING.open}
      </Link>
    </div>
  )
}
