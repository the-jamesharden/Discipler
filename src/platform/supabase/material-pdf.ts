import type { SupabaseClient } from '@supabase/supabase-js'
import type { MinistryId } from '~/domain/ids'
import type { MaterialPdf } from '~/domain/materials'

/**
 * A Material's PDF, in and out of the private `material` bucket.
 *
 * Through the signed-in Admin's own session, never the service role, so the
 * storage policies ticket 14 wrote are what decide: an Admin may write under
 * their own Ministry's folder and nowhere else, and a Leader may read one
 * object, the one their relationship was assigned. The key is
 * `<ministry_id>/<uuid>.pdf`, which is what those policies read the Ministry off.
 *
 * The bucket is the one place the command boundary cannot reach, which is why
 * the order of operations lives with the routes: upload, then the command, then
 * delete whatever the row no longer names -- and delete what was just uploaded
 * when the command refuses, so no orphan remains.
 */

const BUCKET = 'material'

/** What an upload is called on the row when the browser sent no name for it. */
const UNNAMED = 'material.pdf'

/** Stores one file under a fresh key in the Ministry's folder, and says where. */
export const storeMaterialPdf = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  file: File,
): Promise<MaterialPdf> => {
  const path = `${ministryId}/${crypto.randomUUID()}.pdf`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (error) throw new Error(`Could not store the PDF ${file.name}: ${error.message}`)

  const filename = file.name.trim()
  return { path, filename: filename === '' ? UNNAMED : filename }
}

/** Deletes one object. Raised rather than swallowed: an orphan is a fault to see. */
export const discardMaterialPdf = async (supabase: SupabaseClient, path: string): Promise<void> => {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(`Could not delete the PDF at ${path}: ${error.message}`)
}
