import { NextResponse, type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { WHATS_NEW } from '../../../help/whats-new'
import { growthChoiceFrom, MEASURE_PARAMETER, overviewAddress, SCALE_PARAMETER } from '../../growth-address'

/**
 * The close button on the What's new card (Exponential launch, ticket 30). An ordinary
 * form POST, so it works before script has loaded, for the Admin the session names and
 * nobody else: dismissing hides the entry from them alone.
 *
 * Text nobody vouched for, so an id the file does not hold is not stored, and the way
 * back is rebuilt from the chart's own choices rather than taken from the form.
 */
const typed = (form: FormData, field: string): string => {
  const value = form.get(field)
  return typeof value === 'string' ? value : ''
}

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const entry = WHATS_NEW.find(({ id }) => id === typed(form, 'entry'))

  if (entry) {
    await getCommandService().execute({
      type: 'whats_new.dismiss',
      ministryId: admin.ministryId,
      entryId: entry.id,
      dismissedBy: admin.userId,
    })
  }

  const back = overviewAddress(
    growthChoiceFrom({ growth: typed(form, MEASURE_PARAMETER), by: typed(form, SCALE_PARAMETER) }),
  )
  return NextResponse.redirect(new URL(back, request.url), { status: 303 })
}
