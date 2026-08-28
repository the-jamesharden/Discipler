/**
 * Every message Discipler sends is the Ministry's voice. Discipler is delivery and
 * never the speaker: it does not name itself in copy, and no message is phrased as
 * reporting to a third party about the Ministry.
 *
 * The one exception is the A2P compliance prefix, which carriers require and which
 * therefore has to name the delivery brand. It **stacks** in front of the Ministry
 * prefix rather than replacing it -- `Discipler: ABC Church: ...` -- so the Person
 * still reads their own church as the sender.
 */

/** The delivery brand, named only where compliance requires it. */
const DELIVERY_PREFIX = 'Discipler:'

/**
 * The opt-out and rate disclosure. Carried on first contact, on the Starter
 * Message, again after a thirty-day Silence Gap, and on the first check-in of each
 * calendar month -- not on every message, which would be its own kind of spam.
 */
const OPT_OUT_DISCLOSURE =
  'Msg & data rates may apply. Reply STOP to opt out, HELP for help.'

export interface MessageComposition {
  readonly ministryName: string
  readonly body: string
  /**
   * A2P identification. Required on opt-in messaging, on the first message ever
   * sent to a Person, on the first after a thirty-day Silence Gap, and on `HELP`.
   */
  readonly identifyDelivery?: boolean
  /**
   * The opt-out and rate disclosure. A separate decision from `identifyDelivery`
   * because the two are required on overlapping but different occasions: `HELP`
   * identifies delivery without re-disclosing, and a Leader's monthly check-in
   * discloses without identifying.
   */
  readonly discloseOptOut?: boolean
}

export const composeMessage = ({
  ministryName,
  body,
  identifyDelivery = false,
  discloseOptOut = false,
}: MessageComposition): string => {
  const spoken = `${ministryName}: ${discloseOptOut ? `${body} ${OPT_OUT_DISCLOSURE}` : body}`
  return identifyDelivery ? `${DELIVERY_PREFIX} ${spoken}` : spoken
}

export interface WelcomeMessage {
  readonly ministryName: string
  readonly fullName: string
}

/**
 * The first name, for a greeting. Discipler holds one `full_name` because that is
 * what a spreadsheet column carries, and splitting it is a copy decision rather
 * than a model one -- so it happens here and nowhere near the Person record.
 */
const firstNameOf = (fullName: string): string | null =>
  fullName.trim().split(/\s+/)[0] || null

/**
 * Sent the moment a Person completes Intake, before any relationship exists. It is
 * the first thing Discipler has ever sent them, so it identifies delivery and
 * carries the opt-out and rate disclosure.
 *
 * It promises only what the product will actually do next. A Person who has just
 * consented is waiting on a pairing decision an Admin has not made yet, and saying
 * anything firmer here would be a commitment nobody has made on their behalf.
 */
export const welcomeMessage = ({ ministryName, fullName }: WelcomeMessage): string => {
  const firstName = firstNameOf(fullName)

  return composeMessage({
    ministryName,
    identifyDelivery: true,
    discloseOptOut: true,
    body:
      (firstName ? `Thanks, ${firstName} — you’re all set.` : 'You’re all set.') +
      ' We’ll text you once you’ve been matched with someone to meet with.',
  })
}

export interface SharedContact {
  readonly fullName: string
  readonly phone: string
}

/**
 * Appends the contact details a message discloses. Called by the sending layer at
 * dispatch, and only once contact-sharing consent has been confirmed -- the
 * decision is the sending layer's, the wording is this module's.
 *
 * Nothing composes the number into `body` at enqueue, because a body that already
 * carried it would leave the send-time check nothing to withhold.
 */
export const withSharedContact = (body: string, contact: SharedContact): string =>
  `${body} ${contact.fullName}: ${contact.phone}`
