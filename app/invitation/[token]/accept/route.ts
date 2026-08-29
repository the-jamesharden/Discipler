import { NextResponse, type NextRequest } from 'next/server'
import { InvitationRefused } from '~/domain/errors'
import { invitationToken } from '~/domain/invitations'
import { supabaseLeaderAccounts } from '~/platform/supabase/leader-accounts'
import { getCommandService, getInvitationReader } from '~/service/container'

/**
 * An ordinary form POST, so acceptance works before JavaScript has loaded. There
 * is no session and none is consulted: possession of the phone the link was sent
 * to is the whole of the authentication.
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
  if (invitation.state !== 'live') return back(`invitation.${invitation.state === 'expired' ? 'expired' : 'already_used'}`)
  if (invitation.role !== 'leader') return back('invitation.not_a_leader')

  const form = await request.formData()
  const fullName = String(form.get('fullName') ?? '').trim()
  const password = String(form.get('password') ?? '')

  // A name is the one thing this form actually asks for. The number was
  // displayed, not requested, so there is nothing else here to get wrong.
  if (!fullName) return back('invitation.not_found')

  // The number on file, never one that was typed. A Leader cannot mistype their
  // way out of their own check-ins, and a forwarded link cannot re-point an
  // account at somebody else's phone.
  const account = await supabaseLeaderAccounts.create(invitation.phone, password)
  if ('refusal' in account) return back(account.refusal)

  try {
    await getCommandService().execute({
      type: 'relationship.accept',
      ministryId: invitation.ministryId,
      token: invitationToken(token),
      fullName,
      userId: account.userId,
    })
  } catch (error) {
    // The account now exists and the acceptance did not land. That is recoverable
    // -- the same number, the same password, the same link -- and it is not
    // dressed up as something the Leader did wrong.
    if (error instanceof InvitationRefused) return back(error.refusal)
    throw error
  }

  // Back to the same link, which is now spent. The page reads that as "you have
  // an account" rather than as a failure, and `done` is what makes it say so in
  // the present tense the first time.
  return NextResponse.redirect(new URL(`/invitation/${token}?done=accepted`, request.url), {
    status: 303,
  })
}
