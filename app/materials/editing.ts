import { NextResponse, type NextRequest } from 'next/server'
import { MaterialRefused } from '~/domain/errors'
import { readPdfUpload, type MaterialPdf } from '~/domain/materials'

/**
 * What the create, save and remove routes share. Each is an ordinary form POST,
 * like the goal edits and the settings save, so the whole screen works before
 * JavaScript has loaded -- and each ends on a page an Admin can read, with
 * anything the edit has to say carried in the query string under names the
 * page reserves for it.
 *
 * A refusal keeps what was typed: the title and the text travel back on the
 * query string so the page can fill the boxes in again. A file cannot be
 * carried back -- a browser does not let a page pre-select one -- and does not
 * need to be, because the one refusal the spec draws is a submission with
 * neither text nor PDF, where there is no file to keep.
 */

/** A field as it arrived, or null where the form sent none. Never coerced: the boundary decides. */
export const typed = (form: FormData, field: string): string | null => {
  const value = form.get(field)
  return typeof value === 'string' ? value : null
}

/**
 * The file an Admin chose, or null where the box was left empty. An empty file
 * input still sends a part: a `File` with no name and no bytes, which is the
 * browser saying *nothing chosen* and is read as such.
 */
export const chosenFile = (form: FormData, field: string): File | null => {
  const value = form.get(field)
  return value instanceof File && value.size > 0 ? value : null
}

/** What was typed, as the query string carries it back: only the fields that said anything. */
export const asTyped = (form: FormData): Record<string, string> => {
  const kept: Record<string, string> = {}
  for (const field of ['title', 'body'] as const) {
    const value = typed(form, field)
    if (value !== null && value !== '') kept[field] = value
  }
  return kept
}

/** Back to a page, optionally saying what happened. */
export const backTo = (
  request: NextRequest,
  path: string,
  params?: Record<string, string>,
): NextResponse => {
  const query = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params)}` : ''
  return NextResponse.redirect(new URL(`${path}${query}`, request.url), { status: 303 })
}

/**
 * Refuses a chosen file before a byte of it reaches the bucket, as a code the
 * page has a sentence for, or null where it may be stored. The rule is the
 * domain's; this only carries its answer.
 */
export const refusedUpload = (file: File): string | null => readPdfUpload(file)

/**
 * Runs one edit with an object that may have just been uploaded for it, and
 * deletes that object when the edit does not land -- a refusal or a fault, both
 * leave an orphan in the bucket otherwise. Every refusal an Admin can act on
 * reaches them as a sentence the page owns; anything else is thrown, because a
 * database that is down is not something to render as *pick a title*.
 */
export const applying = async <T>(
  edit: () => Promise<T>,
  uploaded: MaterialPdf | null,
  discard: (path: string) => Promise<void>,
  refused: (refusal: MaterialRefused) => NextResponse,
  landed: (outcome: T) => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> => {
  let outcome: T
  try {
    outcome = await edit()
  } catch (error) {
    if (uploaded) await discard(uploaded.path)
    if (error instanceof MaterialRefused) return refused(error)
    throw error
  }
  return landed(outcome)
}
