import { type NextRequest } from 'next/server'
import { isGoalDirection } from '~/domain/discipleship-goals'
import { discipleshipGoalId } from '~/domain/intake'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { applying, backToTheList } from '../editing'

/**
 * One option, one place along the list. The Ministry's ordering is pastoral --
 * what they most want people to consider first -- so it is theirs to set and
 * nothing alphabetises it on their behalf.
 *
 * An option already at the end of the list moves nowhere, and that is the
 * boundary's answer rather than this route's: it produces no effects, no history
 * and no error, because an Admin pressing up on the top option has asked for the
 * list they are already looking at.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return backToTheList(request)

  const form = await request.formData()
  const goal = form.get('goalId')
  const direction = form.get('direction')

  // Read as one of two answers rather than as *anything but up*. A field that
  // arrived mangled must not quietly rearrange a Ministry's own ordering.
  if (typeof goal !== 'string' || goal === '' || !isGoalDirection(direction)) {
    return backToTheList(request)
  }

  return applying(request, () =>
    getCommandService().execute({
      type: 'goal.move',
      ministryId: admin.ministryId,
      goalId: discipleshipGoalId(goal),
      direction,
    }),
  )
}
