import { NextResponse, type NextRequest } from 'next/server'
import { InvitationRefused } from '~/domain/errors'
import { invitationToken } from '~/domain/invitations'
import { getCommandService, getInvitationReader } from '~/service/container'

/**
 * **Yes, decline.** Her invitation is withdrawn and her unaccepted leader
 * membership ended, the Admin is told on Follow-Up, and nobody else is told
 * anything: she is sent no text, and neither is anybody in the relationship
 * (Manual pairing, recut ticket 06; decided by James on 2026-09-21).
 *
 * It redirects to the link itself and carries nothing in the query string. What
 * a declined link says is drawn from the invitation, so the page she lands on is
 * the page the link opens from now on.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const back = (code?: string) =>
    NextResponse.redirect(
      new URL(`/invitation/${token}${code ? `?error=${code}` : ''}`, request.url),
      { status: 303 },
    )

  const invitation = await getInvitationReader().readInvitationPage(token)
  if (!invitation) return back('invitation.not_found')

  try {
    await getCommandService().execute({
      type: 'invitation.decline',
      ministryId: invitation.ministryId,
      token: invitationToken(token),
    })
  } catch (error) {
    // Pressed twice, or pressed on a tab left open since she accepted on another.
    // A second decline lands on the page a declined link opens, which is true.
    if (error instanceof InvitationRefused) {
      return back(error.refusal === 'invitation.declined' ? undefined : error.refusal)
    }
    throw error
  }

  return back()
}
