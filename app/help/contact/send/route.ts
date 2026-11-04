import { NextResponse, type NextRequest } from 'next/server'
import type { SupportFormRefusal } from '~/domain/support-form'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getSupportForm } from '~/service/container'
import { networkOf } from '../../../auth/network'
import { SUPPORT_REFUSALS } from '../copy'

export const dynamic = 'force-dynamic'

/**
 * **Send**, on the support form (Exponential launch, ticket 25). Takes the form fields
 * `kind`, `message`, `email` and `page`, and `token` from Turnstile when nobody is
 * signed in, and answers JSON for a page that stays on screen: `{ sent: true }`, or
 * `{ refusal, message }` with the status saying what kind of no it is.
 *
 * Who is sending, and for which church, comes from the session and never the form. A
 * cross-site post carries no session, because the cookie is SameSite=Lax, so it is a
 * signed-out one and has to pass the human check. The browser comes from the request's
 * own header.
 */

const STATUS: Readonly<Record<SupportFormRefusal, number>> = {
  'support.bad_kind': 422,
  'support.no_message': 422,
  'support.message_too_long': 422,
  'support.bad_email': 422,
  'support.not_human': 403,
  'support.too_many': 429,
}

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  const form = await request.formData().catch(() => null)

  const field = (name: string): string => {
    const value = form?.get(name)
    return typeof value === 'string' ? value : ''
  }

  const typed = {
    kind: field('kind'),
    message: field('message'),
    email: field('email'),
    page: field('page'),
    browser: request.headers.get('user-agent'),
  }

  const answer = admin
    ? await getSupportForm().fromAChurch({
        ...typed,
        ministryId: admin.ministryId,
        churchName: admin.ministryName,
        submittedBy: admin.userId,
      })
    : await getSupportForm().signedOut({
        ...typed,
        humanToken: field('token'),
        network: networkOf(request.headers),
      })

  return 'sent' in answer
    ? NextResponse.json({ sent: true })
    : NextResponse.json(
        { refusal: answer.refusal, message: SUPPORT_REFUSALS[answer.refusal] },
        { status: STATUS[answer.refusal] },
      )
}
