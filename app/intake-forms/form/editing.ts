import { NextResponse, type NextRequest } from 'next/server'
import { IntakeFormRefused } from '~/domain/errors'
import { INTAKE_PATHS, isOneOf, type IntakePath } from '~/domain/intake'
import { currentAdmin } from '~/platform/supabase/current-admin'
import type { SignedInAdmin } from '~/service/ports'

/**
 * What the form editor's routes share (Pastor feedback, ticket 11). Each is an
 * ordinary form POST, like the goal edits beside them, so the editor works before
 * JavaScript has loaded -- and each ends back on the editor, on the form it was
 * editing, at the row or page it was about.
 *
 * Anything an edit has to say travels in the query string under names the page
 * reserves for the editor: `form` for which one is shown, `formSaved` for what was
 * just saved, `formError` for why an edit was refused, and `question`,
 * `renaming`, `writing` and `addingPage` for what is open.
 */

const PAGE = '/intake-forms'

/** Back to the editor, on this form, optionally saying what happened. */
export const backToTheEditor = (
  request: NextRequest,
  form: IntakePath,
  params: Record<string, string> = {},
  anchor = 'form-editor',
): NextResponse =>
  NextResponse.redirect(
    new URL(`${PAGE}?${new URLSearchParams({ form, ...params })}#${anchor}`, request.url),
    { status: 303 },
  )

/** A field as the form sent it, or the empty string. */
export const typed = (submitted: FormData, name: string): string => {
  const value = submitted.get(name)
  return typeof value === 'string' ? value : ''
}

/** A box typed one to a line, as its lines. The empty ones are the domain's to skip. */
export const linesOf = (box: string): readonly string[] => box.split(/\r?\n/)

/**
 * The signed-in Admin, the form posted and which of the two forms it is about --
 * or a redirect for a request that is none of those. A form named nowhere is not
 * an edit an Admin can act on, so it goes back to the page unchanged rather than
 * reaching the boundary as a command about no form at all.
 */
export const anEditOf = async (
  request: NextRequest,
): Promise<
  | { readonly admin: SignedInAdmin; readonly submitted: FormData; readonly form: IntakePath }
  | NextResponse
> => {
  const admin = await currentAdmin()
  const back = NextResponse.redirect(new URL(PAGE, request.url), { status: 303 })
  if (!admin) return back

  const submitted = await request.formData()
  const form = typed(submitted, 'form')
  if (!isOneOf(INTAKE_PATHS, form)) return back

  return { admin, submitted, form }
}

/**
 * Runs one edit and lands the Admin back on the editor either way: where `saved`
 * says on success, and with the refusal's code on `refused`'s terms otherwise.
 * Anything else is thrown: a database that is down is not something to render as
 * *that question is no longer on this form*.
 */
export const editing = async (
  request: NextRequest,
  form: IntakePath,
  edit: () => Promise<unknown>,
  saved: { readonly params: Record<string, string>; readonly anchor: string },
  refused: { readonly params: Record<string, string>; readonly anchor: string },
): Promise<NextResponse> => {
  try {
    await edit()
  } catch (error) {
    if (error instanceof IntakeFormRefused) {
      return backToTheEditor(request, form, { ...refused.params, formError: error.refusal }, refused.anchor)
    }
    throw error
  }
  return backToTheEditor(request, form, saved.params, saved.anchor)
}
