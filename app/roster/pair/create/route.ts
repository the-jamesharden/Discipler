import { NextResponse, type NextRequest } from 'next/server'
import { PairingRefused } from '~/domain/errors'
import { materialId, personId } from '~/domain/ids'
import type { Gender } from '~/domain/intake'
import { DEFAULT_LIST, isRosterList } from '../../copy'
import { declaredGenderFromField, declaredGenderToField } from '../../declared-gender'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An ordinary form POST, like the import, so pairing works before JavaScript has
 * loaded. All three pairing routes arrive here: the command does not know which
 * screen the Admin came from, and nothing branches on whether a suggestion was
 * involved.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const form = await request.formData()
  const chosen = (field: string): string[] =>
    form.getAll(field).filter((value): value is string => typeof value === 'string' && value !== '')

  const leaderIds = chosen('leaderId')
  const participantIds = chosen('participantId')

  /**
   * Whose Pair popup this came from, and the list it was drawn over (Manual
   * pairing, ticket 12). Present, the answer goes back to the Roster: a refusal
   * reopens the popup, and the receipt lands on the list the Admin was on. Absent,
   * this is the old Pair page's form, and its refusals return there until ticket
   * 20 retires it. Whether `pair` names anybody is the Roster's to say.
   */
  const popupFor = chosen('pair')[0]
  const rawList = form.get('list')
  const list = isRosterList(rawList) ? rawList : DEFAULT_LIST

  /**
   * What the Admin said this relationship is. `undefined` is passed through rather
   * than folded to mixed, because the domain has to be able to tell *nobody answered*
   * from *somebody answered mixed*, and a route that guessed would answer a
   * safeguarding question on the Admin's behalf.
   */
  const declaredGender: Gender | null | undefined = declaredGenderFromField(
    form.get('declaredGender'),
  )

  /**
   * What the Admin called it, as typed, and whether joining it through the group
   * link asks first. Both passed through unread: what counts as a name is the
   * boundary's, and a checkbox is sent when ticked and absent when not.
   */
  const rawName = form.get('name')
  const name = typeof rawName === 'string' ? rawName : null
  const joinRequiresApproval = form.get('joinRequiresApproval') === 'yes'

  /**
   * The Material the Admin chose, or nothing. An empty value is the select's own
   * *none* and is no choice at all; anything else is passed through unread, and
   * whether this Ministry holds it is the boundary's to say.
   */
  const rawMaterial = form.get('materialId')
  const chosenMaterial = typeof rawMaterial === 'string' && rawMaterial !== '' ? rawMaterial : null

  /**
   * Back to the form with the selection intact. An Admin who picked five people for a
   * group and hit a refusal should be correcting one choice, not making all five
   * again -- and a refusal that costs more than the mistake did teaches people to
   * avoid the screen.
   */
  const refused = (code: string) => {
    if (popupFor !== undefined) {
      // Every choice the popup holds, which from a Disciple is the one Discipler.
      const params = new URLSearchParams({ list, pair: popupFor, error: code })
      for (const id of leaderIds) params.append('leaderId', id)
      return NextResponse.redirect(new URL(`/roster?${params}`, request.url), { status: 303 })
    }

    const params = new URLSearchParams({ error: code })
    for (const id of leaderIds) params.append('leaderId', id)
    for (const id of participantIds) params.append('with', id)
    // Their answer comes back too, for the same reason their selection does. An
    // Admin refused because one person is of the wrong gender is correcting the
    // person, not re-declaring what the group is.
    if (declaredGender !== undefined) {
      params.set('declaredGender', declaredGenderToField(declaredGender))
    }
    if (name) params.set('name', name)
    if (joinRequiresApproval) params.set('joinRequiresApproval', 'yes')
    if (chosenMaterial) params.set('materialId', chosenMaterial)

    return NextResponse.redirect(new URL(`/roster/pair?${params}`, request.url), {
      status: 303,
    })
  }

  // An empty selection is refused by the domain rather than here. The route once
  // checked for a missing leader itself, which made one refusal a bare string on this
  // side of the boundary while every other one was a `PairingRefusal` -- so a typo in
  // either the code or its wording fell through to the generic message instead of
  // failing the build.
  try {
    await getCommandService().execute({
      type: 'relationship.create',
      ministryId: admin.ministryId,
      leaderIds: leaderIds.map(personId),
      participantIds: participantIds.map(personId),
      ...(declaredGender === undefined ? {} : { declaredGender }),
      name,
      joinRequiresApproval,
      ...(chosenMaterial === null ? {} : { materialId: materialId(chosenMaterial) }),
    })
  } catch (error) {
    // Every refusal an Admin can act on travels as a code and lands back on the form
    // they submitted, with their selection still on screen to correct. A refusal that
    // reached them as nothing at all is the silent no-op this ticket rules out.
    if (error instanceof PairingRefused) return refused(error.refusal)
    throw error
  }

  // Back to the Roster, where the new relationship is now visible on both rows. It
  // reads as Awaiting Leader Acceptance and has sent nobody anything.
  const receipt = new URLSearchParams({
    ...(popupFor === undefined ? {} : { list }),
    paired: String(participantIds.length),
  })
  return NextResponse.redirect(new URL(`/roster?${receipt}`, request.url), { status: 303 })
}
