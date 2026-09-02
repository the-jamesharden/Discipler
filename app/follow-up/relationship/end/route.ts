import { NextResponse, type NextRequest } from 'next/server'
import { relationshipId } from '~/domain/ids'
import { isRelationshipOutcome } from '~/domain/relationships'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backToFollowUp, done, field, refusalCodeOf, refused } from '../../actions'

/**
 * An Admin ending a relationship that has run, with an outcome and a reason,
 * both required. The reason is what happened in the Ministry's own words; the
 * outcome is the part that can be counted. `Ended` is terminal and the history is
 * preserved exactly; closing every open membership is what returns its people to
 * Ready to Pair.
 *
 * The outcome is checked here rather than trusted, so a body that named a third
 * value is refused as a sentence rather than as a database error.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const relationship = field(form, 'relationshipId')
  if (!relationship) return backToFollowUp(request)

  const reason = field(form, 'reason')?.trim() ?? ''
  const outcome = field(form, 'outcome')
  if (!isRelationshipOutcome(outcome)) return refused(request, 'ending.outcome_not_recognised')
  if (reason === '') return refused(request, 'ending.reason_is_required')

  try {
    await getCommandService().execute({
      type: 'relationship.end',
      ministryId: admin.ministryId,
      relationshipId: relationshipId(relationship),
      reason,
      outcome,
      endedBy: admin.userId,
    })
  } catch (error) {
    const code = refusalCodeOf(error)
    if (code) return refused(request, code)
    throw error
  }

  return done(request, 'ended')
}
