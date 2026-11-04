import { redirect } from 'next/navigation'
import { adminEmailFromToken, resolveAdmin } from '~/platform/supabase/current-admin'
import { Centred } from '../../shell'
import { CREATE_AN_ACCOUNT } from '../copy'
import { SignUpProgress, type SearchParams } from '../parts'
import { holdWhileSignUpIsShut, titleWhileOpen } from '../standing'
import { PAYMENT_PAGE } from './copy'
import { cameBackFailed } from './flow'
import { PaymentForm } from './form'
import { paymentStepOf } from './standing'

export const dynamic = 'force-dynamic'

export const generateMetadata = titleWhileOpen(PAYMENT_PAGE.title)

/**
 * "Add a card or bank account" (Exponential launch, ticket 18; mock-up 1's
 * `s5-checkout.html`), which names no price.
 *
 * For a signed-in Admin of a church that has not paid yet, and it reads what the church
 * chose from the church's own row, so leaving and coming back another day keeps it.
 */
export default async function PaymentPage({ searchParams }: { searchParams: SearchParams }) {
  holdWhileSignUpIsShut()

  const resolution = await resolveAdmin()
  if (resolution.status === 'signed-out') redirect('/login')
  if (resolution.status !== 'admin') redirect('/')

  const signup = await paymentStepOf(resolution.admin)
  if (!signup) redirect('/')

  const { redirect_status: redirectStatus } = await searchParams

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <SignUpProgress step={PAYMENT_PAGE.step} name={PAYMENT_PAGE.stepName} percent={100} />
      <PaymentForm
        cycle={signup.cycle}
        code={signup.carriedCode}
        timeZone={signup.timeZone}
        prefill={{ name: resolution.admin.fullName, email: await adminEmailFromToken() }}
        cameBackFailed={cameBackFailed(redirectStatus)}
      />
    </Centred>
  )
}
