import { NextResponse, type NextRequest } from 'next/server'
import { getForgotPassword } from '~/service/container'

export const dynamic = 'force-dynamic'

/**
 * The press that spends a reset link (Exponential launch, ticket 22). An ordinary form
 * POST, so it works before JavaScript has loaded. It does not sign anybody in: the page
 * goes to `/login` with the notice a change of password gets, and a session this browser
 * held has ended with all the others (ADR-0016), and is replaced at the sign-in.
 *
 * A refused password comes back with a code, and the link stays live. A dead link comes
 * back with none, because the page reads that from the link itself.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const form = await request.formData().catch(() => null)
  const typed = form?.get('password')

  const outcome = await getForgotPassword().choose({
    token,
    password: typeof typed === 'string' ? typed : '',
  })

  if ('refusal' in outcome) {
    const query = outcome.refusal === 'forgot.link_dead' ? '' : `?error=${outcome.refusal}`
    return NextResponse.redirect(new URL(`/login/forgot/${encodeURIComponent(token)}${query}`, request.url), {
      status: 303,
    })
  }

  return NextResponse.redirect(new URL('/login?notice=password-changed', request.url), { status: 303 })
}
