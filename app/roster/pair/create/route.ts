import { NextResponse, type NextRequest } from 'next/server'
import { PairingRefused } from '~/domain/errors'
import { personId } from '~/domain/ids'
import { GENDERS, type Gender } from '~/domain/intake'
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
   * What the Admin said this relationship is. Three answers and no fourth: a gender,
   * `mixed`, or -- where the radio was left alone -- nothing at all.
   *
   * `undefined` is passed through rather than folded to `mixed`, because the domain
   * has to be able to tell *nobody answered* from *somebody answered mixed*, and a
   * route that guessed would answer a safeguarding question on the Admin's behalf.
   * Anything else in the field is nothing at all for the same reason: a value typed
   * into a form post is not a declaration.
   */
  const declared = form.get('declaredGender')
  const declaredGender: Gender | null | undefined =
    declared === 'mixed'
      ? null
      : GENDERS.includes(declared as Gender)
        ? (declared as Gender)
        : undefined

  /**
   * Back to the form with the selection intact. An Admin who picked five people for a
   * group and hit a refusal should be correcting one choice, not making all five
   * again -- and a refusal that costs more than the mistake did teaches people to
   * avoid the screen.
   */
  const refused = (code: string) => {
    const params = new URLSearchParams({ error: code })
    for (const id of leaderIds) params.append('leaderId', id)
    for (const id of participantIds) params.append('with', id)
    // Their answer comes back too, for the same reason their selection does. An
    // Admin refused because one person is of the wrong gender is correcting the
    // person, not re-declaring what the group is.
    if (declaredGender !== undefined) params.set('declaredGender', declaredGender ?? 'mixed')

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
