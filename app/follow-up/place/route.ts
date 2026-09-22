import { NextResponse, type NextRequest } from 'next/server'
import { GroupJoinRefused, PairingRefused } from '~/domain/errors'
import { personIdFrom, relationshipIdFrom } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backToFollowUp, field, refused } from '../actions'

/**
 * **Place in this group**, on a *Wants a group* item (Group form exits, ticket 01,
 * S-8). An ordinary form POST, so it works before JavaScript has loaded.
 *
 * Not an act of its own. Putting somebody into a group that exists is
 * `group.add_participant`, the act the Roster's **Add to group** runs: the same
 * membership, the same event, the same triggers at the insert and the same text
 * to the group's Leaders, and it resolves the item in the same transaction
 * because an open placement item is answered by any placement. A second command
 * for the same act from another page would be two acts to keep alike.
 *
 * On success the Admin lands on the Roster with the receipt **Add to group**
 * gives, which says whether anybody was texted and shows them in the group. A
 * refusal comes back here in the joining's and the pairing's own codes.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  // Text nobody vouched for. An id not shaped like one names nobody, and is
  // refused as naming nobody rather than handed to the database to fail a cast.
  const personId = personIdFrom(field(form, 'personId') ?? undefined)
  if (personId === null) return refused(request, 'joining.person_not_found')
  const rawGroup = field(form, 'groupId')
  // No group chosen: the select is required, so this is a body Care Needed did
  // not send. Back to the page, as a form with no item is.
  if (rawGroup === null) return backToFollowUp(request)
  const relationshipId = relationshipIdFrom(rawGroup)
  if (relationshipId === null) return refused(request, 'joining.group_not_found')

  let told: boolean
  try {
    const { effects } = await getCommandService().execute({
      type: 'group.add_participant',
      ministryId: admin.ministryId,
      relationshipId,
      personId,
      addedBy: admin.userId,
    })
    told = effects.some((effect) => effect.kind === 'message.enqueue')
  } catch (error) {
    if (error instanceof GroupJoinRefused || error instanceof PairingRefused) {
      return refused(request, error.refusal)
    }
    throw error
  }

  const receipt = new URLSearchParams({ joined: personId, told: told ? 'yes' : 'no' })
  return NextResponse.redirect(new URL(`/roster?${receipt}`, request.url), { status: 303 })
}
