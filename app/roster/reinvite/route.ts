import { NextResponse, type NextRequest } from 'next/server'
import { personId, relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * Sending a Leader their Invitation Link again.
 *
 * Unlike the Intake link beside it, this one *sends*. The Admin is not shown the
 * token and does not pass it on: an Invitation Link is individualised and arrives
 * by text at the number on the Roster, and handing it to an Admin to forward would
 * make a link that authenticates by possession of a phone reachable by anybody the
 * Admin forwards it to.
 *
 * The command decides whether anything happens. A relationship that has since been
 * accepted, a Leader who has since agreed, and a Ministry this Admin does not
 * belong to all reach it and produce nothing -- the screen the Admin clicked from
 * was true when it rendered, and losing that race is not an error to report.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const form = await request.formData()
  const relationship = form.get('relationshipId')
  const person = form.get('personId')

  if (
    typeof relationship !== 'string'
    || relationship === ''
    || typeof person !== 'string'
    || person === ''
  ) {
    return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
  }

  const { effects } = await getCommandService().execute({
    type: 'invitation.reissue',
    // From the session and never from the form. The relationship id is whatever was
    // posted; what stops it naming another Ministry's relationship is that the
    // command is scoped to this Admin's Ministry and the snapshot it reads holds
    // nothing outside it.
    ministryId: admin.ministryId,
    relationshipId: relationshipId(relationship),
    personId: personId(person),
  })

  // The receipt is claimed from what actually happened, never from having asked.
  // Every no-op path above leaves the Leader on the Roster under their own name, so
  // a redirect that confirmed on reaching this line would tell an Admin a text went
  // out to somebody whose row has no phone number on it, or whose relationship was
  // accepted while they were clicking.
  const sent = effects.some((effect) => effect.kind === 'message.enqueue')

  return NextResponse.redirect(
    new URL(sent ? `/roster?${new URLSearchParams({ reinvited: person })}` : '/roster', request.url),
    { status: 303 },
  )
}
