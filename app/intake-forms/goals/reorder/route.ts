import { type NextRequest } from 'next/server'
import { discipleshipGoalId } from '~/domain/intake'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { applying, backToTheList } from '../editing'

/**
 * The whole list, in the order an Admin dragged it into. One `order` field per
 * option, top to bottom, posted by the card's script the moment the drag ends --
 * so the page an Admin is looking at is the order the Ministry now has, with
 * nothing to save.
 *
 * Whether that order is this Ministry's list at all is the boundary's question
 * (`goal.list_changed`), and a submission naming no option is a form that did not
 * come from the card, sent back unchanged rather than reaching the boundary as an
 * order for nothing.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return backToTheList(request)

  const form = await request.formData()
  const order = form
    .getAll('order')
    .filter((value): value is string => typeof value === 'string' && value !== '')

  if (order.length === 0) return backToTheList(request)

  return applying(request, () =>
    getCommandService().execute({
      type: 'goal.reorder',
      ministryId: admin.ministryId,
      order: order.map(discipleshipGoalId),
    }),
  )
}
