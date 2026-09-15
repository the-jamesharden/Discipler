import { type NextRequest } from 'next/server'
import { materialId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { discardMaterialPdf, storeMaterialPdf } from '~/platform/supabase/material-pdf'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getCommandService } from '~/service/container'
import { applying, asTyped, backTo, chosenFile, refusedUpload, typed } from '../../editing'

/**
 * Save changes, behind the form on `/materials/[id]/edit`. A POST of its own
 * beside the page rather than on it, because a route and a page cannot share
 * one path, as `/settings/save` sits beside `/settings`.
 *
 * The PDF is kept, removed or replaced. A replacement is uploaded first, then
 * the edit runs, then the old object is deleted; removing deletes after the
 * edit lands. A refused edit deletes what was just uploaded, so no orphan
 * remains either way. The one refusal the design draws is removing the PDF from
 * a Material with no text, which comes back with the same toast the create page
 * shows.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin()
  if (!admin) return backTo(request, '/materials')

  const { id } = await params
  const folder = `/materials/${id}`
  const form = await request.formData()
  const back = (params?: Record<string, string>) => backTo(request, `${folder}/edit`, params)

  const chosen = chosenFile(form, 'pdf')
  if (chosen) {
    const refusal = refusedUpload(chosen)
    if (refusal) return back({ error: refusal, ...asTyped(form) })
  }

  const supabase = await createSupabaseServerClient()
  const uploaded = chosen ? await storeMaterialPdf(supabase, admin.ministryId, chosen) : null
  // A file chosen is the more deliberate act, so it wins over the checkbox.
  const pdf = uploaded ?? (typed(form, 'removePdf') === 'yes' ? 'remove' : 'keep')

  return applying(
    () =>
      getCommandService().execute({
        type: 'material.edit',
        ministryId: admin.ministryId,
        materialId: materialId(id),
        title: typed(form, 'title') ?? '',
        body: typed(form, 'body'),
        pdf,
        changedBy: admin.userId,
      }),
    uploaded,
    (path) => discardMaterialPdf(supabase, path),
    (refused) => back({ error: refused.refusal, ...asTyped(form) }),
    async (outcome) => {
      // The object the row no longer names, deleted once the edit has landed.
      // A deletion that fails leaves an orphan and a correct row, which is the
      // lesser fault: it is logged rather than shown to the Admin as a failed
      // save that in fact saved.
      const edit = outcome.effects.find((effect) => effect.kind === 'material.edit')
      const discarded = edit?.edit.discarded
      if (discarded) {
        await discardMaterialPdf(supabase, discarded.path).catch((error: unknown) => {
          console.error(`The PDF at ${discarded.path} was replaced but could not be deleted`, error)
        })
      }
      return backTo(request, folder)
    },
  )
}
