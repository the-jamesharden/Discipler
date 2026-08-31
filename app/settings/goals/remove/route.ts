import { type NextRequest } from 'next/server'
import { discipleshipGoalId } from '~/domain/intake'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { applying, backToTheList } from '../editing'

/**
 * The one edit that costs somebody something, and the only one that takes two
 * presses.
 *
 * Removing an option blanks it on the submissions that chose it. Those people keep
 * their Intake and their availability and stay pairable -- ranked on availability
 * alone until they answer again -- and their stated goal is gone for good. An
 * Admin has to be told that before it happens, not after.
 *
 * So this route removes nothing on its own. Without the confirmation it sends the
 * Admin to the warning for this option, which says how many people have chosen it
 * and what removing it loses; the button inside that warning is the only thing
 * that carries the confirmation. A stale form, a copied link, or a second tab
 * lands on the warning rather than on the removal.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return backToTheList(request)

  const form = await request.formData()
  const goal = form.get('goalId')
  const confirmed = form.get('confirm') === 'yes'

  if (typeof goal !== 'string' || goal === '') return backToTheList(request)

  // Not an error and not silence: the Admin asked to remove an option and gets the
  // page that tells them what it would cost, with the button that does it.
  if (!confirmed) return backToTheList(request, { removing: goal })

  return applying(request, () =>
    getCommandService().execute({
      type: 'goal.remove',
      ministryId: admin.ministryId,
      goalId: discipleshipGoalId(goal),
    }),
  )
}
