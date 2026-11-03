import type { HumanCheckAction } from '~/domain/sign-up-attempt'
import type { HumanCheck } from '~/service/ports'

/**
 * The one place Cloudflare Turnstile exists (Exponential launch, ticket 11). It
 * asks Cloudflare about one token and answers yes or no, so everything above it is
 * written against *this visitor passed the check*.
 *
 * **It fails closed.** Unset secret, Cloudflare not answering, an answer that is
 * not what was asked for: all no, because a yes here is what lets Discipler spend
 * money. A token is good once, so nothing is retried, and a yes needs all three of
 * Cloudflare's own word, the hostname this deployment serves and the action the
 * caller is spending it on: a token solved on a page somebody copied, or issued for
 * the other step, is a real token and still a no.
 *
 * Nothing here logs a token. What it logs is what somebody can act on: a missing
 * secret, a Cloudflare that did not answer, a key Cloudflare refused.
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Cloudflare refuses a longer token, so a longer one is not worth a request. */
const TOKEN_LONGEST = 2048

/** A person is waiting on the page, and no answer in time is a no. */
const ANSWER_WITHIN_MS = 5_000

/** The errors that mean Discipler's key is wrong rather than the visitor's token. */
const OUR_KEY_IS_WRONG = new Set(['missing-input-secret', 'invalid-input-secret'])

export interface TurnstileConfig {
  readonly secret: string
  /** The host this deployment serves, which a token must have been solved on. */
  readonly hostname: string
}

const hostnameOf = (url: string | undefined): string | null => {
  try {
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}

/** Read per check, so a deployment with no key runs every page and refuses only this. */
export const turnstileConfig = (): TurnstileConfig | null => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  const hostname = hostnameOf(process.env.NEXT_PUBLIC_APP_URL)
  return secret && hostname ? { secret, hostname } : null
}

export const createTurnstile = (
  config: () => TurnstileConfig | null = turnstileConfig,
): HumanCheck => ({
  async verify(token: string, action: HumanCheckAction) {
    const settings = config()
    if (!settings) {
      console.error('TURNSTILE_SECRET_KEY or NEXT_PUBLIC_APP_URL is not set, so every human check is refused.')
      return false
    }
    if (!token || token.length > TOKEN_LONGEST) return false

    let payload: { success?: unknown; hostname?: unknown; action?: unknown; 'error-codes'?: unknown }
    try {
      const response = await fetch(SITEVERIFY, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: settings.secret, response: token }),
        signal: AbortSignal.timeout(ANSWER_WITHIN_MS),
      })
      // `null` is valid JSON, and a no rather than a thrown error is the promise here.
      payload = ((await response.json()) ?? {}) as typeof payload
    } catch (error) {
      console.error(`Cloudflare did not answer a human check: ${error instanceof Error ? error.name : 'unknown'}`)
      return false
    }

    const codes = Array.isArray(payload['error-codes']) ? (payload['error-codes'] as unknown[]) : []
    const ourKey = codes.filter((code) => typeof code === 'string' && OUR_KEY_IS_WRONG.has(code))
    if (ourKey.length > 0) console.error(`Cloudflare refused Discipler's key: ${ourKey.join(', ')}`)

    return payload.success === true && payload.hostname === settings.hostname && payload.action === action
  },
})
