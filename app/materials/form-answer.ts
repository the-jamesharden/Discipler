/**
 * What the create and save routes answer when the page's own script sent the
 * form, rather than the browser. Shared by the routes and the form, and in a
 * module of its own because a server route must not read a constant out of a
 * `'use client'` module, and the form must not be sent `next/server`.
 *
 * The script sends the form so that a refusal can be shown where the Admin is,
 * with every field and every upload still in place. Carried back on a query
 * string instead, a long text and a list of uploads can be more than a URL may
 * hold, and the refusal then loses everything it was meant to keep. Without
 * script there are no uploads, and the routes answer with the page as before.
 */

/** The request header the form's script sends, and the one value it sends. */
export const SENT_BY_SCRIPT = { header: 'x-discipler-form', value: 'script' } as const

export type FormAnswer =
  /** Landed: where the browser goes now. */
  | { readonly location: string }
  /**
   * Refused, with the code the page words. `forget` names the uploads the page
   * is to drop, because the refusal was about them and they have been deleted.
   */
  | { readonly refused: string; readonly forget: readonly string[] }
  /**
   * Not tried: these uploads are no longer in the bucket, because they sat
   * unsaved for longer than the sweep allows. Nothing else was wrong.
   */
  | { readonly gone: readonly string[] }

/**
 * An upload as the page writes it into its hidden field, and as the query string
 * carries it back: where it is, what it was called, its size as the browser saw
 * it, and whether the route found it gone from the bucket.
 */
export const uploadField = (upload: {
  readonly path: string
  readonly filename: string
  readonly bytes: number | null
  readonly gone?: boolean
}): string =>
  JSON.stringify({
    path: upload.path,
    filename: upload.filename,
    bytes: upload.bytes,
    ...(upload.gone ? { gone: true } : {}),
  })
