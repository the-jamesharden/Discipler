import { type NextRequest } from 'next/server'
import { discipleshipGoalId } from '~/domain/intake'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { applying, backToTheList } from '../editing'

/**
 * One option, reworded. It keeps every answer pointing at it, because a reworded
 * option is the same option -- which is why this is its own act and not a removal
 * followed by an addition.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return backToTheList(request)

  const form = await request.formData()
  const goal = form.get('goalId')
  const label = form.get('label')

  // A submission naming no option is not an edit an Admin can act on -- it is a
  // form that did not come from this list -- so it goes back unchanged rather than
  // reaching the boundary as a command about no option at all.
  if (typeof goal !== 'string' || goal === '') return backToTheList(request)

  return applying(request, () =>
    getCommandService().execute({
      type: 'goal.rename',
      ministryId: admin.ministryId,
      goalId: discipleshipGoalId(goal),
      label: typeof label === 'string' ? label : '',
    }),
  )
}
