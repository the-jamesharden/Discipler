import { NextResponse, type NextRequest } from 'next/server'
import { concernId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backToFollowUp, done, field, refusalCodeOf, refused } from '../../actions'

/**
 * An Admin resolving a Concern, which is the only thing that closes one. No
 * answered check-in clears it and it never clears itself. Resolving clears the
 * words: the schema refuses to hold a resolved Concern's text, so a Ministry does
 * not accumulate a permanent file of somebody's hardest weeks.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const concern = field(form, 'concernId')
  if (!concern) return backToFollowUp(request)

  try {
    await getCommandService().execute({
      type: 'concern.resolve',
      ministryId: admin.ministryId,
      concernId: concernId(concern),
      resolvedBy: admin.userId,
    })
  } catch (error) {
    const code = refusalCodeOf(error)
    if (code) return refused(request, code)
    throw error
  }

  return done(request, 'concern-resolved')
}
