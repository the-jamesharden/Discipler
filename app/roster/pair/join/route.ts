import { NextResponse, type NextRequest } from 'next/server'
import {
  GroupJoinRefused,
  PairingRefused,
  type GroupJoinRefusal,
  type PairingRefusal,
} from '~/domain/errors'
import { personIdFrom, relationshipIdFrom } from '~/domain/ids'
import { DEFAULT_LIST, isRosterList } from '../../copy'
import { isPairSide, SIDE_FIELD } from '../../lists'
import { AS_A_DISCIPLE, AS_A_LEADER, JOIN_AS_FIELD } from '../join-as'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An Admin putting somebody into a group that already exists (Manual pairing,
 * ticket 22). An ordinary form POST, like pairing, so it works before JavaScript
 * has loaded. The Pair popup's **Add to group** and **Add as co-leader** buttons
 * post here.
 *
 * A route of its own beside `pair/create`, and not a branch inside it: that one
 * forms a relationship out of a selection, and this one names a relationship
 * that exists. Which of the two an Admin meant is the form's action, never
 * whether a field happened to be present.
 *
 * Two commands behind it, chosen by `as`: a Disciple is in the group at once, and
 * a Discipler is invited to lead it. Absent is a Disciple, which is what the
 * route meant before it knew the second; anything else it does not know is
 * refused rather than guessed at, because the two are not alike and a body that
 * misspelt *leader* would otherwise put a Discipler into a group to be discipled.
 * The words are `../join-as`, which the popup posts them from.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const form = await request.formData()
  const field = (name: string): string | undefined => {
    const value = form.get(name)
    return typeof value === 'string' && value !== '' ? value : undefined
  }

  const person = field('personId')
  const group = field('groupId')
  const as = field(JOIN_AS_FIELD) ?? AS_A_DISCIPLE
  // The list the popup was drawn over, so the answer lands on the list the Admin
  // was on. Anything that names none of the three is All, as it is on the Roster.
  const rawList = field('list')
  const list = isRosterList(rawList) ? rawList : DEFAULT_LIST
  // And the side of the popup it was posted from (Roles per pairing, ticket 01).
  const rawSide = field(SIDE_FIELD)
  const side = isPairSide(rawSide) ? rawSide : null

  /**
   * Back to where the Admin submitted from: the Roster, on their list, with the
   * popup's address for this Person on the side it was on, the group they chose and
   * the reason. Whether
   * `pair` names anybody is the Roster's to say, as it is for a refused pairing.
   */
  const refused = (code: GroupJoinRefusal | PairingRefusal) => {
    const params = new URLSearchParams({ list })
    if (person !== undefined) params.set('pair', person)
    if (side !== null) params.set(SIDE_FIELD, side)
    if (group !== undefined) params.set('groupId', group)
    params.set('error', code)
    return NextResponse.redirect(new URL(`/roster?${params}`, request.url), { status: 303 })
  }

  // Text nobody vouched for. An id that is not shaped like one names nobody, and
  // is refused as naming nobody rather than handed to the database to fail a cast.
  const personId = personIdFrom(person)
  if (personId === null) return refused('joining.person_not_found')
  const relationshipId = relationshipIdFrom(group)
  if (relationshipId === null) return refused('joining.group_not_found')
  if (as !== AS_A_DISCIPLE && as !== AS_A_LEADER) return refused('joining.role_not_recognised')

  const named = { ministryId: admin.ministryId, relationshipId, personId, addedBy: admin.userId }

  // The receipt, read off what the command decided. A Disciple's says whether
  // anybody was told: a group still awaiting its Discipler is joined with nobody
  // texted, and the receipt must not say somebody was. A Discipler's says they
  // were invited, which is all that has happened. The Person's id travels so the
  // receipt can say who; it is looked up on the Roster, never rendered.
  let receipt: URLSearchParams
  try {
    if (as === AS_A_LEADER) {
      await getCommandService().execute({ type: 'group.add_leader', ...named })
      receipt = new URLSearchParams({ list, invited: personId })
    } else {
      const { effects } = await getCommandService().execute({ type: 'group.add_participant', ...named })
      const told = effects.some((effect) => effect.kind === 'message.enqueue')
      receipt = new URLSearchParams({ list, joined: personId, told: told ? 'yes' : 'no' })
    }
  } catch (error) {
    // Two families and both are sentences for the Admin: what this act refuses of
    // its own, and the membership the database refused by the rules formation is
    // held to -- Intake, opting out, the group's declared gender.
    if (error instanceof GroupJoinRefused || error instanceof PairingRefused) {
      return refused(error.refusal)
    }
    throw error
  }

  // Back to the Roster, where the group is now on both rows.
  return NextResponse.redirect(new URL(`/roster?${receipt}`, request.url), { status: 303 })
}
