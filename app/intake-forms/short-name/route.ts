import { NextResponse, type NextRequest } from 'next/server'
import { ShortNameRefused } from '~/domain/errors'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * The Save beside *Your church's short name* (Pastor feedback, ticket 04). An
 * ordinary form POST like every other Admin action, so the field works before
 * JavaScript has loaded.
 *
 * Nothing about what a short name may be is decided here: the boundary reads the
 * name as typed, and the database is the one that knows whether another Ministry
 * holds it. Whatever comes back lands on the page as a code its copy turns into
 * a sentence; the name typed is not carried back, because a query string is
 * whatever somebody put there.
 */

const PAGE = '/intake-forms'

const back = (request: NextRequest, params?: Record<string, string>) => {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  return NextResponse.redirect(new URL(`${PAGE}${query}`, request.url), { status: 303 })
}

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return back(request)

  const form = await request.formData()
  const typed = form.get('shortName')

  try {
    await getCommandService().execute({
      type: 'short_name.change',
      // From the session and never from the form, like every other Admin action.
      ministryId: admin.ministryId,
      shortName: typeof typed === 'string' ? typed : '',
      changedBy: admin.userId,
    })
  } catch (error) {
    if (error instanceof ShortNameRefused) return back(request, { shortNameError: error.refusal })
    throw error
  }

  return back(request, { shortName: 'saved' })
}
