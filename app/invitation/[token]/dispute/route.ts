import { NextResponse, type NextRequest } from 'next/server'
import { InvitationRefused } from '~/domain/errors'
import { invitationToken } from '~/domain/invitations'
import { getCommandService, getInvitationReader } from '~/service/container'

/**
 * *Not my number.* It changes nothing -- the number on file stands, the link is
 * not spent, and a forwarded link can never re-point an account -- and it raises
 * a persistent item, because a wrong number sends that Leader's check-ins to a
 * stranger indefinitely and a notification that scrolls out of view is exactly
 * the failure a Follow-Up Item exists to prevent.
 *
 * It is deliberately reachable on an expired or consumed link. Discovering the
 * number is wrong a fortnight later is the same condition, and the affordance
 * that raises it must not be the thing that has run out.
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
      type: 'invitation.dispute_number',
      ministryId: invitation.ministryId,
      token: invitationToken(token),
    })
  } catch (error) {
    if (error instanceof InvitationRefused) return back(`error=${error.refusal}`)
    throw error
  }

  return back('done=disputed')
}
