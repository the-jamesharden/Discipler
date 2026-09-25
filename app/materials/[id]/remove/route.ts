import { type NextRequest } from 'next/server'
import { materialId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { applying, backTo } from '../../editing'

/**
 * Remove, behind the card on `/materials/[id]/edit`, and the only edit that
 * takes two presses.
 *
 * This route removes nothing on its own. Without the confirmation it reopens
 * the edit page with the confirmation open, and the button inside that is the
 * only thing that carries it -- so a stale form, a copied link or a second tab
 * lands on the question rather than on the removal. The Material's PDF is left
 * in the bucket: the Material is history, and its file is part of it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin()
  if (!admin) return backTo(request, '/materials')

  const { id } = await params
  const edit = `/materials/${id}/edit`
  const form = await request.formData()

  // Not an error and not silence: the Admin asked to remove a Material and gets
  // the page that asks whether they mean it, with the button that does it.
  if (form.get('confirm') !== 'yes') return backTo(request, edit, { removing: 'yes' })

  return applying(
    () =>
      getCommandService().execute({
        type: 'material.remove',
        ministryId: admin.ministryId,
        materialId: materialId(id),
        removedBy: admin.userId,
      }),
    [],
    async () => undefined,
    (refused) => backTo(request, edit, { error: refused.refusal }),
    () => backTo(request, '/materials'),
  )
}
