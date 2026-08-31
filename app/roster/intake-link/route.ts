import { NextResponse, type NextRequest } from 'next/server'
import { personId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * Issuing a Person the link that reopens their own Intake, prefilled.
 *
 * It sends nothing. The Admin is shown the link and passes it on themselves, which
 * is what the act is for: the commonest reason to reopen somebody's Intake is that
 * the number Discipler holds for them is wrong, and texting the link to that number
 * would reach whoever actually holds it.
 *
 * The redirect names the Person and never the token. The Roster reads the live link
 * back under the Admin's own session, so the credential does not travel through a
 * query string into browser history and server logs.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const form = await request.formData()
  const person = form.get('personId')

  if (typeof person !== 'string' || person === '') {
    return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
  }

  await getCommandService().execute({
    type: 'intake.reopen',
    ministryId: admin.ministryId,
    personId: personId(person),
  })

  return NextResponse.redirect(
    new URL(`/roster?${new URLSearchParams({ intakeLinkFor: person })}`, request.url),
    { status: 303 },
  )
}
