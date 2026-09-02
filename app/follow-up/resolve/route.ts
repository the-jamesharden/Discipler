import { NextResponse, type NextRequest } from 'next/server'
import { followUpItemId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backToFollowUp, done, field, refusalCodeOf, refused } from '../actions'

/**
 * An Admin closing a Follow-Up Item, which is the only thing that closes one. An
 * ordinary form POST, so it works before JavaScript has loaded. Nothing here is a
 * note: resolving is one press, and the acts an Admin took are recorded as facts
 * of their own.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const item = field(form, 'itemId')
  // A form with no item did not come from Care Needed; back to the page rather
  // than to the boundary as a command about nothing.
  if (!item) return backToFollowUp(request)

  try {
    await getCommandService().execute({
      type: 'follow_up.resolve',
      ministryId: admin.ministryId,
      itemId: followUpItemId(item),
      resolvedBy: admin.userId,
    })
  } catch (error) {
    const code = refusalCodeOf(error)
    if (code) return refused(request, code)
    throw error
  }

  return done(request, 'resolved')
}
