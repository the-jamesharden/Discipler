import { COULD_NOT_REACH } from './copy'

/**
 * How sign-up's forms call their routes (Exponential launch, tickets 15 and 16). The
 * routes answer JSON and the page stays on screen whatever comes back, so a refusal
 * and a connection that dropped both end as a sentence to show.
 */

export type Answer<Body> =
  | { readonly ok: true; readonly body: Body }
  | {
      readonly ok: false
      /** The route's code, or null when no route answered. */
      readonly refusal: string | null
      readonly message: string
      readonly resendInSeconds?: number
    }

export const postToSignUp = async <Body>(path: string, fields: Record<string, string> = {}): Promise<Answer<Body>> => {
  try {
    const response = await fetch(path, { method: 'POST', body: new URLSearchParams(fields) })
    const body = (await response.json()) as Body & {
      refusal?: unknown
      message?: unknown
      resendInSeconds?: unknown
    }
    if (response.ok) return { ok: true, body }
    if (typeof body.refusal === 'string' && typeof body.message === 'string') {
      return {
        ok: false,
        refusal: body.refusal,
        message: body.message,
        ...(typeof body.resendInSeconds === 'number' ? { resendInSeconds: body.resendInSeconds } : {}),
      }
    }
  } catch {
    // A dropped connection, or sign-up shut mid-way: a 404 has no JSON to read.
  }
  return { ok: false, refusal: null, message: COULD_NOT_REACH }
}
