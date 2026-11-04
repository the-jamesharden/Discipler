import { after, NextResponse, type NextRequest } from 'next/server'
import { getForgotPassword } from '~/service/container'
import type { ForgotPasswordRefusal } from '~/service/forgot-password'
import { networkOf } from '../../../auth/network'
import { FORGOT_REFUSALS } from '../copy'

export const dynamic = 'force-dynamic'

const STATUS: Record<ForgotPasswordRefusal, number> = {
  'forgot.not_human': 403,
  'forgot.bad_email': 422,
}

const fieldOf = (form: FormData | null, name: string): string => {
  const value = form?.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * **Send me the link** (Exponential launch, ticket 22). Takes the form fields `email` and
 * `humanToken`, and answers `{ sent: true, email }` whether or not the address has an
 * account. A refusal is `{ refusal, message }`, about the form or the human check and
 * never about an account.
 *
 * The email goes after the response, every time, so how long this takes cannot say
 * whether one was owed. An `after` that has nothing to do costs nothing.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)

  const outcome = await getForgotPassword().ask({
    email: fieldOf(form, 'email'),
    humanToken: fieldOf(form, 'humanToken'),
    network: networkOf(request.headers),
  })

  if ('refusal' in outcome) {
    return NextResponse.json(
      { refusal: outcome.refusal, message: FORGOT_REFUSALS[outcome.refusal] },
      { status: STATUS[outcome.refusal] },
    )
  }

  after(outcome.deliver)
  return NextResponse.json({ sent: true, email: outcome.sent })
}
