import type { CheckInQuestion } from './check-in'
import type { MinistryId } from './ids'
import type { RelationshipKeyword } from './keywords'

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

/**
 * The same shape with `or` instead of `and`, for a list the reader is being asked
 * to pick **one** of. *Reply 1, 4, 8 and 12* asks for four replies; the pause
 * confirmation is asking for one.
 *
 * The Oxford comma is there because the spec's own wording has it -- *reply 1, 4,
 * 8, or 12* -- and a confirmation is the one message where the numbers offered have
 * to be scannable at a glance.
 */
const asChoices = (options: readonly string[]): string => {
  if (options.length <= 1) return options[0] ?? ''
  return `${options.slice(0, -1).join(', ')}, or ${options[options.length - 1]}`
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
 * The configured host, with any trailing slash taken off. Every link below hangs off
 * it, and a base URL is as likely to be configured with the slash as without.
 */
const host = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

/**
 * Where a token becomes something a Person can tap. The shape of the URL is a
 * copy decision -- it is read off a phone and occasionally typed -- so it lives
 * here with the wording, and the host it hangs off is configuration.
 */
export const invitationLink = (baseUrl: string, token: string): string =>
  `${host(baseUrl)}/invitation/${token}`

/**
 * Where an Intake link becomes something a Person can tap. The same shape as an
 * Invitation Link and for the same reason -- it is read off a phone and
 * occasionally typed -- and it hangs off the same configured host.
 *
 * Nothing composes this one into a message. An Admin copies it and sends it
 * themselves, because the thing it most often exists to correct is the number
 * Discipler would have texted it to.
 */
export const intakeReopenLink = (baseUrl: string, token: string): string =>
  `${host(baseUrl)}/intake/reopen/${token}`

/**
 * The one Intake link a whole Ministry hands out. It names the Ministry and carries
 * no token, which is what makes it printable: it goes on a bulletin and on a screen
 * in front of a room, so there is nothing on it that could be secret from anybody.
 *
 * Nothing composes this one into a message either. An Admin reads it off the Roster
 * and sends it in whatever conversation they are already having.
 */
export const ministryIntakeLink = (baseUrl: string, ministry: MinistryId): string =>
  `${host(baseUrl)}/intake/${ministry}`

/**
 * The same link, for the QR code. The one difference between them is `?via=qr`, and
 * that difference is the whole reason there are two functions and not one with a
 * flag: the form turns it into `qr_code` rather than `pastor_link`, and a compliance
 * review asks which of those a Person's consent was recorded under.
 */
export const ministryIntakeQrLink = (baseUrl: string, ministry: MinistryId): string =>
  `${ministryIntakeLink(baseUrl, ministry)}?via=qr`

export interface InvitationMessage {
  readonly ministryName: string
  readonly fullName: string
  /**
   * The Ministry's own word for the role being offered. In noun position and
   * never as a verb: *someone to mentor* reads well and *someone to discipler*
   * does not, and this word is whatever a Ministry typed rather than one
   * Discipler picked out for them.
   */
  readonly leaderNoun: string
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
  leaderNoun,
  link,
}: InvitationMessage): string => {
  const firstName = firstNameOf(fullName)
  const matched = `you’ve been matched with someone to be their ${leaderNoun}.`

  return composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      (firstName ? `${firstName}, ${matched}` : `${matched[0]!.toUpperCase()}${matched.slice(1)}`) +
      ` Have a look and let us know: ${link}`,
  })
}

export interface StarterMessageToLeader {
  readonly ministryName: string
  /** Everyone they are now meeting with. One name is a one-to-one; several a group. */
  readonly participantNames: readonly string[]
  /** What this Ministry calls the reader's own role. */
  readonly leaderNoun: string
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
  leaderNoun,
}: StarterMessageToLeader): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: true,
    // The reader's *own* role, which is one person however many are on the other
    // side of it -- so the noun stays singular and nothing has to pluralise a
    // word a Ministry typed. `asList` puts the group inside the possessive, which
    // is the one shape that reads for both a one-to-one and a group of four.
    body: `You’re now ${asList(participantNames)}’s ${leaderNoun}. We’ll check in with you each week to see how it’s going.`,
  })

export interface StarterMessageToParticipant {
  readonly ministryName: string
  /** Who will be reaching out. Named in the body; their number never is. */
  readonly leaderNames: readonly string[]
  /** What this Ministry calls the reader's own role. */
  readonly participantNoun: string
}

/**
 * The first thing a Participant hears about the match, and deliberately the first
 * thing they hear at all after Intake -- nothing reaches them until every Leader
 * has agreed to lead them.
 *
 * **It names the Leader and never their number.** Somebody about to be contacted
 * by a stranger is owed the stranger's name, and a Participant who does not have
 * it cannot tell a discipleship leader from a wrong number when the text arrives.
 * The number is a different thing and is not sent at all: the Leader reaches out,
 * so the Participant has never needed one, and the way an Admin reaches a
 * Participant is Nudge, which reveals a number to a person rather than texting it
 * to one. This message therefore discloses nobody -- `disclosesPersonId` is null
 * on it -- and the send-time contact-sharing check has nothing to withhold.
 *
 * One message per Participant however many Leaders a group has, because the body
 * names them all and nothing in it is one Leader's decision to make.
 */
export const starterMessageToParticipant = ({
  ministryName,
  leaderNames,
  participantNoun,
}: StarterMessageToParticipant): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: true,
    // The reader's own role again, for the reason the Leader's message gives:
    // *David and Ruth is your mentor* is what a group produces from the other
    // shape, and pluralising a word a Ministry typed is not something copy can do
    // reliably.
    body:
      `Great news! You’re now ${asList(leaderNames)}’s ${participantNoun}, and ` +
      'they will reach out to you soon to set up a time to meet and kick things off!',
  })

export interface ResumedMessage {
  readonly ministryName: string
  /** The people on the other side of the relationship, from the reader's side. */
  readonly withNames: readonly string[]
}

/**
 * What a resumed relationship says, to everyone in it.
 *
 * Deliberately not the Starter Message. *Great news, you have been paired* is
 * true on the day the match is made and false a fortnight later, and a Ministry
 * that said it twice would be telling somebody they had been matched to the
 * person they have been meeting all year. What a resume is, is the thing that
 * ended: the Pause.
 *
 * The same sentence to both sides with the other side's names in it, like the
 * Starter Message it replaces here. Nothing announces the Pause itself -- an
 * Admin pauses on something they were told offline, and Discipler stops asking
 * rather than announcing that it has.
 *
 * The opt-out disclosure rides along because a Pause can run twelve weeks, and a
 * Participant reached after that long has not heard from their church inside the
 * thirty-day Silence Gap the disclosure exists for. Carried on every resume
 * rather than only the long ones: re-disclosing early is not a compliance
 * failure, and not disclosing late is.
 */
export const resumedMessage = ({ ministryName, withNames }: ResumedMessage): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: true,
    body: `Your discipleship with ${asList(withNames)} has been resumed!`,
  })

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
 * What each question tells the Leader they may reply, written once and keyed by
 * the question itself.
 *
 * Once, and as a map rather than a branch, because the clarification is these
 * sentences said again: a Leader whose reply could not be read is told exactly
 * what the question already offered. A token renamed in one place and not the
 * other would leave a clarification advertising a reply that no longer works, and
 * a question added to `CheckInQuestion` fails to compile here until it says what
 * it accepts.
 */
const VALID_REPLIES_TO: Readonly<Record<CheckInQuestion, string>> = {
  met: 'Reply 1 for yes, 2 for no.',
  satisfaction: 'Reply A for outstanding, B for good, C for concern.',
  // The Concern step names no tokens, because it takes prose. What it offers
  // instead is the whole of what it wants.
  concern_detail: 'Please tell us more about the concern.',
}

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
    body: `Did you meet with ${subject} this week? ${VALID_REPLIES_TO.met}`,
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
  `How did the meeting go? ${VALID_REPLIES_TO.satisfaction}`,
)

/**
 * Asked only after a `C`. The Concern is already recorded by the time this goes
 * out, so an unanswered request for detail loses nothing that was already said.
 */
export const concernDetailRequest = checkInSentence(VALID_REPLIES_TO.concern_detail)

export interface ClarificationMessage extends CheckInMessage {
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
export const checkInClarification = ({ ministryName, question }: ClarificationMessage): string =>
  checkInSentence(`Sorry, we didn’t catch that. ${VALID_REPLIES_TO[question]}`)({ ministryName })

/**
 * Sent after the *final* relationship and nowhere else. Where a thank-you would
 * otherwise fall, the next relationship's opening question is sent instead -- so
 * receiving this is how a Leader knows the conversation is over.
 */
export const checkInThankYou = checkInSentence('Thank you. We’ll check in with you next week.')

export interface KeywordMenu {
  readonly ministryName: string
  readonly keyword: RelationshipKeyword
  /** One line per eligible relationship, in the order the exchange stored them. */
  readonly options: readonly string[]
}

/**
 * What each keyword is asking about, in the one sentence that opens its menu.
 *
 * A map rather than a branch, and keyed by the keyword itself, so a fourth
 * relationship keyword fails to compile here until it says what its menu asks. The
 * question is phrased as the Leader's own request read back to them -- they texted
 * one word, and the menu is Discipler asking which of several they meant.
 */
const MENU_ASKS: Readonly<Record<RelationshipKeyword, string>> = {
  PAUSE: 'Which check-ins would you like to pause?',
  RESUME: 'Which check-ins would you like to restart?',
  SWAP: 'Which one would you like us to look at?',
}

/**
 * The printed menu, one place.
 *
 * A clarification's whole job is re-printing the menu the Leader did not answer, so
 * the two must render identically or a `2` means one thing in the first message and
 * another in the second. Composed once so they cannot drift.
 */
const printedMenu = (options: readonly string[]): string =>
  options.map((option, index) => `${index + 1}. ${option}`).join(' ')

/**
 * The numbered menu, sent when more than one relationship is eligible.
 *
 * Numbered from one and never from zero, because it is read off a phone by somebody
 * who has never seen an array. The numbers are positions in this message and in
 * nothing else -- the exchange stores the same order it printed, so a `2` means the
 * second line here even if a fourth relationship is formed before the Leader
 * replies.
 *
 * Neither compliance flag is set. A Leader in a keyword exchange is deep inside a
 * conversation they started; this is not first contact and it is not the Starter
 * Message.
 */
export const keywordMenu = ({ ministryName, keyword, options }: KeywordMenu): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body: `${MENU_ASKS[keyword]} ${printedMenu(options)}`,
  })

export interface PauseConfirmation {
  readonly ministryName: string
  /** Who the check-ins being paused are about, as `checkInSubject` composed them. */
  readonly subject: string
  readonly periodWeeks: number
  /** The other four periods, in the order `PAUSE_PERIODS` holds them. */
  readonly otherPeriods: readonly number[]
}

/**
 * Target and duration in **one** confirmation, which is the whole of the
 * accidental-tap protection: a Leader who meant it says yes, and a Leader whose
 * pocket sent `PAUSE` says nothing and the request ages out.
 *
 * It offers a default rather than asking twice. Two exchanges -- which relationship,
 * then how long -- would be two chances to abandon a request somebody actually
 * wanted, and the ordinary case is a fortnight away.
 *
 * The alternatives are the four periods it did not propose, so the Leader is never
 * invited to change their mind to what the message already says.
 */
export const pauseConfirmation = ({
  ministryName,
  subject,
  periodWeeks,
  otherPeriods,
}: PauseConfirmation): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      `Pause check-ins with ${subject} for ${periodWeeks} ${weekOrWeeks(periodWeeks)}? ` +
      `Reply YES to confirm, or reply ${asChoices(otherPeriods.map(String))} ` +
      'for a different number of weeks.',
  })

/** One week, and every other number of them. */
const weekOrWeeks = (weeks: number): string => (weeks === 1 ? 'week' : 'weeks')

export interface PauseApplied {
  readonly ministryName: string
  readonly subject: string
  readonly periodWeeks: number
}

/**
 * The pause, done. Sent to the Leader who asked and to nobody else -- **the
 * Participant is told nothing**, deliberately: their relationship has not changed,
 * they have never received a check-in, and a message explaining the absence of
 * something they never knew existed would be worse than the silence.
 *
 * It says when Discipler will be back rather than only that it has stopped, because
 * the thing a Leader stepping back most needs to know is that nobody is going to
 * have to remember to restart it.
 */
export const pauseApplied = ({ ministryName, subject, periodWeeks }: PauseApplied): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      `Done — your check-ins about ${subject} are paused for ${periodWeeks} ` +
      `${weekOrWeeks(periodWeeks)}. Reply RESUME any time to start them again sooner.`,
  })

export interface SwapRecorded {
  readonly ministryName: string
  readonly subject: string
}

/**
 * A swap request, received. It promises a conversation and never an outcome: the
 * decision is pastoral, it stays with the Admin, and nothing about the relationship
 * has changed by the time this arrives.
 *
 * Saying so plainly matters more here than anywhere else in the product. A Leader
 * who texts `SWAP` has just done the hard thing instead of going silent, and a
 * reply that read as though it had been actioned would have them stop meeting
 * somebody who has not been told.
 */
export const swapRecorded = ({ ministryName, subject }: SwapRecorded): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      `Thanks for letting us know about ${subject}. We've passed this on and someone ` +
      'will be in touch. Nothing changes in the meantime.',
  })

export interface NothingEligible {
  readonly ministryName: string
  readonly keyword: RelationshipKeyword
}

/**
 * A keyword with nothing to act on, answered plainly.
 *
 * It states the situation and stops. Offering a route -- *reply PAUSE instead* --
 * would be Discipler guessing at what somebody meant, and the one thing a keyword
 * route must never do is act on a relationship nobody named.
 */
const NOTHING_ELIGIBLE: Readonly<Record<RelationshipKeyword, string>> = {
  PAUSE: 'There are no check-ins to pause at the moment.',
  RESUME: 'You have no paused check-ins to restart at the moment.',
  SWAP: 'You have no current discipleship for us to look at.',
}

export const nothingEligible = ({ ministryName, keyword }: NothingEligible): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body: NOTHING_ELIGIBLE[keyword],
  })

export interface KeywordClarification {
  readonly ministryName: string
  /**
   * What the exchange is currently asking. Null while it is on its numbered menu,
   * which is the same shape the check-in clarification has: it names the replies the
   * open question offered and never the whole set.
   */
  readonly options: readonly string[] | null
}

/**
 * What Discipler says inside an exchange when it could not read a reply: that it
 * could not, and then the valid replies again.
 *
 * Twice at most, and then it stops talking -- not listening. The exchange stays
 * open and a correct reply nineteen hours later still gets the Leader their pause:
 * they asked for it and never withdrew the request.
 *
 * It re-prints the menu rather than saying *reply with a number*, because a Leader
 * whose reply was not read is the one least likely to still have the first message
 * in front of them.
 */
export const keywordClarification = ({
  ministryName,
  options,
}: KeywordClarification): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body: options
      ? `Sorry, we didn't catch that. ${printedMenu(options)}`
      : "Sorry, we didn't catch that. Reply YES to confirm, or a number of weeks.",
  })

export interface HelpMessage {
  readonly ministryName: string
}

/**
 * The `HELP` response, which changes nothing and is owed to everybody.
 *
 * **It identifies delivery.** A2P compliance names the `HELP` response as one of
 * the four occasions the `Discipler:` prefix is required, and it is the one message
 * whose whole purpose is telling somebody what they are receiving and how to make
 * it stop. See `docs/product-rules.md`, *Settled: The A2P Compliance Prefix Is a
 * Stated Exception*.
 *
 * It names the keywords and then it names a human. Somebody texting `HELP` may want
 * the word list, and may want their pastor -- and only one of those is something
 * Discipler can give them, so the other is pointed at rather than answered.
 */
export const helpMessage = ({ ministryName }: HelpMessage): string =>
  composeMessage({
    ministryName,
    identifyDelivery: true,
    discloseOptOut: true,
    body:
      'Reply PAUSE to pause your check-ins, RESUME to start them again, or SWAP to ' +
      `ask about a different match. For anything else, please contact ${ministryName} directly.`,
  })

export interface AcknowledgedMessage {
  readonly ministryName: string
}

/**
 * What answers a message Discipler could make nothing of.
 *
 * It points at the Ministry rather than trying to help, because there is nothing
 * here that can. A Participant has no dashboard and no account, and texting back is
 * the only channel they have -- so the one thing this must not do is nothing.
 *
 * Rate-limited by its caller, not by itself: a Participant in a back-and-forth with
 * their Leader must not be auto-replied to on every message, and the window that
 * decides is a rule about time and lives with the other rules about time.
 */
export const acknowledgedMessage = ({ ministryName }: AcknowledgedMessage): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      `Thanks for your message. We can't reply to texts here — please contact ` +
      `${ministryName} directly and someone will get back to you.`,
  })

/**
 * What a Participant hears when they text a keyword that is a Leader's to use.
 *
 * They are told a person will see it, and they are told the truth: nothing has
 * happened yet. A Participant texting `PAUSE` is most often somebody who wants out
 * and has no other route, and the item raised beside this message is what puts them
 * in front of an Admin.
 */
export const keywordPassedOn = ({ ministryName }: AcknowledgedMessage): string =>
  composeMessage({
    ministryName,
    identifyDelivery: false,
    discloseOptOut: false,
    body:
      `Thanks — we've passed this on to ${ministryName} and someone will be in touch. ` +
      'Nothing changes in the meantime.',
  })
