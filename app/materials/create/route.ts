import { type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { discardMaterialFiles, readStoredFiles } from '~/platform/supabase/material-files'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getCommandService } from '~/service/container'
import {
  applying,
  backTo,
  postedLinks,
  postedUploads,
  refusedWith,
  typed,
  type PostedUpload,
} from '../editing'

/**
 * Create material, behind the form on `/materials/new`.
 *
 * The files are already in the bucket: the browser sent each one straight to
 * Storage as it was chosen (Richer materials, ticket 01). What arrives here is
 * their paths, which are read back from Storage so the command decides on what
 * the bucket actually holds, and then the command runs. A command refused over
 * the files deletes them; refused over anything else, it keeps them and the page
 * names them again. A command that lands sends the Admin to the new Material's
 * folder, which is where assigning it starts.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  // Not an error page: a signed-out visitor has no Materials, and a Leader has
  // none to create. Both land where the page itself would send them.
  if (!admin) return backTo(request, '/materials')

  const form = await request.formData()
  const uploads = postedUploads(form)
  const supabase = await createSupabaseServerClient()
  const files = await readStoredFiles(supabase, admin.ministryId, uploads)

  return applying(
    () =>
      getCommandService().execute({
        type: 'material.create',
        // From the session and never from the form, like every other Admin action.
        ministryId: admin.ministryId,
        title: typed(form, 'title') ?? '',
        body: typed(form, 'body'),
        files,
        links: postedLinks(form),
        createdBy: admin.userId,
      }),
    uploads.map((upload: PostedUpload) => upload.path),
    (paths) => discardMaterialFiles(supabase, paths),
    (refused) => backTo(request, '/materials/new', refusedWith(refused.refusal, form)),
    (outcome) => {
      const created = outcome.effects.find((effect) => effect.kind === 'material.create')
      if (!created) throw new Error('material.create landed without creating a Material')
      return backTo(request, `/materials/${created.material.id}`)
    },
  )
}

