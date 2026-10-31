import type { PhoneCode } from '~/domain/phone-check'
import type { PhoneNumber } from '~/domain/roster'
import type { PhoneCodeSending, PhoneCodeVerdict, PhoneVerifier } from '~/service/ports'
import { twilioVerifySettings, type TwilioVerifySettings } from './credentials'

/**
 * Twilio Verify, and the one place it exists (Exponential launch, ticket 09).
 *
 * No SDK, for the reason `message-transport.ts` gives: the whole of what is used
 * is three form-encoded POSTs. Verify texts from Twilio's own senders, not from
 * Discipler's numbers, so nothing here goes through the outbound queue, the
 * texting gate or the campaign.
 *
 * The answers Twilio gives that mean something about the code or the number are
 * returned as values; anything else is thrown as `PhoneVerifierFailed`, with
 * Twilio's own reason, for the service to log.
 */

/** Twilio said something that is not an answer to the question asked. */
export class PhoneVerifierFailed extends Error {
  constructor(
    readonly status: number,
    /** Twilio's own numeric code where it sent one. */
    readonly code: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'PhoneVerifierFailed'
  }
}

/** The service's geographic permissions refused the number's country. */
const BLOCKED_BY_GEO_PERMISSIONS = 60605
/** A number Twilio cannot text: invalid, or a landline. */
const UNDELIVERABLE = new Set([60200, 60205, 21211, 21614])
/** The verification is not there: expired, approved already, or canceled. */
const NOT_FOUND = 20404
/** Twilio's own limit of checks on one verification. */
const MAX_CHECK_ATTEMPTS = 60202

interface TwilioAnswer {
  readonly status: number
  readonly ok: boolean
  readonly body: { readonly [key: string]: unknown }
}

/** Built lazily per request, as the message transport's credentials are. */
export const createTwilioVerifier = (
  settings: () => TwilioVerifySettings = twilioVerifySettings,
): PhoneVerifier => {
  const post = async (path: string, form: Record<string, string>): Promise<TwilioAnswer> => {
    const { accountSid, authToken, serviceSid } = settings()
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form),
      },
    )
    // Read defensively: an error page from something in front of Twilio is not
    // JSON, and the status is the real information then.
    const body = await response
      .json()
      .then((payload: unknown) => (payload && typeof payload === 'object' ? payload : {}) as TwilioAnswer['body'])
      .catch(() => ({}))
    return { status: response.status, ok: response.ok, body }
  }

  const codeOf = (answer: TwilioAnswer): number | null =>
    typeof answer.body.code === 'number' ? answer.body.code : null

  const failure = (answer: TwilioAnswer, what: string) =>
    new PhoneVerifierFailed(
      answer.status,
      codeOf(answer),
      typeof answer.body.message === 'string'
        ? answer.body.message
        : `Twilio Verify refused to ${what} with ${answer.status}`,
    )

  return {
    async sendCode(to: PhoneNumber): Promise<PhoneCodeSending> {
      const answer = await post('Verifications', { To: to, Channel: 'sms' })
      if (answer.ok && typeof answer.body.sid === 'string') return { sent: answer.body.sid }

      const code = codeOf(answer)
      if (code === BLOCKED_BY_GEO_PERMISSIONS) return { refused: 'outside_permitted_countries' }
      if (code !== null && UNDELIVERABLE.has(code)) return { refused: 'undeliverable' }
      throw failure(answer, 'send a code')
    },

    async checkCode(verificationSid: string, code: PhoneCode): Promise<PhoneCodeVerdict> {
      const answer = await post('VerificationCheck', { VerificationSid: verificationSid, Code: code })
      if (answer.ok) return answer.body.status === 'approved' ? 'approved' : 'wrong'

      if (answer.status === 404 || codeOf(answer) === NOT_FOUND) return 'gone'
      if (codeOf(answer) === MAX_CHECK_ATTEMPTS) return 'tries_used_up'
      throw failure(answer, 'check a code')
    },

    async cancel(verificationSid: string): Promise<void> {
      const answer = await post(`Verifications/${encodeURIComponent(verificationSid)}`, {
        Status: 'canceled',
      })
      if (answer.ok || answer.status === 404) return
      throw failure(answer, 'cancel a verification')
    },
  }
}
