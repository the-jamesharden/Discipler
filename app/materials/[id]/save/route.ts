import { type NextRequest } from 'next/server'
import { materialId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { discardMaterialFiles, readStoredFiles } from '~/platform/supabase/material-files'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getCommandService } from '~/service/container'
import {
  answering,
  applying,
  backTo,
  discardUnnamed,
  itemsTicked,
  postedLinks,
  postedUploads,
  typed,
} from '../../editing'

/**
 * Save changes, behind the form on `/materials/[id]/edit`. A POST of its own
 * beside the page rather than on it, because a route and a page cannot share
 * one path, as `/settings/save` sits beside `/settings`.
 *
 * The items ticked are removed, the files the browser uploaded and the link
 * typed are added after the rest (Richer materials, ticket 01), and the files
 * the Material no longer names are deleted once the edit has landed. A refused
 * edit keeps the new uploads for the page to name again, unless it was the files
 * themselves that were refused. The one refusal an Admin is most likely to meet
 * is removing everything from a Material with no text, which comes back with
 * the same toast the create page shows. Sent by the page's own script, it is
 * answered in kind, as the create route is (`../../form-answer`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin()
  if (!admin) return backTo(request, '/materials')

  const { id } = await params
  const folder = `/materials/${id}`
  const form = await request.formData()
  const answer = answering(request, form, `${folder}/edit`)
  const uploads = postedUploads(form)
  const supabase = await createSupabaseServerClient()
  const { files, gone } = await readStoredFiles(supabase, admin.ministryId, uploads)
  // Uploads the sweep has taken, from a form left open a day: nothing to decide
  // on until the Admin has seen that and chosen again.
  if (gone.length > 0) return answer.gone(gone)

  return applying(
    () =>
      getCommandService().execute({
        type: 'material.edit',
        ministryId: admin.ministryId,
        materialId: materialId(id),
        title: typed(form, 'title') ?? '',
        body: typed(form, 'body'),
        removeItems: itemsTicked(form),
        files,
        links: postedLinks(form),
        changedBy: admin.userId,
      }),
    uploads.map((upload) => upload.path),
    (paths) => discardUnnamed(supabase, paths),
    answer.refused,
    async (outcome) => {
      // The objects the row no longer names, deleted once the edit has landed.
      // A deletion that fails leaves an orphan and a correct row, which is the
      // lesser fault: it is logged rather than shown to the Admin as a failed
      // save that in fact saved, and the tick's sweep takes it later.
      const edit = outcome.effects.find((effect) => effect.kind === 'material.edit')
      const discarded = edit?.edit.discarded.map((file) => file.path) ?? []
      await discardMaterialFiles(supabase, discarded).catch((error: unknown) => {
        console.error(`Files at ${discarded.join(', ')} were removed but could not be deleted`, error)
      })
      return answer.landed(folder)
    },
  )
}
