import { NextResponse, type NextRequest } from 'next/server'
import { InvitationRefused } from '~/domain/errors'
import { invitationToken } from '~/domain/invitations'
import { getCommandService, getInvitationReader } from '~/service/container'

/**
 * A Participant saying the match is not right, without having to have a
 * conversation about it. It raises an item and changes nothing else: unpairing is
 * a pastoral decision and stays with the Admin.
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

  try {
    await getCommandService().execute({
      type: 'match.decline',
      ministryId: invitation.ministryId,
      token: invitationToken(token),
    })
  } catch (error) {
    if (error instanceof InvitationRefused) return back(`error=${error.refusal}`)
    throw error
  }

  return back('done=declined')
}
