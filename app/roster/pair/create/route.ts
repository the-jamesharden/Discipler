import { NextResponse, type NextRequest } from 'next/server'
import { PairingRefused } from '~/domain/errors'
import { materialId, personId } from '~/domain/ids'
import type { Gender } from '~/domain/intake'
import { readPairingMode } from '~/domain/separate-pairings'
import { declaredGenderFromField, declaredGenderToField } from '../../declared-gender'
import { encodeSeparateReceipt } from '../receipt'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { formSeparately } from '~/service/separate-pairings'

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
   * One relationship of everybody chosen, or a one-to-one with each Disciple
   * (Manual pairing, ticket 21). Absent, or anything that is not `separate`, is
   * `together`, which is what this route did before it was asked.
   */
  const mode = readPairingMode(form.get('mode'))

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
  const refused = (code: string, about: string | null = null) => {
    const params = new URLSearchParams({ error: code })
    // Which of several Disciples a separate submission was refused about (Manual
    // pairing, ticket 21). An id and never a name: the page reads the name off the
    // Roster, so nothing in an address is rendered.
    if (about !== null) params.set('about', about)
    // The mode comes back with the selection, or the corrected form would form one
    // group of the people it was refused as several one-to-ones of.
    if (mode === 'separate') params.set('mode', mode)
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

  /**
   * A one-to-one with each Disciple, all of them or none. The set is checked whole
   * before any of it is formed, and the group's properties -- its declaration, its
   * name, its door -- are left behind rather than applied to each pairing: a
   * one-to-one has nothing a name is for, and its gender is its two people's. They
   * still travel back on a refusal, as part of what the Admin had on screen.
   *
   * No Material yet. Each Disciple carries their own, which is this ticket's second
   * stage, and the one Material a `together` submission takes is not theirs.
   */
  if (mode === 'separate') {
    const outcome = await formSeparately(getCommandService(), {
      ministryId: admin.ministryId,
      leaderIds: leaderIds.map(personId),
      participantIds: participantIds.map(personId),
    })

    if (outcome.status === 'refused') return refused(outcome.refusal, outcome.about)

    // Some of it landed, which is the outcome the check exists to prevent and cannot
    // rule out. A fault cannot be thrown without losing the count of what landed, so
    // it is logged here and the receipt says the rest.
    if (outcome.status === 'partly_formed' && outcome.refusal === null) {
      console.error(
        `A set of one-to-ones in ministry ${admin.ministryId} stopped partway on a fault`,
        outcome.fault,
      )
    }

    // To the Roster either way, where what landed is on the rows. The receipt counts
    // the one-to-ones formed, and where that is not all of them, says who was not.
    return NextResponse.redirect(
      new URL(`/roster?${encodeSeparateReceipt(outcome)}`, request.url),
      { status: 303 },
    )
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
  return NextResponse.redirect(
    new URL(`/roster?${new URLSearchParams({ paired: String(participantIds.length) })}`, request.url),
    { status: 303 },
  )
}
