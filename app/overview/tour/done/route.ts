import { NextResponse, type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { RESTART_ONBOARDING } from '../../onboarding/addresses'

/**
 * Done, on the tour's last step (Exponential launch, ticket 27), which is the only thing
 * that ticks setup step 2. An ordinary form POST for the Admin the session names, and it
 * goes back to the modal's cards, where the tick shows.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  await getCommandService().execute({
    type: 'setup.finish_tour',
    ministryId: admin.ministryId,
    finishedBy: admin.userId,
  })

  return NextResponse.redirect(new URL(RESTART_ONBOARDING, request.url), { status: 303 })
}
