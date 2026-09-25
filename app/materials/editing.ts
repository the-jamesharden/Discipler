import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { MaterialRefused } from '~/domain/errors'
import type { TypedLink } from '~/domain/commands'
import { discardMaterialFiles } from '~/platform/supabase/material-files'
import { SENT_BY_SCRIPT, uploadField, type FormAnswer } from './form-answer'

/**
 * What the create, save and remove routes share. Each is an ordinary form POST,
 * like the goal edits and the settings save, so the whole screen works before
 * JavaScript has loaded -- and each ends on a page an Admin can read, with
 * anything the edit has to say carried in the query string under names the
 * page reserves for it.
 *
 * A refusal keeps what was typed: the title, the text, the link, the files
 * already uploaded and the items ticked for removal all travel back on the query
 * string so the page can fill the form in again. A file the browser uploaded is
 * kept in the bucket across the refusal and named again on the page, so an Admin
 * refused over a title does not upload a 40 MB video twice; one never saved is
 * swept by the tick a day later.
 */

/** A field as it arrived, or null where the form sent none. Never coerced: the boundary decides. */
export const typed = (form: FormData, field: string): string | null => {
  const value = form.get(field)
  return typeof value === 'string' ? value : null
}

/** Every value a repeated field sent, strings only. */
const every = (form: FormData, field: string): readonly string[] =>
  form.getAll(field).flatMap((value) => (typeof value === 'string' ? [value] : []))

/**
 * One file the browser uploaded, as the page posts it back: where, what it was
 * called, and its size as the browser saw it, which is for the page to show
 * again and nothing more. `gone` marks one the route found missing from the
 * bucket and carried back so the page can say so.
 */
export interface PostedUpload {
  readonly path: string
  readonly filename: string
  readonly bytes: number | null
  readonly gone: boolean
}

/**
 * The files the browser uploaded for this form, each posted as a hidden field
 * holding its path and name. One that is not what the page writes is dropped
 * rather than trusted: the route reads every path back from Storage anyway.
 */
export const postedUploads = (form: FormData): readonly PostedUpload[] =>
  uploadsIn(every(form, 'upload'))

/**
 * The uploads a hidden field or the query string names, each written by the page
 * as JSON. The same reading for a form posted and a refusal carried back. A path
 * named twice is one upload: it is one object, and saving it twice would be two
 * items deleting each other's file.
 */
export const uploadsIn = (values: readonly string[]): readonly PostedUpload[] => {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      // Not JSON: not something the page wrote.
      return []
    }
    if (!parsed || typeof parsed !== 'object') return []
    const { path, filename, bytes, gone } = parsed as Record<string, unknown>
    if (typeof path !== 'string' || typeof filename !== 'string' || seen.has(path)) return []
    seen.add(path)
    return [
      {
        path,
        filename,
        bytes: typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : null,
        gone: gone === true,
      },
    ]
  })
}


/** A query-string value as a list, however many times it came. */
export const allOf = (value: string | readonly string[] | undefined): readonly string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : value

/**
 * The link typed into the form's one link box, or none where both halves were
 * left blank. A name typed with no address is posted as a link with no address,
 * for the boundary to refuse as unreadable: dropped here, it would be a thing
 * the Admin typed that the save then silently lost.
 */
export const postedLinks = (form: FormData): readonly TypedLink[] => {
  const url = typed(form, 'linkUrl') ?? ''
  const label = typed(form, 'linkLabel')
  if (url.trim() === '' && (label ?? '').trim() === '') return []
  return [{ url, label }]
}

/** The items ticked Remove on the edit page. */
export const itemsTicked = (form: FormData): readonly string[] => every(form, 'removeItem')

/**
 * What was typed, as the query string carries it back: every field the form
 * sent, a blank included, so an Admin who cleared the text and was refused sees
 * the blank they typed rather than the text they cleared. Repeated fields repeat.
 */
export const asTyped = (form: FormData): readonly (readonly [string, string])[] => {
  const kept: [string, string][] = []
  for (const field of ['title', 'body', 'linkUrl', 'linkLabel'] as const) {
    const value = typed(form, field)
    if (value !== null) kept.push([field, value])
  }
  for (const field of ['upload', 'removeItem'] as const) {
    for (const value of every(form, field)) kept.push([field, value])
  }
  return kept
}

/** Whether a refusal was over the uploaded files themselves, which are then deleted. */
const aboutTheFiles = (refusal: string): boolean =>
  refusal === 'material.file_type' || refusal === 'material.file_too_large'

/**
 * The query string a refusal goes back with: the code and everything typed,
 * less the uploads when the refusal was about them, since those were deleted.
 */
export const refusedWith = (
  refusal: string,
  form: FormData,
): readonly (readonly [string, string])[] => [
  ['error', refusal],
  ...asTyped(form).filter(([field]) => !(aboutTheFiles(refusal) && field === 'upload')),
]

/**
 * Everything typed, carried back with the uploads the bucket no longer holds
 * marked as such. No code: nothing the Admin did was refused, and the page says
 * what happened on the uploads' own rows.
 */
export const carriedBack = (
  form: FormData,
  gone: readonly string[],
): readonly (readonly [string, string])[] => {
  const missing = new Set(gone)
  return asTyped(form).map(([field, value]): readonly [string, string] => {
    if (field !== 'upload') return [field, value]
    const upload = uploadsIn([value])[0]
    return upload && missing.has(upload.path) ? [field, uploadField({ ...upload, gone: true })] : [field, value]
  })
}

/** Back to a page, optionally saying what happened. */
export const backTo = (
  request: NextRequest,
  path: string,
  params?: Record<string, string> | readonly (readonly [string, string])[],
): NextResponse => {
  const search = new URLSearchParams(
    Array.isArray(params) ? (params as [string, string][]) : (params as Record<string, string>),
  )
  const query = search.size > 0 ? `?${search}` : ''
  return NextResponse.redirect(new URL(`${path}${query}`, request.url), { status: 303 })
}

/**
 * How a route answers, by who sent the form: the page's own script is answered
 * with a `FormAnswer` it acts on in place, and a browser with no script is sent
 * to a page, with what was typed carried on the query string as it always was.
 * `page` is where a refusal goes back to.
 */
export const answering = (request: NextRequest, form: FormData, page: string) => {
  const byScript = request.headers.get(SENT_BY_SCRIPT.header) === SENT_BY_SCRIPT.value
  const answer = (body: FormAnswer) => NextResponse.json(body)
  return {
    landed: (location: string): NextResponse =>
      byScript ? answer({ location }) : backTo(request, location),
    refused: (refusal: MaterialRefused, uploaded: readonly string[]): NextResponse =>
      byScript
        ? answer({ refused: refusal.refusal, forget: aboutTheFiles(refusal.refusal) ? uploaded : [] })
        : backTo(request, page, refusedWith(refusal.refusal, form)),
    gone: (gone: readonly string[]): NextResponse =>
      byScript ? answer({ gone }) : backTo(request, page, carriedBack(form, gone)),
  }
}

/**
 * Deletes the uploads no Material names, and leaves any that one does. The paths
 * came from a form, and a form can be an old one: pressed Back to after a create
 * landed, it posts the path that Material now holds, and deleting it would take
 * that Material's file. Read with the Admin's own client, which sees their own
 * Ministry's items. A read that fails deletes nothing, since the sweep takes a
 * true orphan a day later and a file wrongly deleted is gone.
 */
export const discardUnnamed = async (
  supabase: SupabaseClient,
  paths: readonly string[],
): Promise<void> => {
  if (paths.length === 0) return
  const { data, error } = await supabase.from('material_item').select('path').in('path', [...paths])
  if (error || !data) return
  const named = new Set(data.map((row: { path: string | null }) => row.path))
  await discardMaterialFiles(
    supabase,
    paths.filter((path) => !named.has(path)),
  )
}

/**
 * Runs one edit with files the browser may just have uploaded for it. A refusal
 * over the files themselves deletes them, since the page cannot offer them
 * again; any other refusal keeps them for the page to name again. A fault
 * deletes them too, because a database that is down is not something to render
 * as *pick a title*, and nothing will carry them back. Every refusal an Admin
 * can act on reaches them as a sentence the page owns.
 */
export const applying = async <T>(
  edit: () => Promise<T>,
  uploaded: readonly string[],
  discard: (paths: readonly string[]) => Promise<void>,
  refused: (refusal: MaterialRefused, uploaded: readonly string[]) => NextResponse,
  landed: (outcome: T) => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> => {
  let outcome: T
  try {
    outcome = await edit()
  } catch (error) {
    const refusal = error instanceof MaterialRefused ? error : null
    if (!refusal || aboutTheFiles(refusal.refusal)) await discard(uploaded)
    if (refusal) return refused(refusal, uploaded)
    throw error
  }
  return landed(outcome)
}
