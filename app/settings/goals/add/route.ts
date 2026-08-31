import { type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { applying, backToTheList } from '../editing'

/**
 * One option, added to the bottom of the Ministry's own list.
 *
 * What counts as wording at all -- blank, all spaces, one this Ministry already
 * offers -- is the boundary's, not this route's. A check here would be a second
 * definition of what a Discipleship Goal option is, in the one place that cannot
 * be driven without a browser.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return backToTheList(request)

  const form = await request.formData()
  const label = form.get('label')

  return applying(request, () =>
    getCommandService().execute({
      type: 'goal.add',
      // From the session and never from the form, like every other Admin action.
      ministryId: admin.ministryId,
      label: typeof label === 'string' ? label : '',
    }),
  )
}
