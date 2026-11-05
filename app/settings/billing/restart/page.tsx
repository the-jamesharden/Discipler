import { redirect } from 'next/navigation'
import type { MinistryId } from '~/domain/ids'
import { ACCEPTED_PAYMENT_METHODS } from '~/platform/stripe/trials'
import { getBillingReader, getStripeAccount, stripeIsConfigured } from '~/service/container'
import type { RestartPrices } from '~/service/ports'
import { DAYS, hourLabel } from '../../copy'
import { Centred, NotAnAdmin } from '../../../shell'
import { customerOf } from '../read'
import { RESTART } from '../copy'
import { RestartForm } from './form'

export const dynamic = 'force-dynamic'

export const metadata = { title: RESTART.title }

/** What the page needs before Stripe's frames can draw: the prices, and the method on file. */
const whatStripeNeeds = async (
  church: MinistryId,
): Promise<{ readonly prices: RestartPrices; readonly customerSession: string | null } | null> => {
  if (!stripeIsConfigured()) return null
  try {
    const customerId = await customerOf(church)
    if (!customerId) return null
    const account = getStripeAccount()
    const prices = await account.restartPrices(customerId)
    // Only what lets it offer the card on file: the form works without it.
    const customerSession = await account.customerSessionSecret(customerId).catch((error: unknown) => {
      console.error(`Asking for a customer session failed: ${error instanceof Error ? error.name : 'unknown'}`)
      return null
    })
    return { prices, customerSession }
  } catch (error) {
    console.error(`Reading what a restart costs failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return null
  }
}

/**
 * "Restart Discipler" (Exponential launch, ticket 33; mock-up 5's `restart.html`), in
 * sign-up's card: no second trial and no offer, billed today.
 */
export default async function RestartPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_status?: string }>
}) {
  const resolution = await getBillingReader().readBillingPage()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={RESTART.title} />
  if (resolution.status === 'signed-out') redirect('/login')

  const { admin, page } = resolution
  if (admin.billing.standing === 'outside_stripe') redirect('/settings')
  if (admin.billing.standing !== 'ended') redirect('/settings/billing')

  const needed = await whatStripeNeeds(admin.ministryId)
  const { redirect_status: cameBack } = await searchParams
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

  return (
    <Centred subtitle={admin.ministryName} botanical>
      <h2 className="restart-title">{RESTART.title}</h2>
      <p className="hint restart-lede">
        {RESTART.lede(DAYS.find(({ value }) => value === page.cadence.day)?.label ?? '', hourLabel(page.cadence.hour))}
      </p>
      <RestartForm
        publishableKey={needed && publishableKey ? publishableKey : null}
        customerSession={needed?.customerSession ?? null}
        prices={needed?.prices ?? null}
        paymentMethodTypes={ACCEPTED_PAYMENT_METHODS}
        cameBackFailed={cameBack === 'failed'}
      />
    </Centred>
  )
}
