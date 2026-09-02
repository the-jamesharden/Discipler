import { NextResponse, type NextRequest } from 'next/server'
import { relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backToFollowUp, done, field, refusalCodeOf, refused } from '../../actions'

/**
 * An Admin cancelling a relationship nobody accepted. It ends every open
 * membership, which returns everyone in it to Ready to Pair and the suggestion
 * pool; it never activated, sent nothing to Participants, and has no check-in
 * history, so cancelling records no outcome. Ending a relationship that has
 * started is the other route.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const relationship = field(form, 'relationshipId')
  if (!relationship) return backToFollowUp(request)

  try {
    await getCommandService().execute({
      type: 'relationship.cancel',
      ministryId: admin.ministryId,
      relationshipId: relationshipId(relationship),
      cancelledBy: admin.userId,
    })
  } catch (error) {
    const code = refusalCodeOf(error)
    if (code) return refused(request, code)
    throw error
  }

  return done(request, 'cancelled')
}
