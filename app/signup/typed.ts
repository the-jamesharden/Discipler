/**
 * What was typed on page two, kept across page one (Exponential launch, ticket 15).
 *
 * "Use a different email" and a lapsed pass both go back through the human check, and
 * the page comes back empty after a full load. The phone is on the old attempt's row,
 * which the new attempt cannot read, and it does not belong in an address. So the tab
 * keeps both until the address is proven: `sessionStorage`, which goes with the tab, on
 * a phone that may be handed back at a booth.
 *
 * Where the browser keeps nothing the person just types them again.
 */

const KEY = 'discipler.signup.typed'

export interface Typed {
  readonly email: string
  readonly phone: string
}

export const rememberTyped = (typed: Typed): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(typed))
  } catch {
    // Storage refused, as a private window can.
  }
}

export const typedEarlier = (): Typed | null => {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<Typed> | null
    return typeof kept?.email === 'string' && typeof kept.phone === 'string'
      ? { email: kept.email, phone: kept.phone }
      : null
  } catch {
    return null
  }
}

export const forgetTyped = (): void => {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing was kept, then.
  }
}
