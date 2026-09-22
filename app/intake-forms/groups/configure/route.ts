import { NextResponse, type NextRequest } from 'next/server'
import { GroupRefused, MaterialAssignmentRefused } from '~/domain/errors'
import { materialId, relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { chosenIn, MATERIAL_FIELD } from '../../../materials/assigning'

/**
 * An Admin naming a group and choosing whether joining it asks. One form and one
 * save, like the settings form: both fields arrive together and land together.
 * An ordinary form POST, like everything on Intake forms, so it works before
 * JavaScript has loaded.
 *
 * An accepted group's card also carries its Material (Materials, ticket 03,
 * S-6), saved in the same press through the command the folder's assign row
 * executes. After the name and the toggle, as a second command: a refused
 * Material leaves the name saved and says so. Choosing the Material already
 * running is refused by the database with nothing written, which is exactly
 * *changed nothing*, so it is not reported.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/intake-forms', request.url), { status: 303 })

  const form = await request.formData()
  const relationship = form.get('relationshipId')
  const name = form.get('name')
  // A checkbox is sent when ticked and absent when not, so its absence is the
  // answer *open* rather than a missing field.
  const joinRequiresApproval = form.get('joinRequiresApproval') === 'yes'

  if (typeof relationship !== 'string' || relationship === '') {
    return NextResponse.redirect(new URL('/intake-forms', request.url), { status: 303 })
  }

  try {
    await getCommandService().execute({
      type: 'group.configure',
      ministryId: admin.ministryId,
      relationshipId: relationshipId(relationship),
      name: typeof name === 'string' ? name : null,
      joinRequiresApproval,
      changedBy: admin.userId,
    })
  } catch (error) {
    if (error instanceof GroupRefused) return refusedWith(request, error.refusal)
    throw error
  }

  // Absent on a card that draws no dropdown, which is an unaccepted group's.
  const chosen = chosenIn(form.get(MATERIAL_FIELD))
  if (chosen !== null) {
    try {
      await getCommandService().execute({
        type: 'relationship.assign_material',
        ministryId: admin.ministryId,
        relationshipId: relationshipId(relationship),
        materialId: chosen.kind === 'none' ? null : materialId(chosen.id),
        assignedBy: admin.userId,
      })
    } catch (error) {
      if (!(error instanceof MaterialAssignmentRefused)) throw error
      if (error.refusal !== 'material.already_running') return refusedWith(request, error.refusal)
    }
  }

  return NextResponse.redirect(
    new URL(`/intake-forms?${new URLSearchParams({ configured: relationship })}`, request.url),
    { status: 303 },
  )
}

/** Back to Intake forms with the refusal the groups card has a sentence for. */
const refusedWith = (request: NextRequest, refusal: string) =>
  NextResponse.redirect(
    new URL(`/intake-forms?${new URLSearchParams({ groupError: refusal })}`, request.url),
    { status: 303 },
  )
