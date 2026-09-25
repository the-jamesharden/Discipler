import type { SupabaseClient } from '@supabase/supabase-js'
import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import { abandonedUploads, fileTypeNamed, type MaterialFile } from '~/domain/materials'
import { serviceRoleClient } from './credentials'

/**
 * A Material's files, in and out of the private `material` bucket (Richer
 * materials, ticket 01).
 *
 * The browser sends each file straight to Storage, at an upload address minted
 * here under the signed-in Admin's own session, so the storage policies ticket 14
 * wrote still decide who may write where, and no file passes through a route:
 * a hosted function refuses a request body over a few megabytes, which is why a
 * 20 MB PDF could not be saved before. The key is `<ministry_id>/<uuid>.<ext>`,
 * which is what those policies read the Ministry off.
 *
 * The bucket is the one place the command boundary cannot reach, which is why the
 * order of operations lives with the routes: the browser uploads, the form posts
 * the paths, the route reads back what Storage holds at each, then the command,
 * then delete whatever the row no longer names -- and delete what was uploaded
 * when the command refuses. A file uploaded and never saved is swept by the tick.
 */

const BUCKET = 'material'

/** What a file is called on the row when the browser sent no usable name for it. */
const UNNAMED = 'material'

/** The longest filename kept. Longer is truncated rather than refused. */
const LONGEST_FILENAME = 200

/** Where the browser is to send one file, and the key it will be stored under. */
export interface UploadAddress {
  readonly path: string
  readonly url: string
  /** The type to send it as: the one its extension names, not the browser's guess. */
  readonly contentType: string
}

/**
 * A one-time address the browser may PUT one file to. Minted under the Admin's
 * session, so an Admin of one Ministry cannot be given an address in another's
 * folder: Storage asks the insert policy before it signs.
 */
export const mintUploadAddress = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  filename: string,
): Promise<UploadAddress> => {
  const type = fileTypeNamed(filename)
  if (!type) throw new Error(`No upload address for ${filename}: not a type a Material holds`)
  const path = `${ministryId}/${crypto.randomUUID()}.${type.extension}`
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw new Error(`Could not mint an upload address for ${filename}: ${error.message}`)
  return { path: data.path, url: data.signedUrl, contentType: type.contentType }
}

/** A name as the form sent it: trimmed, kept to a sane length, never empty. */
export const keptFilename = (raw: string): string => {
  const name = raw.trim().slice(0, LONGEST_FILENAME)
  return name === '' ? UNNAMED : name
}

/**
 * What Storage holds at each path the form posted, as the files a Material will
 * name, and the paths it holds nothing at. The size and the type are Storage's,
 * never the form's: a browser can be told to say anything, and the bucket is
 * what actually holds the bytes. A path outside the Admin's own folder is
 * refused as a fault rather than read, because the page never posts one.
 *
 * A path with nothing at it is not a fault. A form a refusal sent back keeps
 * naming its uploads, and one left open for more than a day names files the tick
 * has since swept; the route sends the form back with those marked, rather than
 * losing everything typed to an error page.
 */
export const readStoredFiles = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  uploads: readonly { readonly path: string; readonly filename: string }[],
): Promise<{ readonly files: readonly MaterialFile[]; readonly gone: readonly string[] }> => {
  const read = await Promise.all(
    uploads.map(async ({ path, filename }): Promise<MaterialFile | string> => {
      if (!path.startsWith(`${ministryId}/`)) {
        throw new Error(`An upload at ${path} is not in this Ministry's folder`)
      }
      const { data, error } = await supabase.storage.from(BUCKET).info(path)
      if (error || !data) {
        // Anything but *not there* is Storage failing, which is a fault.
        if (!isNotFound(error)) {
          throw new Error(`Could not read ${path}: ${error?.message ?? 'no answer'}`)
        }
        return path
      }
      return {
        kind: 'file' as const,
        path,
        filename: keptFilename(filename),
        contentType: data.contentType ?? '',
        bytes: data.size ?? 0,
      }
    }),
  )
  return {
    files: read.flatMap((each) => (typeof each === 'string' ? [] : [each])),
    gone: read.flatMap((each) => (typeof each === 'string' ? [each] : [])),
  }
}

/** Whether Storage answered *there is nothing at that path*. */
const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  return status === 404 || statusCode === '404' || statusCode === 404 ||
    /not.?found/i.test(String((error as { message?: unknown }).message ?? ''))
}

/** Deletes objects. Raised rather than swallowed: an orphan is a fault to see. */
export const discardMaterialFiles = async (
  supabase: SupabaseClient,
  paths: readonly string[],
): Promise<void> => {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove([...paths])
  if (error) throw new Error(`Could not delete ${paths.join(', ')}: ${error.message}`)
}

/**
 * A short-lived link that downloads one file under the name it arrived with.
 * Minted per render rather than stored, so a link cannot outlive the assignment
 * it came with. Null where it could not be minted: a missing link is not a
 * failure of the screen.
 */
export const downloadLink = async (
  supabase: SupabaseClient,
  file: { readonly path: string; readonly filename: string },
  seconds: number,
): Promise<string | null> => {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.path, seconds, { download: file.filename })
  return data?.signedUrl ?? null
}

/**
 * A short-lived download link minted with the service role, for a Disciple's
 * Material page (Richer materials, ticket 04). A Disciple has no session for a
 * storage policy to read, so the file route decides who may have the file --
 * the token, and the item being on the Material running now -- and this signs
 * exactly that one object for a few minutes.
 */
export const downloadLinkForAnybody = (
  file: { readonly path: string; readonly filename: string },
  seconds: number,
): Promise<string | null> => downloadLink(serviceRoleClient(), file, seconds)

/** How many objects one page of a folder listing asks for. */
const LISTING_PAGE = 1000

/**
 * How many item rows one read asks for: under the `max_rows` PostgREST caps a
 * response at (1000, here and on the hosted project), so a full page always
 * means there may be more.
 */
const NAMED_PAGE = 500

/**
 * Deletes the files in a Ministry's folder that no Material names and that
 * nobody saved within a day of uploading, and says how many. Run by the tick
 * with the service role, because it acts for nobody signed in and a folder
 * listing is not something the command connection can ask for; it deletes only
 * inside the one Ministry's folder it is given.
 */
export const sweepUnsavedUploads = async (
  ministryId: MinistryId,
  clock: Clock,
): Promise<number> => {
  const storage = serviceRoleClient()

  const objects: { path: string; createdAt: Date }[] = []
  for (let offset = 0; ; offset += LISTING_PAGE) {
    const { data, error } = await storage.storage
      .from(BUCKET)
      .list(ministryId, { limit: LISTING_PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`Could not list ${ministryId}'s uploads: ${error.message}`)
    for (const object of data) {
      // A folder listing names sub-folders too, with no id; there are none here
      // by construction, and one that appeared would not be swept.
      if (object.id && object.created_at) {
        objects.push({ path: `${ministryId}/${object.name}`, createdAt: new Date(object.created_at) })
      }
    }
    if (data.length < LISTING_PAGE) break
  }
  if (objects.length === 0) return 0

  // Everything a Material names, removed Materials included, since removing one
  // keeps it. Every row, a page at a time: PostgREST hands back no more than
  // `max_rows` for one request and says nothing about the rest, and a path
  // missing from this set is a saved file deleted. The old single PDF is an item
  // too, kept so by the database while that column stands.
  const named = new Set<string>()
  for (let from = 0; ; from += NAMED_PAGE) {
    const { data, error } = await storage
      .from('material_item')
      .select('path')
      .eq('ministry_id', ministryId)
      .not('path', 'is', null)
      .order('path')
      .range(from, from + NAMED_PAGE - 1)
    if (error) throw new Error(`Could not read what ${ministryId}'s Materials name: ${error.message}`)
    for (const row of data) named.add(String(row.path))
    if (data.length < NAMED_PAGE) break
  }

  const abandoned = abandonedUploads(objects, named, clock.now())
  await discardMaterialFiles(storage, abandoned)
  return abandoned.length
}
