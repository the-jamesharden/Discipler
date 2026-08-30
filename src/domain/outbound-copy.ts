import type { CheckInQuestion } from './check-in'

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
  readonly identifyDelivery: boolean
  /**
   * The opt-out and rate disclosure. A separate decision from `identifyDelivery`
   * because the two are required on overlapping but different occasions: `HELP`
   * identifies delivery without re-disclosing, and a Leader's monthly check-in
   * discloses without identifying.
   */
  readonly discloseOptOut: boolean
}

/**
 * Both flags are stated rather than defaulted. Which occasions require A2P
 * identification and which require the opt-out disclosure is a compliance question,
 * and a caller that did not think about it should not be quietly answered `false`.
 */
export const composeMessage = ({
  ministryName,
  body,
  identifyDelivery,
  discloseOptOut,
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

/**
 * Names in a sentence. Copy branches on how many Participants there are and never
 * on the kind a relationship was formed as, so this is the only place the
 * difference between a one-to-one and a group shows up in wording at all.
 */
const asList = (names: readonly string[]): string => {
  if (names.length <= 1) return names[0] ?? 'them'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
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

/**
 * Where a token becomes something a Person can tap. The shape of the URL is a
 * copy decision -- it is read off a phone and occasionally typed -- so it lives
 * here with the wording, and the host it hangs off is configuration.
 */
export const invitationLink = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/invitation/${token}`

export interface InvitationMessage {
  readonly ministryName: string
  readonly fullName: string
  readonly link: string
}

/**
 * **An invitation, not an assignment.** It says there is something to look at and
 * stops there: who the match is, and which Ministry, are revealed on the page,
 * after the Leader has chosen to open it and before anything is asked of them. A
 * name in the text would have made the reveal a formality.
 *
 * Neither compliance flag is set. This is not first contact -- the Welcome
 * Message was -- and it is not the Starter Message, and those are the occasions
 * the two disclosures name. Sending them on every message is its own kind of spam.
 */
export const invitationMessage = ({
  ministryName,
  fullName,
  link,
}: InvitationMessage): string => {
  const firstName = firstNameOf(fullName)

  return composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      (firstName ? `${firstName}, you’ve been matched with someone to disciple.` : 'You’ve been matched with someone to disciple.') +
      ` Have a look and let us know: ${link}`,
  })
}

export interface StarterMessageToLeader {
  readonly ministryName: string
  /** Everyone they are now meeting with. One name is a one-to-one; several a group. */
  readonly participantNames: readonly string[]
}

/**
 * Reads the live Participant count, never a group-versus-one-to-one flag. One
 * name and four names are the same sentence with a different list in it.
 *
 * It carries no phone number and never will. The Leader has the Roster surface
 * and the relationship in front of them; a number in a text to them is the thing
 * `disclosesPersonId` exists to keep out, and the draft this composes leaves it
 * null.
 */
export const starterMessageToLeader = ({
  ministryName,
  participantNames,
}: StarterMessageToLeader): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: true,
    body: `You’re now meeting with ${asList(participantNames)}. We’ll check in with you each week to see how it’s going.`,
  })

export interface StarterMessageToParticipant {
  readonly ministryName: string
  readonly fullName: string
  /** Their own Invitation Link, which for a Participant leads to declining. */
  readonly declineLink: string
}

/**
 * The first thing a Participant hears about the match, and deliberately the first
 * thing they hear at all after Intake -- nothing reaches them until every Leader
 * has agreed to lead them.
 *
 * **Every sentence has to stand without the contact details.** The Leader's name
 * and number are appended by the sending layer, after the opt-out disclosure and
 * only once contact-sharing consent has been confirmed -- so a body that ended
 * by promising a number would read as a promise interrupted by compliance text
 * when consent was there, and as a dangling colon when it was not. It says what
 * will happen instead, and the details land after it or not at all.
 */
export const starterMessageToParticipant = ({
  ministryName,
  fullName,
  declineLink,
}: StarterMessageToParticipant): string => {
  const firstName = firstNameOf(fullName)

  return composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: true,
    body:
      (firstName ? `Good news, ${firstName} — you’ve been matched.` : 'Good news — you’ve been matched.') +
      ' Your leader will text you soon to arrange when to meet.' +
      ` Not the right fit? Tell us here: ${declineLink}`,
  })
}

export interface AcceptanceReminderMessage {
  readonly ministryName: string
  readonly fullName: string
  readonly link: string
}

/**
 * Two days on, and the Leader has not opened their Invitation Link or has opened
 * it and not finished. One reminder, carrying the link again, because a reminder
 * that made them go back and find the first text is a reminder that costs them
 * more than the thing it is reminding them of.
 *
 * It still reveals nobody. The match is on the page, after the Leader has chosen
 * to open it -- a name here would make the second text say what the first one
 * deliberately did not.
 *
 * **Not framed as a failure.** A Leader who has not answered in two days has a
 * week, not a character flaw, and Discipler never texts anybody to tell them they
 * are late. Neither compliance flag is set, for the same reason the invitation
 * sets neither: this is not first contact and it is not the Starter Message.
 */
export const acceptanceReminderMessage = ({
  ministryName,
  fullName,
  link,
}: AcceptanceReminderMessage): string => {
  const firstName = firstNameOf(fullName)

  return composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      (firstName ? `${firstName}, there’s still someone waiting to hear from you.` : 'There’s still someone waiting to hear from you.') +
      ` Have a look when you can: ${link}`,
  })
}

/**
 * Whom this relationship's turn is about, in a sentence. A Participant's name
 * when there is one, and everyone's when there are more -- the copy branches on
 * how many Participants a relationship has now, never on the kind it was formed
 * as, which is why there is no group question set.
 */
export const checkInSubject = (participantNames: readonly string[]): string =>
  asList([...participantNames])

/**
 * The valid replies to each of the two token questions, written once.
 *
 * Once because the clarification is these sentences said again: a Leader whose
 * reply could not be read is told exactly what the question already offered, and
 * a token renamed in one place and not the other would leave a clarification
 * advertising a reply that no longer works.
 */
const MEETING_REPLIES = 'Reply 1 for yes, 2 for no.'
const SATISFACTION_REPLIES = 'Reply A for outstanding, B for good, C for concern.'

/** The Concern step names no tokens, because it takes prose. */
const CONCERN_DETAIL_REQUEST = 'Please tell us more about the concern.'

export interface MeetingQuestion {
  readonly ministryName: string
  /** As `checkInSubject` composed it. */
  readonly subject: string
  /**
   * The monthly rule -- opt-out language on the first check-in of each calendar
   * month, Leaders only. It rides on the opening question because that is the
   * first check-in message of the month, and it is stated rather than defaulted
   * for the same reason `composeMessage` states both of its flags.
   */
  readonly discloseOptOut: boolean
}

/**
 * The opening question of one relationship's turn, and the only one of the four
 * that names anybody. It offers two tokens and no third option: a Leader who did
 * not meet answers in one character, and nothing here frames that as a failure.
 */
export const meetingQuestion = ({
  ministryName,
  subject,
  discloseOptOut,
}: MeetingQuestion): string =>
  composeMessage({
    ministryName,
    // A Leader is never first contact -- they completed Intake and accepted an
    // invitation to get here -- so the A2P prefix has no occasion to appear.
    identifyDelivery: false,
    discloseOptOut,
    body: `Did you meet with ${subject} this week? ${MEETING_REPLIES}`,
  })

export interface CheckInMessage {
  readonly ministryName: string
}

/**
 * The rest of a conversation, after its opening question: one fixed sentence,
 * naming nobody and carrying no disclosure. Only `meetingQuestion` differs -- it
 * names a subject and it is where the monthly opt-out language rides -- so
 * everything downstream of it shares one envelope and varies only in what it says.
 */
const checkInSentence =
  (body: string) =>
  ({ ministryName }: CheckInMessage): string =>
    composeMessage({ ministryName, identifyDelivery: false, discloseOptOut: false, body })

/**
 * Asked only after a `1`. A meeting that did not happen has no quality to report,
 * and asking anyway would cost a Leader a second reply to say so again.
 *
 * The letters are copy. What a `C` is *stored* as is `concern`, decided in
 * `check-in.ts`, so renaming a token here can never silently re-tokenise a
 * Ministry's history.
 */
export const satisfactionQuestion = checkInSentence(
  `How did the meeting go? ${SATISFACTION_REPLIES}`,
)

/**
 * Asked only after a `C`. The Concern is already recorded by the time this goes
 * out, so an unanswered request for detail loses nothing that was already said.
 */
export const concernDetailRequest = checkInSentence(CONCERN_DETAIL_REQUEST)

export interface CheckInClarification extends CheckInMessage {
  readonly question: CheckInQuestion
}

/**
 * What Discipler says when it could not read a reply: that it could not, and then
 * the valid replies again.
 *
 * It names the replies to the question that is *open*, never the whole set. A
 * Leader who typed prose at the rating question is offered A, B and C, because
 * offering them `1` as well would invite an answer to a question that has already
 * been answered.
 *
 * It does not repeat the question itself. The Leader has it -- they replied to it
 * moments ago -- and re-asking would read as though Discipler had lost the thread
 * rather than one message.
 */
export const checkInClarification = ({ ministryName, question }: CheckInClarification): string =>
  checkInSentence(
    `Sorry, we didn’t catch that. ${
      question === 'met'
        ? MEETING_REPLIES
        : question === 'satisfaction'
          ? SATISFACTION_REPLIES
          : CONCERN_DETAIL_REQUEST
    }`,
  )({ ministryName })

/**
 * Sent after the *final* relationship and nowhere else. Where a thank-you would
 * otherwise fall, the next relationship's opening question is sent instead -- so
 * receiving this is how a Leader knows the conversation is over.
 */
export const checkInThankYou = checkInSentence('Thank you. We’ll check in with you next week.')
