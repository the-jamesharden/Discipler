import { type NextRequest } from 'next/server'
import { MaterialAssignmentRefused } from '~/domain/errors'
import { materialId, relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { afterAssigning, materialIn, tickedIn, TICKED_FIELD } from '../../../assign-to-more'
import { filterIn, NONE_TICKED } from '../../../copy'
import { backTo } from '../../../editing'

/**
 * The button on a Material's assign page (Richer materials, ticket 02). A plain
 * form POST carrying every ticked relationship, so it works before JavaScript has
 * loaded, executing one command that starts them all on the Material in one
 * transaction, or none of them.
 *
 * It starts now: the command carries no date, and nothing on the form is read as
 * one. Done, the Admin lands in the Material's folder, whose head counts the ones
 * just added. Refused, they land back on the page with the code, the
 * relationship it was about, and the filter that was on; the page says which and
 * why. A press with nothing ticked is refused here, before the command: the
 * button is disabled at none where script runs, and says no number where it does
 * not.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin()
  if (!admin) return backTo(request, '/materials')

  // The Material is on the address, and an address is only ever built from an id
  // the database could have minted.
  const material = materialIn((await params).id)
  if (material === null) return backTo(request, '/materials')

  const form = await request.formData()
  const gender = form.get('gender')
  const filter = filterIn(typeof gender === 'string' ? gender : undefined)
  const back = (refusal?: { readonly code: string; readonly relationshipId: string | null }) => {
    const { path, params: query } = afterAssigning(material, filter, refusal)
    return backTo(request, path, query)
  }

  // A value that is not an id is a form nobody drew. Nothing is assigned over it,
  // and nobody is named, because there is nobody it could name.
  const ticked = tickedIn(form.getAll(TICKED_FIELD))
  if (ticked === null) return back({ code: 'material.relationship_not_found', relationshipId: null })
  if (ticked.length === 0) return back({ code: NONE_TICKED, relationshipId: null })

  try {
    await getCommandService().execute({
      type: 'material.assign_to_relationships',
      ministryId: admin.ministryId,
      materialId: materialId(material),
      relationshipIds: ticked.map(relationshipId),
      assignedBy: admin.userId,
    })
  } catch (error) {
    if (error instanceof MaterialAssignmentRefused) {
      return back({ code: error.refusal, relationshipId: error.relationshipId })
    }
    throw error
  }

  return back()
}
