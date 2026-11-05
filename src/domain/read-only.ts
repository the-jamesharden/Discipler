/**
 * Which requests a church whose subscription has ended is refused (Exponential launch,
 * ticket 33): "every Admin page is read-only", and the rule is a list of what stays open,
 * so a route added later is refused unless somebody says otherwise.
 *
 * What stays open is what is not the church's work: signing in and out, an Admin's own
 * password and phone, the Help menu's form, everything somebody reaches from a text
 * ("Links people were already texted keep working and their answers are kept", James,
 * triage 2026-10-31), what Stripe, Twilio and the clock send, and Billing, which is how a
 * church comes back.
 */
const STAY_OPEN: readonly string[] = [
  '/account',
  '/auth',
  '/cron',
  '/help',
  '/intake',
  '/invitation',
  '/login',
  '/material',
  '/r',
  '/settings/billing',
  '/setup',
  '/signup',
  '/sms',
  '/stripe',
]

const isUnder = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`)

const READS: readonly string[] = ['GET', 'HEAD', 'OPTIONS']

/** Whether this request would change a church's work, and so is refused while it has ended. */
export const changesTheChurchsWork = (method: string, path: string): boolean =>
  !READS.includes(method.toUpperCase()) && !STAY_OPEN.some((open) => isUnder(path, open))

/**
 * Where a refused press goes: back to the page it came from, whose banner says why, and
 * only ever on this site.
 */
export const backFromARefusal = (referrer: string | null, host: string | null): string => {
  if (referrer) {
    try {
      const from = new URL(referrer)
      if (from.host === host) return `${from.pathname}${from.search}`
    } catch {
      // Not an address: nothing to go back to.
    }
  }
  return '/overview'
}
