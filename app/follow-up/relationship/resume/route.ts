import { NextResponse, type NextRequest } from 'next/server'
import { relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backFrom, backToFollowUp, done, field, refusalCodeOf, refused } from '../../actions'

/**
 * An Admin resuming a paused relationship, which with ending it is the only thing
 * that takes one out of Paused. A period running out does not: it raises the
 * item this button sits on and leaves the state alone, because nobody's
 * check-ins should restart on a date they have forgotten. Resuming restores
 * whatever the history yields and never sets Healthy on its own.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  // Follow-Up, or the pair card the form was posted from.
  const back = backFrom(form)
  const relationship = field(form, 'relationshipId')
  if (!relationship) return backToFollowUp(request, undefined, back)

  try {
    await getCommandService().execute({
      type: 'relationship.resume',
      ministryId: admin.ministryId,
      relationshipId: relationshipId(relationship),
      resumedBy: admin.userId,
    })
  } catch (error) {
    const code = refusalCodeOf(error)
    if (code) return refused(request, code, back)
    throw error
  }

  return done(request, 'resumed', back)
}
