import type { PhoneCode } from '~/domain/phone-check'
import type { PhoneNumber } from '~/domain/roster'
import type { PhoneVerifier } from '~/service/ports'

/**
 * The phone verifier that writes a code down and texts it nowhere (Exponential
 * launch, ticket 02), as `recording-transport.ts` is for a text. Verify sends from
 * Twilio's own senders, outside the message transport, so recording texts alone
 * would still put a real code on a real phone; this is chosen beside the recording
 * transport, from the same `messageTransportKind`.
 *
 * The code it accepts is a constant rather than one it made up and remembered:
 * a serverless instance that checks the code is not the one that sent it, and
 * nothing but staging and a developer's machine can choose this verifier, since
 * `deploymentRefusals` refuses a production deployment set to record.
 */

export const RECORDED_PHONE_CODE = '000000' as PhoneCode

export interface RecordedPhoneCode {
  readonly to: PhoneNumber
  readonly code: PhoneCode
}

const toTheLog = (sent: RecordedPhoneCode): void => {
  console.info(`Verify code recorded, not sent: ${JSON.stringify(sent)}`)
}

export const createRecordingVerifier = (
  record: (sent: RecordedPhoneCode) => void = toTheLog,
): PhoneVerifier => ({
  async sendCode(to) {
    record({ to, code: RECORDED_PHONE_CODE })
    return { sent: `recorded-${crypto.randomUUID()}` }
  },
  async checkCode(_verificationSid, code) {
    return code === RECORDED_PHONE_CODE ? 'approved' : 'wrong'
  },
  async cancel() {},
})
