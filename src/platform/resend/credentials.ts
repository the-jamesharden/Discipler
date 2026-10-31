/**
 * Resend is a delivery vendor and not a domain concept, so what it needs lives here
 * beside the adapter that uses it and nowhere else -- the shape
 * `src/platform/twilio/credentials.ts` has, for the same reason.
 *
 * Both are set on the Vercel Production environment only, by the Resend
 * integration from the Marketplace, with a sending-only key restricted to the
 * domain. Preview and local development have neither, so nothing they run can send
 * an email: a send there throws, and the caller treats it as any refusal.
 */

export interface ResendCredentials {
  readonly apiKey: string
  /** The domain every email is sent from, `notify.trydiscipler.com` in production. */
  readonly sendingDomain: string
}

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not set. Discipler cannot send email without it.`)
  }
  return value
}

const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export const resendCredentials = (): ResendCredentials => {
  const sendingDomain = required('RESEND_EMAIL_DOMAIN').toLowerCase()
  if (!HOSTNAME.test(sendingDomain)) {
    // It becomes the From address, so it is checked rather than trusted.
    throw new Error('RESEND_EMAIL_DOMAIN is not a domain. Discipler cannot send email from it.')
  }
  return { apiKey: required('RESEND_API_KEY'), sendingDomain }
}
