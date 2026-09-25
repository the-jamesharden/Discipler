import { NextResponse, type NextRequest } from 'next/server'
import { MaterialRefused } from '~/domain/errors'
import type { TypedLink } from '~/domain/commands'

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

/** One file the browser uploaded, as the page posts it back: where, and what it was called. */
export interface PostedUpload {
  readonly path: string
  readonly filename: string
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
 * as JSON. The same reading for a form posted and a refusal carried back.
 */
export const uploadsIn = (values: readonly string[]): readonly PostedUpload[] =>
  values.flatMap((value) => {
    try {
      const parsed: unknown = JSON.parse(value)
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as PostedUpload).path === 'string' &&
        typeof (parsed as PostedUpload).filename === 'string'
      ) {
        return [{ path: (parsed as PostedUpload).path, filename: (parsed as PostedUpload).filename }]
      }
    } catch {
      // Not JSON: not something the page wrote.
    }
    return []
  })

/** A query-string value as a list, however many times it came. */
export const allOf = (value: string | readonly string[] | undefined): readonly string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : value

/** The link typed into the form's one link box, or none where the address was left blank. */
export const postedLinks = (form: FormData): readonly TypedLink[] => {
  const url = typed(form, 'linkUrl') ?? ''
  return url.trim() === '' ? [] : [{ url, label: typed(form, 'linkLabel') }]
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

/**
 * The query string a refusal goes back with: the code and everything typed,
 * less the uploads when the refusal was about them, since those were deleted.
 */
export const refusedWith = (
  refusal: string,
  form: FormData,
): readonly (readonly [string, string])[] => {
  const aboutTheFiles = refusal === 'material.file_type' || refusal === 'material.file_too_large'
  return [
    ['error', refusal],
    ...asTyped(form).filter(([field]) => !(aboutTheFiles && field === 'upload')),
  ]
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
  refused: (refusal: MaterialRefused) => NextResponse,
  landed: (outcome: T) => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> => {
  let outcome: T
  try {
    outcome = await edit()
  } catch (error) {
    const aboutTheFiles =
      error instanceof MaterialRefused &&
      (error.refusal === 'material.file_type' || error.refusal === 'material.file_too_large')
    if (!(error instanceof MaterialRefused) || aboutTheFiles) await discard(uploaded)
    if (error instanceof MaterialRefused) return refused(error)
    throw error
  }
  return landed(outcome)
}
