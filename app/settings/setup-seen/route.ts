import { NextResponse, type NextRequest } from 'next/server'
import { readSeenSteps } from '~/domain/setup-meter'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * What the setup meter has now played for this Admin (Exponential launch, ticket 26),
 * so each step's confetti and the badge play once for each Admin.
 *
 * Under `/settings` so that it is no new top-level name. The bar posts here itself
 * and says `stay`, so nothing is redrawn. The one thing that arrives with no script is
 * the badge's "Thank you!", which goes to the Overview with the bar gone.
 *
 * Who it is about comes from the session and never from the form, and all a form can
 * say is which of the seven steps this Admin has watched, on their own row.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const admin = await currentAdmin()

  if (admin) {
    const steps = form.get('steps')
    await getCommandService().execute({
      type: 'setup.mark_seen',
      ministryId: admin.ministryId,
      seenBy: admin.userId,
      steps: readSeenSteps(typeof steps === 'string' ? steps : null),
      badge: form.get('badge') !== null,
    })
  }

  return form.get('stay') !== null
    ? new NextResponse(null, { status: 204 })
    : NextResponse.redirect(new URL('/overview', request.url), { status: 303 })
}
