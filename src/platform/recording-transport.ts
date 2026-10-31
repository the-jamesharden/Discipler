import type { MessageTransport } from '~/service/ports'

/**
 * The transport that writes a text down and sends it nowhere (Exponential launch,
 * ticket 02). Staging runs on it, so a sign-up, a pairing or a check-in can be tried
 * end to end with no phone ringing anywhere; a developer may choose it locally with
 * `MESSAGE_TRANSPORT=record`. Which transport a process uses is decided in the
 * composition root, from `messageTransportKind`.
 *
 * It answers the way Twilio answers a message it accepted, so the sending layer
 * marks the row sent exactly as it would in production. A staging run therefore
 * goes through the same queue, the same consent checks and the same one
 * conversation per phone, and differs only here, at the last step.
 *
 * **What it writes is a whole text, recipient and all**, which production's logs
 * must never hold. That is safe only because nothing but staging and a developer's
 * machine can choose it: `deploymentRefusals` refuses a production deployment set
 * to record.
 */

export interface RecordedText {
  readonly from: string
  readonly to: string
  readonly body: string
}

/**
 * One line a text, the body JSON-quoted so a text of several lines stays one entry
 * in the deployment's log and can be found by its recipient's number.
 */
const toTheLog = (text: RecordedText): void => {
  console.info(`Text recorded, not sent: ${JSON.stringify(text)}`)
}

export const createRecordingTransport = (
  record: (text: RecordedText) => void = toTheLog,
): MessageTransport => ({
  async deliver(from, to, body) {
    record({ from, to, body })
  },
})
