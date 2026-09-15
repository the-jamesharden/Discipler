import { type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { discardMaterialPdf, storeMaterialPdf } from '~/platform/supabase/material-pdf'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getCommandService } from '~/service/container'
import { applying, asTyped, backTo, chosenFile, refusedUpload, typed } from '../editing'

/**
 * Create material, behind the form on `/materials/new`.
 *
 * The file is refused before storage is touched, stored under the Admin's own
 * session so the bucket's policies decide, and then the command runs. A command
 * that refuses -- a blank title, a title the Ministry already holds, neither
 * text nor PDF -- deletes the object it was handed, so no orphan remains; a
 * command that lands sends the Admin to the new Material's folder, which is
 * where assigning it starts.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  // Not an error page: a signed-out visitor has no Materials, and a Leader has
  // none to create. Both land where the page itself would send them.
  if (!admin) return backTo(request, '/materials')

  const form = await request.formData()
  const back = (params?: Record<string, string>) => backTo(request, '/materials/new', params)

  const chosen = chosenFile(form, 'pdf')
  if (chosen) {
    const refusal = refusedUpload(chosen)
    if (refusal) return back({ error: refusal, ...asTyped(form) })
  }

  const supabase = await createSupabaseServerClient()
  const pdf = chosen ? await storeMaterialPdf(supabase, admin.ministryId, chosen) : null

  return applying(
    () =>
      getCommandService().execute({
        type: 'material.create',
        // From the session and never from the form, like every other Admin action.
        ministryId: admin.ministryId,
        title: typed(form, 'title') ?? '',
        body: typed(form, 'body'),
        pdf,
        createdBy: admin.userId,
      }),
    pdf,
    (path) => discardMaterialPdf(supabase, path),
    (refused) => back({ error: refused.refusal, ...asTyped(form) }),
    (outcome) => {
      const created = outcome.effects.find((effect) => effect.kind === 'material.create')
      if (!created) throw new Error('material.create landed without creating a Material')
      return backTo(request, `/materials/${created.material.id}`)
    },
  )
}
