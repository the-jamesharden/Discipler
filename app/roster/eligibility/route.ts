import { NextResponse, type NextRequest } from 'next/server'
import { personId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An ordinary form POST, like the import and the pairing, so the control works
 * before JavaScript has loaded.
 *
 * One route for both directions. Marking somebody eligible and withdrawing it are
 * the same fact with the other answer -- there is no second act to give its own
 * endpoint, and a pair of them would be two places for the rule to live.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const form = await request.formData()
  const person = form.get('personId')
  const eligible = form.get('eligible')

  // A submission with no Person is not a refusal an Admin can act on -- it is a form
  // that did not come from the Roster -- so it goes back to the Roster unchanged
  // rather than reaching the boundary as a command about nobody.
  if (typeof person !== 'string' || person === '') {
    return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
  }

  await getCommandService().execute({
    type: 'person.set_lead_eligibility',
    ministryId: admin.ministryId,
    personId: personId(person),
    // Read as a positive answer rather than as *anything but no*. The form sends
    // the value it wants set, and a field that arrived mangled must not read as a
    // Ministry's leader pool quietly growing.
    eligible: eligible === 'yes',
  })

  return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
}
