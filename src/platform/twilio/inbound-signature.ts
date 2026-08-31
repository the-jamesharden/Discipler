import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Proving an inbound callback came from Twilio.
 *
 * The webhook is reached with no session, no cookie and no token -- only the
 * number in the payload says who is speaking, and a number is public. Without this,
 * anybody who knows a congregant's mobile can post a `STOP` that opts them out of
 * their Ministry, a `PAUSE` that suspends a relationship, or a forged `C` that
 * raises a Concern against somebody's name. None of those are recoverable by the
 * congregant, and two of them are silent.
 *
 * **No SDK**, for the reason `message-transport.ts` gives for not having one: the
 * whole of the algorithm is thirty lines of `node:crypto`, and a dependency that
 * wrapped it would be a second thing to keep current.
 *
 * Twilio's scheme, which this implements exactly: take the full URL it called,
 * append each POST parameter as `key + value` with the keys sorted, HMAC-SHA1 the
 * result with the account's auth token, and base64 it. The signature arrives in
 * `X-Twilio-Signature`.
 */

/**
 * The signature Twilio would have sent for this call. Exported because the tests
 * sign their own requests with it rather than being handed a way past the check --
 * a test route around the guard is a guard that can be off in production and green
 * in CI.
 */
export const twilioSignature = (
  authToken: string,
  url: string,
  parameters: Readonly<Record<string, string>>,
): string => {
  // Sorted by key, because Twilio sorts and the concatenation is order-sensitive.
  // `sort()` on the keys is byte order, which is what the vendor does too.
  const signed = Object.keys(parameters)
    .sort()
    .reduce((accumulated, key) => `${accumulated}${key}${parameters[key]}`, url)

  return createHmac('sha1', authToken).update(Buffer.from(signed, 'utf-8')).digest('base64')
}

/**
 * Whether the offered signature is the one this call should carry.
 *
 * Compared in constant time, for the reason `/cron/tick` gives: a comparison that
 * returns early leaks the expected value one character at a time to anybody willing
 * to time the responses, and a webhook is a surface anybody can call as often as
 * they like.
 */
export const signatureMatches = (
  authToken: string,
  offered: string | null,
  url: string,
  parameters: Readonly<Record<string, string>>,
): boolean => {
  if (!offered) return false

  const expected = twilioSignature(authToken, url, parameters)

  // `timingSafeEqual` throws on a length mismatch, which is itself the leak it
  // exists to prevent -- so the lengths are checked separately, revealing only what
  // the header's own size already does.
  const a = Buffer.from(offered)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Both forwarded headers are lists, because each proxy in a chain appends to what it
 * was given. The first entry is the one nearest the caller, which is what Twilio
 * actually dialled; everything after it is an internal hop.
 */
const nearestTheCaller = (value: string | null): string | null =>
  value === null ? null : (value.split(',')[0]!.trim() || null)

/**
 * The URL Twilio signed, which is the one it called rather than the one this
 * process thinks it is serving.
 *
 * Behind a proxy -- Vercel, and any other deployment that terminates TLS in front
 * of the app -- `request.url` is the internal address: `http` where the caller used
 * `https`, and sometimes an internal host. Signing over that produces a mismatch on
 * every genuine callback, which is the failure mode that gets a signature check
 * disabled rather than fixed, so the forwarded headers are preferred where they
 * exist.
 */
export const calledUrl = (requestUrl: string, headers: Headers): string => {
  const url = new URL(requestUrl)
  const forwardedHost =
    nearestTheCaller(headers.get('x-forwarded-host')) ?? nearestTheCaller(headers.get('host'))
  const forwardedProto = nearestTheCaller(headers.get('x-forwarded-proto'))

  // `host` is set rather than `hostname`, because the forwarded value may carry a
  // port -- and the port is cleared first, since assigning a host with no port in it
  // leaves the previous one in place. An internal `:3000` surviving onto the public
  // hostname would mismatch every genuine callback.
  if (forwardedHost) {
    url.port = ''
    url.host = forwardedHost

    // `URL.host` is a setter that *silently ignores* a value it cannot parse, so a
    // failed assignment leaves the internal address in place and reads as success.
    // That is the worst of the three outcomes: every genuine callback refused, with
    // a signature mismatch as the only symptom and nothing naming the cause. Better
    // to fail where the fault is.
    if (url.host !== forwardedHost.toLowerCase()) {
      throw new Error(`Could not build the called URL: forwarded host ${forwardedHost}`)
    }
  }

  if (forwardedProto) url.protocol = `${forwardedProto}:`

  return url.toString()
}
