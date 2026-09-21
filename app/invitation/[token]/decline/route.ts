import { NextResponse, type NextRequest } from 'next/server'
import { getInvitationReader } from '~/service/container'

/**
 * **Decline**, the first of its two steps (Manual pairing, recut ticket 06;
 * decided by James on 2026-09-21). It changes nothing. It is a post only because
 * the button sits in the accept form beside **Accept and start**, and what it
 * answers with is the page asking the one question.
 *
 * The body is never read. The form it arrives from may hold a name and a
 * half-typed password, and somebody saying no is asked for neither.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const back = (query: string) =>
    NextResponse.redirect(new URL(`/invitation/${token}?${query}`, request.url), {
      status: 303,
    })

  const invitation = await getInvitationReader().readInvitationPage(token)
  if (!invitation) return back('error=invitation.not_found')

  // Offered wherever Accept is and nowhere else. A link that has run out or been
  // spent lands on the page that already says so, with nothing asked of it.
  if (invitation.state !== 'live' || invitation.role !== 'leader') {
    return NextResponse.redirect(new URL(`/invitation/${token}`, request.url), { status: 303 })
  }

  return back('decline=ask')
}
