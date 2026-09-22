import { type NextRequest } from 'next/server'
import { MaterialAssignmentRefused } from '~/domain/errors'
import { materialId, relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { backToFolder, chosenIn, folderIn, MATERIAL_FIELD, relationshipIn } from '../assigning'
import { filterIn } from '../copy'
import { backTo } from '../editing'

/**
 * The assign row at the foot of a folder's cards (Materials, ticket 03; S-2 and
 * S-3). A plain form POST per card, so it works before JavaScript has loaded,
 * executing the same command the groups card on Intake forms does.
 *
 * It starts now: the command carries no date, and nothing on the form is read
 * as one. The Admin lands back in the folder they pressed it in, with the filter
 * that was on, where the card has gone if it moved. A refusal comes back as a
 * code the folder has a sentence for -- the Material already running among them,
 * which writes nothing and says so.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return backTo(request, '/materials')

  const form = await request.formData()
  const folder = folderIn(form.get('folder'))
  const gender = form.get('gender')
  const filter = filterIn(typeof gender === 'string' ? gender : undefined)
  const relationship = relationshipIn(form.get('relationshipId'))
  const chosen = chosenIn(form.get(MATERIAL_FIELD))

  const back = (refusal?: string) => {
    const { path, params } = backToFolder(folder, filter, refusal)
    return backTo(request, path, params)
  }

  if (relationship === null) return back('material.relationship_not_found')
  // "Choose a material…" posted: nothing was chosen, so nothing is done. The
  // select is `required`, so only a browser ignoring that arrives here.
  if (chosen === null) return back()

  try {
    await getCommandService().execute({
      type: 'relationship.assign_material',
      ministryId: admin.ministryId,
      relationshipId: relationshipId(relationship),
      materialId: chosen.kind === 'none' ? null : materialId(chosen.id),
      assignedBy: admin.userId,
    })
  } catch (error) {
    if (error instanceof MaterialAssignmentRefused) return back(error.refusal)
    throw error
  }

  return back()
}
