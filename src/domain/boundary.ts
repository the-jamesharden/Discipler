import type { Command } from './commands'
import { days, daysSince, type Clock } from './clock'
import {
  acceptInvitation,
  appendHistory,
  askCheckInQuestion,
  assignMaterial,
  clarifyCheckInQuestion,
  closeCheckInSequence,
  openCheckInSequence,
  optPersonOut,
  cancelRelationship,
  createPerson,
  departFromRelationship,
  endRelationship,
  createRelationship,
  enqueueMessage,
  issueInvitationLink,
  raiseFollowUpItem,
  recordCheckInAnswer,
  recordIntake,
  remindCheckInQuestion,
  resolveFollowUpItem,
  raiseConcern,
  recordConcernViewing,
  resolveConcern,
  type Effect,
  type NewCheckInPrompt,
} from './effects'
import {
  CancellationRefused,
  DepartureRefused,
  EndingRefused,
  IntakeRefused,
  InvitationRefused,
  MaterialAssignmentRefused,
  PairingRefused,
  PauseRefused,
} from './errors'
import {
  CLARIFICATIONS_PER_QUESTION,
  PASSED_OVER,
  advanceCheckIn,
  checkInDueThisWeek,
  checkInPromptId,
  isStopKeyword,
  checkInSequenceId,
  lapseOfOpenQuestion,
  readCheckInReply,
  relationshipsToAskAbout,
  type CheckInAdvance,
  type CheckInQuestion,
  type CheckInReply,
  type CheckInRelationship,
  type CheckInResolution,
  type CheckInSequenceId,
  type CheckInSnapshot,
  type OpenPrompt,
  type OpenSequence,
} from './check-in'
import { calendarMonthOf } from './week'
import { readIntakeForm } from './intake'
import {
  acceptanceReminderMessage,
  checkInClarification,
  checkInSubject,
  checkInThankYou,
  concernDetailRequest,
  invitationLink,
  meetingQuestion,
  satisfactionQuestion,
  invitationMessage,
  resumedMessage,
  starterMessageToLeader,
  starterMessageToParticipant,
  welcomeMessage,
} from './outbound-copy'
import { CONSENT_VERSION } from './consent'
import {
  concernId,
  personId,
  relationshipId,
  type IdSource,
  type MinistryId,
  type PersonId,
  type RelationshipId,
} from './ids'
import {
  invitationState,
  invitationToken,
  issueInvitation,
  type InvitationToken,
} from './invitations'
import {
  ACCEPTANCE_ESCALATION_DAYS,
  ACCEPTANCE_REMINDER_DAYS,
  isRelationshipOutcome,
  kindFor,
  type MemberRole,
  type NewMembership,
} from './relationships'
import {
  DEFAULT_PAUSE_PERIOD_WEEKS,
  isPausePeriod,
  pauseExpiresAt,
  pauseHasExpired,
  type PausePeriodWeeks,
  type StandingPause,
} from './pause'
import { rosterKey, type PhoneNumber, type RosterKey, type RowRejection } from './roster'
import { readRosterFile } from './roster-csv'

/**
 * The single command boundary. It is a pure function: the same command against the
 * same context yields the same effects, every time, with no I/O in between.
 *
 * The context is what the application service has already loaded on the command's
 * behalf. Today that is the clock, the source of new identifiers, and the Ministry
 * the command acts within; as later tickets add rules that read history, the state
 * they need joins it here rather than being fetched from inside the domain.
 */
export interface CommandContext {
  readonly ministryId: MinistryId
  readonly clock: Clock
  readonly ids: IdSource
  /**
   * Who is already on the Roster, loaded on `person.import`'s behalf. Commands that
   * need nothing loaded -- the tick, pairing -- leave it out, and `person.import`
   * refuses to run without it rather than treating its absence as an empty Roster.
   * The two readings differ by a whole congregation being imported a second time.
   */
  readonly roster?: RosterSnapshot
  /**
   * The Ministry in whose voice the command speaks. Loaded on the command's behalf
   * because every message carries the Ministry name as a prefix, and a domain that
   * fetched it would no longer be a pure function of its inputs.
   */
  readonly ministryName?: string
  /**
   * Who is being paired, or who is already in the relationship being accepted --
   * their names and the numbers Discipler would text. Loaded on the command's
   * behalf like the Roster, because a message needs a name and a recipient and a
   * domain that fetched either would no longer be a pure function of its inputs.
   */
  readonly contacts?: ContactsSnapshot
  /**
   * The token as the database found it, with everyone in the relationship it
   * names. Absent when the command is not one a token drives.
   */
  readonly invitation?: InvitationSnapshot
  /**
   * Every relationship in this Ministry that nobody has accepted yet, loaded on
   * the tick's behalf. Absent rather than empty, for the same reason the Roster
   * is: an unloaded snapshot and a Ministry with nothing outstanding are the same
   * value and opposite facts, and one of them silently reminds nobody.
   */
  readonly unaccepted?: readonly UnacceptedRelationship[]
  /**
   * Every relationship in this Ministry a Pause currently stands on, loaded on
   * the tick's behalf. Absent rather than empty, for the same reason the Roster
   * and the unaccepted relationships are: an unloaded snapshot and a Ministry
   * with nothing paused are the same value and opposite facts, and one of them
   * silently lets every pause run out unnoticed.
   */
  readonly paused?: readonly PausedRelationship[]
  /**
   * The one relationship an Admin command names, as the database holds it now.
   * Absent when the command names none.
   */
  readonly relationship?: RelationshipSnapshot
  /**
   * Where a link points. The shape of the path is a copy decision and lives in
   * `outbound-copy`; the host it hangs off is configuration and arrives here.
   */
  readonly appBaseUrl?: string
  /**
   * The Person a check-in command acts on: what they lead, whether a conversation
   * is already open with them, and when they were last asked. Loaded around the
   * command like every other snapshot here, so the rules stay drivable with no
   * database in the room.
   */
  readonly checkIn?: CheckInSnapshot
  /**
   * Every Leader in this Ministry the cadence could make due, loaded on the
   * tick's behalf with their cadence already resolved by
   * `coalesce(r.checkin_day, ms.checkin_day)`.
   *
   * *Could*, not *is*. Which of them a new ISO week has actually come due for is
   * a rule about time, and every one of those is decided here against the
   * injected clock rather than in SQL -- otherwise a cadence edit and a week
   * boundary would be untestable without a database and a fortnight.
   *
   * Absent rather than empty, like the Roster and the unaccepted relationships:
   * an unloaded snapshot and a Ministry with nobody to ask are the same value and
   * opposite facts, and one of them silently checks in with nobody.
   */
  readonly checkInsDue?: readonly CheckInSnapshot[]
}

/**
 * A Leader who has not yet agreed to lead, and whom a reminder can actually
 * reach: an open leader membership with no `accepted_at`, an Invitation Link
 * nothing has spent, and standing permission to be texted at all.
 *
 * A Leader who has opted out or withdrawn SMS consent is not here. Texting them
 * is refused by the outbound queue, and the tick is one transaction -- so one
 * such Leader would roll back every reminder and every escalation in the
 * Ministry, on every run. The five-day item is raised from the relationship's own
 * age and surfaces them to an Admin regardless, which is the right remedy for
 * somebody Discipler can no longer reach.
 */
export interface AwaitingLeader {
  readonly personId: PersonId
  readonly fullName: string
  readonly phone: string | null
  readonly token: InvitationToken
  /**
   * When their link stops working. Carried here rather than filtered in SQL
   * because whether it has run out is a question about time, and every one of
   * those is answered against the injected clock.
   */
  readonly linkExpiresAt: Date
  /**
   * When this Leader was last reminded about this relationship, read back from
   * history. The tick re-evaluates every run, so without it a relationship that
   * has waited a fortnight would be four days of reminders and then ten more.
   */
  readonly remindedAt: Date | null
}

export interface UnacceptedRelationship {
  readonly relationshipId: RelationshipId
  /** Both thresholds are measured from here, never from when a Leader was invited. */
  readonly createdAt: Date
  readonly awaiting: readonly AwaitingLeader[]
  /**
   * Whether a `relationship_unaccepted` item about it is *open* right now. The
   * partial unique index refuses a second open row anyway; this is what keeps the
   * tick from appending a history event a day for a condition an Admin is already
   * looking at.
   *
   * Deliberately not "has ever been raised". An Admin who resolves the item
   * without cancelling has closed a record, not made the relationship accepted --
   * and a relationship that can never be raised again is one nobody is ever told
   * about, which is the invisibility this ticket exists to end.
   */
  readonly itemStandsOpen: boolean
}

/**
 * One member of the relationship an Admin command names, as the database holds
 * them now: who they are, which side of the relationship they are on, and how to
 * reach them. No acceptance date, because a command that names a relationship has
 * already been handed the relationship's own. No invitation link either -- the
 * Participant still holds one, but nothing a command composes puts it in a
 * message, so nothing here needs to read it.
 */
export interface RelationshipMember {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly fullName: string
  readonly phone: string | null
}

/**
 * One paused relationship, as the tick needs it: when the Pause was taken, for
 * how long, and whether an Admin is already looking at an item saying it has run
 * out.
 *
 * `itemStandsOpen` is *open right now*, deliberately not *has ever been raised*.
 * The partial unique index refuses a second open row anyway; this is what keeps
 * the tick from appending a history event a day for a condition nobody has acted
 * on. An Admin who resolves the item without resuming has closed a record, not
 * restarted anybody's check-ins -- so the condition is true again and is raised
 * again, exactly as an unaccepted relationship's is.
 */
export interface PausedRelationship {
  readonly relationshipId: RelationshipId
  readonly pausedAt: Date
  readonly periodWeeks: PausePeriodWeeks
  readonly itemStandsOpen: boolean
}

/**
 * A relationship as the database holds it now. `acceptedAt` is activation and
 * `endedAt` is the end of its life; between them they say which of the things an
 * Admin may do to it are still available, and `pause` says whether it is
 * currently stopped.
 */
export interface RelationshipSnapshot {
  readonly relationshipId: RelationshipId
  readonly createdAt: Date
  readonly acceptedAt: Date | null
  readonly endedAt: Date | null
  /**
   * The Pause standing on it right now, or null. Read back from the
   * `relationship.paused` and `relationship.resumed` events rather than from a
   * column, because a Pause is a dated fact like every other thing that happens
   * to a relationship and history is the one source they are all derived from.
   */
  readonly pause: StandingPause | null
  /** Everyone holding an open membership, whatever their role. */
  readonly members: readonly RelationshipMember[]
}

export interface PersonContact {
  readonly fullName: string
  /** Null for a Person no number was ever recorded for. */
  readonly phone: string | null
}

export interface ContactsSnapshot {
  readonly people: ReadonlyMap<PersonId, PersonContact>
}

/**
 * One member of the relationship a token names, as the database holds them now.
 * `acceptedAt` is each Leader's own agreement; the relationship's own timestamp is
 * activation, and is stamped when the last of these is filled in.
 */
export interface InvitedMember {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly fullName: string
  readonly phone: string | null
  readonly acceptedAt: Date | null
}

export interface InvitationSnapshot {
  readonly relationshipId: RelationshipId
  /** Whose link it is. Their role is read off `members`, never off the token. */
  readonly personId: PersonId
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  /** Everyone holding an open membership, whatever their role. */
  readonly members: readonly InvitedMember[]
}

/**
 * Everyone the Ministry already holds, by `rosterKey` -- their name and number --
 * against the identifier that name and number belong to. `person.import` asks only
 * whether a key is present; Intake needs the Person behind it, because somebody
 * completing the form is usually already on an imported Roster.
 */
export interface RosterSnapshot {
  readonly people: ReadonlyMap<RosterKey, PersonId>
  /**
   * Every name the Ministry already holds against a number. The number is what
   * recognises a row; this is what says whether it came back unchanged, and it is
   * the only way to tell a rename from the second person on a shared phone
   * without guessing at one of them.
   */
  readonly namesByNumber: ReadonlyMap<PhoneNumber, readonly string[]>
  /**
   * Who has already completed Intake at least once. The Welcome Message is *first*
   * contact, so it is enqueued against this rather than against the submission: one
   * link serves a whole Ministry and nothing stops a Person opening it twice, and a
   * second Welcome would be Discipler texting somebody to welcome them to something
   * they are already in. Ticket 16 builds the deliberate re-submission path on top
   * of the same fact.
   */
  readonly whoCompletedIntake: ReadonlySet<PersonId>
}

export interface CommandResult {
  readonly effects: readonly Effect[]
  /**
   * Rows the command declined, in the order they appeared in whatever the Admin
   * supplied. Empty for a command that takes no rows. A row that cannot be read is
   * reported back with its line number rather than silently dropped, which is the
   * whole difference between an import an Admin can trust and one they cannot.
   */
  readonly rejections: readonly RowRejection[]
}

const membersOf = (
  leaderIds: readonly PersonId[],
  participantIds: readonly PersonId[],
  startedAt: Date,
): readonly NewMembership[] => [
  ...leaderIds.map((personId): NewMembership => ({ personId, role: 'leader', startedAt })),
  ...participantIds.map(
    (personId): NewMembership => ({ personId, role: 'participant', startedAt }),
  ),
]

/** A Person the command was handed, or a loud failure rather than a blank name. */
const whoIs = (context: CommandContext, id: PersonId): PersonContact => {
  const person = context.contacts?.people.get(id)
  if (!person) throw new Error(`No name or number was loaded for person ${id}`)
  return person
}

/**
 * What every token-driven command needs before it can decide anything. Absent
 * rather than defaulted, for the same reason the Roster is: a missing Ministry
 * name would compose a message in nobody's voice, and a missing invitation would
 * make an unresolved token look like a valid one.
 */
const tokenContext = (context: CommandContext) => {
  const { invitation, ministryName, appBaseUrl } = context
  if (!invitation) throw new Error('This command was handed no invitation to act on')
  if (!ministryName) throw new Error('This command was handed no Ministry to speak for')
  if (!appBaseUrl) throw new Error('This command was handed nowhere for its links to point')
  return { invitation, ministryName, baseUrl: appBaseUrl }
}

/**
 * The membership the token's holder actually has. A token that names somebody who
 * holds no open membership is a link to a relationship they have left, and there
 * is nothing here for them to act on.
 */
const memberHolding = (invitation: InvitationSnapshot, id: PersonId): InvitedMember => {
  const member = invitation.members.find((candidate) => candidate.personId === id)
  if (!member) throw new InvitationRefused('invitation.not_found')
  return member
}

/**
 * The monthly opt-out rule, for Leaders. True on the first check-in of each
 * calendar month, which includes the first check-in a Leader ever receives.
 *
 * The month is the Ministry's, not UTC's. A Sydney ministry asked at 9am local on
 * the 1st is at 23:00 UTC on the last day of the previous month, and resolving in
 * UTC would put two of their conversations in one month and none in the next --
 * so one month would carry the opt-out language twice and the following one not
 * at all. It is the same timezone the week boundary reads, for the same reason.
 */
const optOutLanguageIsDue = (
  lastCheckInAt: Date | null,
  now: Date,
  timeZone: string,
): boolean => {
  if (!lastCheckInAt) return true
  return calendarMonthOf(lastCheckInAt, timeZone) !== calendarMonthOf(now, timeZone)
}

/** What every question in a conversation needs in order to be sent and recorded. */
interface Asking {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly sequenceId: CheckInSequenceId
  readonly personId: PersonId
  readonly phone: string | null
  readonly now: Date
  readonly ids: IdSource
  /**
   * The cadence instant that made this conversation due, or null when nothing
   * scheduled it -- a reply advancing the sequence, or `checkin.start` opening
   * one directly. Stamped on the message and never rewritten.
   */
  readonly scheduledFor: Date | null
}

/**
 * One question, as the two things it always is: a text to the Leader and a row
 * saying what was asked, of which relationship, in which role. They are produced
 * together because a prompt with no message is a question nobody was asked, and a
 * message with no prompt is a reply with nothing to bind to.
 */
/**
 * One text to the Leader this conversation belongs to. Every message a check-in
 * sends is this shape -- the questions and the closing thank-you alike -- so the
 * envelope is written once and only the body differs.
 */
const sayToLeader = (asking: Asking, body: string): Effect =>
  enqueueMessage({
    ministryId: asking.ministryId,
    personId: asking.personId,
    toPhone: asking.phone,
    body,
    enqueuedAt: asking.now,
    scheduledFor: asking.scheduledFor,
    // No message to a Leader contains a phone number, and a check-in question
    // names the people they already meet with.
    disclosesPersonId: null,
  })

const ask = (
  asking: Asking,
  prompt: Omit<NewCheckInPrompt, 'id' | 'ministryId' | 'sequenceId' | 'askedAt'>,
  body: string,
): readonly Effect[] => [
  askCheckInQuestion({
    id: checkInPromptId(asking.ids.next()),
    ministryId: asking.ministryId,
    sequenceId: asking.sequenceId,
    askedAt: asking.now,
    ...prompt,
  }),
  sayToLeader(asking, body),
]

/**
 * The words of one question, wherever it is being sent from -- asked the first
 * time, or the same question re-sent as a reminder a day later. One place, so a
 * reminder cannot drift into being a differently-worded second question.
 *
 * `discloseOptOut` is only ever true on the message that opens a conversation.
 * The monthly language rides on the first check-in of the calendar month, and a
 * reminder is not one: it is that same message again.
 */
const bodyOfQuestion = (
  asking: Asking,
  question: CheckInQuestion,
  relationship: CheckInRelationship,
  discloseOptOut: boolean,
): string => {
  const { ministryName } = asking
  if (question === 'met') {
    return meetingQuestion({
      ministryName,
      subject: checkInSubject(relationship.participantNames),
      discloseOptOut,
    })
  }
  return question === 'satisfaction'
    ? satisfactionQuestion({ ministryName })
    : concernDetailRequest({ ministryName })
}

/**
 * The opening question of one relationship's turn. Where a closing thank-you
 * would otherwise fall, this is what is sent instead -- which is why it is the
 * one step reached from both the start of a conversation and the middle of one.
 */
const askWhetherTheyMet = (
  asking: Asking,
  relationship: CheckInRelationship,
  position: number,
  discloseOptOut: boolean,
): readonly Effect[] =>
  ask(
    asking,
    {
      relationshipId: relationship.relationshipId,
      role: relationship.role,
      position,
      question: 'met',
    },
    bodyOfQuestion(asking, 'met', relationship, discloseOptOut),
  )

/**
 * Whatever the ladder said comes next, sent. Reached from a reply that advanced
 * the conversation and from a question given up on, which move it identically --
 * that identity is what *converting abandonment into ordinary unanswered
 * questions with no special case* actually means in code.
 *
 * Never carries the monthly opt-out language: it went out on the message that
 * opened this conversation, and this is the same conversation.
 */
const askNext = (
  asking: Asking,
  advance: Extract<CheckInAdvance, { kind: 'ask' }>,
): readonly Effect[] =>
  ask(
    asking,
    {
      relationshipId: advance.relationship.relationshipId,
      role: advance.relationship.role,
      position: advance.position,
      question: advance.question,
    },
    bodyOfQuestion(asking, advance.question, advance.relationship, false),
  )

/**
 * A reply as it is stored. The three columns are exclusive by question -- a
 * `met` answer has no rating and a rating has no prose -- and the letters the
 * message advertised are nowhere in it: `C` is stored as `concern`, so renaming a
 * token in copy can never re-tokenise a Ministry's history.
 */
const recorded = (reply: CheckInReply) => ({
  met: reply.kind === 'met' ? reply.met : null,
  satisfaction: reply.kind === 'satisfaction' ? reply.satisfaction : null,
  detail: reply.kind === 'concern_detail' ? reply.detail : null,
})

/**
 * The same reply as history records it, which is the same three facts minus the
 * prose. `ministry_event` is append-only, so a payload carrying the Leader's words
 * would outlive the resolution that cleared them -- exactly what `concern.raised`
 * already refuses, and for the same reason. That a Concern was raised is the fact
 * worth keeping; the words live in `concern` and are cleared from there.
 */
const withoutTheProse = (reply: CheckInReply) => ({
  met: reply.kind === 'met' ? reply.met : null,
  satisfaction: reply.kind === 'satisfaction' ? reply.satisfaction : null,
  raisedConcern: reply.kind === 'concern_detail',
})

/**
 * Ending a conversation the Leader did not finish. Four things end one -- a new
 * week displacing it, a `STOP`, a Pause withdrawing the last question it had left
 * to ask, and its last question reminded once and given up on -- and all four
 * close it `abandoned`, because they are one fact.
 *
 * The reason is a parameter rather than a caller's choice to include: it lives
 * only on the history event, so an ending that omitted it would be unreadable to
 * ticket 10, and going through here is the only way to write one.
 */
const abandonSequence = (abandonment: {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly sequenceId: CheckInSequenceId
  readonly at: Date
  readonly reason: 'displaced' | 'unanswered' | 'opted_out' | 'paused'
}): readonly Effect[] => {
  const { ministryId, personId, sequenceId, at, reason } = abandonment
  return [
    closeCheckInSequence({ ministryId, sequenceId, closedAt: at, outcome: 'abandoned' }),
    appendHistory({
      ministryId,
      occurredAt: at,
      type: 'checkin.sequence_abandoned',
      subjectType: 'person',
      subjectId: personId,
      payload: { sequenceId, reason },
    }),
  ]
}

/**
 * A question a Pause took back, as history records it.
 *
 * Withdrawn is not passed over. A passed-over question is a silence the Leader
 * owns and ticket 10 counts; this one is Discipler's to take back, so nothing
 * about the relationship-week it belongs to may read as unanswered --
 * `relationship_weeks` drops that week on the strength of this event and nothing
 * else. Which is why every route that stops asking a question because of a Pause
 * comes through here, and there are two of them: the tick that notices mid-week,
 * and a new week displacing the conversation before any tick did.
 */
const withdrawQuestion = (withdrawal: {
  readonly ministryId: MinistryId
  readonly at: Date
  readonly sequenceId: CheckInSequenceId
  readonly relationshipId: RelationshipId
  readonly awaiting: OpenPrompt
}): Effect =>
  appendHistory({
    ministryId: withdrawal.ministryId,
    occurredAt: withdrawal.at,
    type: 'checkin.question_withdrawn',
    subjectType: 'relationship',
    subjectId: withdrawal.relationshipId,
    payload: {
      sequenceId: withdrawal.sequenceId,
      promptId: withdrawal.awaiting.promptId,
      question: withdrawal.awaiting.question,
      reason: 'paused',
    },
  })

/**
 * The ladder, minus every relationship a Pause reached before its turn did.
 *
 * `covering` is fixed when the conversation opens, so that a Pause halfway
 * through does not renumber the questions still to come -- which means a Pause
 * taken since is in nobody's list, and every place the conversation moves
 * forward has to step over it. There are three, and together they are the whole
 * of *pausing suppresses that relationship's check-ins*: a reply, a question
 * given up on, and a question a Pause took back. A rule that held only for the
 * question which happened to be open would send the next one a minute later.
 *
 * Nothing is recorded for the ones stepped over. Their turn was never reached,
 * so there is no question to withdraw, and `relationship_weeks` already reads a
 * covered relationship with no prompt as nothing having been asked.
 */
const advancePastPaused = (
  sequence: OpenSequence,
  awaiting: OpenPrompt,
  resolution: CheckInResolution,
): CheckInAdvance => {
  let advance = advanceCheckIn(sequence, awaiting, resolution)

  // `PASSED_OVER` from the position reached, which is what moves the ladder on
  // without recording anything. It always advances, so the walk terminates even
  // where the first step was a follow-up question on the relationship just
  // paused -- a Leader who answered *yes we met* an hour before the Pause is not
  // then asked how it went.
  while (advance.kind === 'ask' && advance.relationship.paused) {
    advance = advanceCheckIn(sequence, { ...awaiting, position: advance.position }, PASSED_OVER)
  }

  return advance
}

/**
 * What opening one Leader's conversation comes to, wherever the decision to open
 * it was made. Two callers: the cadence dispatcher inside the tick, and
 * `checkin.start`, the direct trigger 08a was built against and which nothing in
 * production routes to.
 *
 * It is the same conversation either way -- the ticket that owns the cadence does
 * not get to own a second kind of check-in -- so the only thing the caller varies
 * is the moment, and whether a cadence is what produced it.
 */
const openConversationWith = (
  checkIn: CheckInSnapshot,
  opening: {
    readonly ministryId: MinistryId
    readonly ministryName: string
    readonly now: Date
    readonly ids: IdSource
    readonly scheduledFor: Date | null
  },
): readonly Effect[] => {
  const { ministryId, ministryName, now, ids, scheduledFor } = opening
  const effects: Effect[] = []

  // Two sequences never run for one Leader at once. The displaced one's
  // unanswered questions stay unanswered rather than being tidied away: they
  // are what ticket 10's Stalled rule reads, and answering them on the
  // Leader's behalf is the one thing that would hide a Leader going quiet.
  //
  // All but one. A question whose relationship was paused while it was out is a
  // question Discipler has stopped asking, and a new week displacing the
  // conversation is not the Leader answering it -- so it is withdrawn here on
  // the way past, exactly as the tick would have withdrawn it. Narrow, and real:
  // an Admin who pauses between the last tick and the cadence hour is the one
  // Admin whose Pause is displaced before any tick notices it, and without this
  // the week Discipler stopped asking about still reads as their Leader's
  // silence -- one week closer to `Stalled` for a question nobody was owed.
  const displaced = checkIn.openSequence
  if (displaced) {
    const awaiting = displaced.awaiting
    const askedAbout = awaiting ? displaced.covering[awaiting.position - 1] : undefined

    if (awaiting && askedAbout?.paused) {
      effects.push(
        withdrawQuestion({
          ministryId,
          at: now,
          sequenceId: displaced.sequenceId,
          relationshipId: askedAbout.relationshipId,
          awaiting,
        }),
      )
    }

    effects.push(
      ...abandonSequence({
        ministryId,
        personId: checkIn.personId,
        sequenceId: displaced.sequenceId,
        at: now,
        reason: 'displaced',
      }),
    )
  }

  const covering = relationshipsToAskAbout(checkIn.leads)

  // A Participant leads nothing, and a Leader whose every relationship is
  // paused has nothing to be asked about. An empty conversation would be one
  // nobody can finish, and ticket 10 would read its relationship-weeks as
  // unanswered -- so none is opened.
  if (covering.length === 0) return effects

  const sequenceId = checkInSequenceId(ids.next())
  const asking: Asking = {
    ministryId,
    ministryName,
    sequenceId,
    personId: checkIn.personId,
    phone: checkIn.phone,
    now,
    ids,
    scheduledFor,
  }

  effects.push(
    openCheckInSequence({
      id: sequenceId,
      ministryId,
      personId: checkIn.personId,
      startedAt: now,
      covering: covering.map((each) => each.relationshipId),
    }),
    appendHistory({
      ministryId,
      occurredAt: now,
      type: 'checkin.sequence_opened',
      subjectType: 'person',
      subjectId: checkIn.personId,
      // What this week's conversation covers, recorded at the moment it
      // opened. Ticket 10 counts a relationship-week unanswered when it was
      // covered and no reply arrived -- whether or not its question was ever
      // reached -- so the coverage has to survive the sequence.
      payload: {
        sequenceId,
        relationshipIds: covering.map((each) => each.relationshipId),
      },
    }),
    // Only the first. The sequence advances in response to a reply and never
    // otherwise, so a Leader with three relationships is asked one question
    // and not three.
    ...askWhetherTheyMet(
      asking,
      covering[0]!,
      1,
      // The month is the Ministry's, like the week.
      optOutLanguageIsDue(checkIn.lastCheckInAt, now, checkIn.timeZone),
    ),
  )

  return effects
}

/**
 * What the tick does about a question that has been sitting unanswered.
 *
 * The whole rule, in the order it happens: nothing for a day, then the question
 * again, then nothing for another day, then the conversation moves on without it.
 * After that this Leader has no open question and there is nothing left to chase
 * -- the sequence either has another relationship to ask about or is closed.
 *
 * Called only when the cadence has *not* opened a new conversation this run. A
 * new week abandons the old sequence outright, and chasing a question that no
 * longer belongs to anything would send a Leader last week's question and this
 * week's in the same minute.
 */
const chaseTheOpenQuestion = (
  checkIn: CheckInSnapshot,
  chasing: {
    readonly ministryId: MinistryId
    readonly ministryName: string
    readonly now: Date
    readonly ids: IdSource
  },
): readonly Effect[] => {
  const { ministryId, ministryName, now, ids } = chasing

  const sequence = checkIn.openSequence
  const awaiting = sequence?.awaiting
  if (!sequence || !awaiting) return []

  const relationship = sequence.covering[awaiting.position - 1]
  if (!relationship) return []

  const asking: Asking = {
    ministryId,
    ministryName,
    sequenceId: sequence.sequenceId,
    personId: checkIn.personId,
    phone: checkIn.phone,
    now,
    ids,
    // A lapse produced this, not a cadence. The stamp records which Monday sent a
    // conversation's opening message, and no Monday sent this.
    scheduledFor: null,
  }

  // A Pause taken since this question went out withdraws it, and withdraws it
  // *now* rather than at the next lapse: the reminder is a text to a Leader who
  // has just stepped back, which is the one message a Pause exists to stop.
  // Why withdrawn rather than passed over is `withdrawQuestion`'s, and where the
  // conversation goes next is `advancePastPaused`'s.
  if (relationship.paused) {
    const withdrawn = withdrawQuestion({
      ministryId,
      at: now,
      sequenceId: sequence.sequenceId,
      relationshipId: relationship.relationshipId,
      awaiting,
    })

    const onward = advancePastPaused(sequence, awaiting, PASSED_OVER)

    if (onward.kind === 'finish') {
      return [
        withdrawn,
        ...abandonSequence({
          ministryId,
          personId: checkIn.personId,
          sequenceId: sequence.sequenceId,
          at: now,
          reason: 'paused',
        }),
      ]
    }

    return [withdrawn, ...askNext(asking, onward)]
  }

  const lapse = lapseOfOpenQuestion(awaiting, now)
  if (!lapse) return []

  if (lapse === 'remind') {
    return [
      remindCheckInQuestion({ ministryId, promptId: awaiting.promptId, remindedAt: now }),
      appendHistory({
        ministryId,
        occurredAt: now,
        type: 'checkin.question_reminded',
        subjectType: 'relationship',
        subjectId: relationship.relationshipId,
        payload: {
          sequenceId: sequence.sequenceId,
          promptId: awaiting.promptId,
          question: awaiting.question,
        },
      }),
      // The same question, not a new one. No prompt row is created, so nothing
      // downstream can read one silence as two unanswered questions.
      sayToLeader(asking, bodyOfQuestion(asking, awaiting.question, relationship, false)),
    ]
  }

  const passedOver = appendHistory({
    ministryId,
    occurredAt: now,
    type: 'checkin.question_passed_over',
    subjectType: 'relationship',
    subjectId: relationship.relationshipId,
    payload: {
      sequenceId: sequence.sequenceId,
      promptId: awaiting.promptId,
      question: awaiting.question,
    },
  })

  const advance = advancePastPaused(sequence, awaiting, PASSED_OVER)

  // The last relationship, given up on. There is nothing left to ask and no
  // thank-you to send: the Leader did not finish this conversation, and thanking
  // them for it would be Discipler telling them they had.
  //
  // `abandoned` rather than `completed`, which is the same distinction a new week
  // displacing a sequence makes -- and for the same reason. Its unanswered
  // questions stay unanswered, because that silence is what ticket 10 reads.
  if (advance.kind === 'finish') {
    return [
      passedOver,
      ...abandonSequence({
        ministryId,
        personId: checkIn.personId,
        sequenceId: sequence.sequenceId,
        at: now,
        reason: 'unanswered',
      }),
    ]
  }

  return [passedOver, ...askNext(asking, advance)]
}

export const handleCommand = (command: Command, context: CommandContext): CommandResult => {
  switch (command.type) {
    case 'scheduled.tick': {
      // The tick is a command like any other: it enters through this boundary, it
      // reads the injected clock, and it returns effects. It never reads system
      // time, which is the only reason a fortnight of waiting can be tested in a
      // few milliseconds.
      //
      // It carries the Acceptance thresholds, the cadence, the twenty-four hour
      // sequence timeout, the next-day reminder, and Pause expiry. Every one of
      // them reads the same clock, because two schedulers would be two answers to
      // *what time is it*.
      const { unaccepted, checkInsDue, paused, ministryName, appBaseUrl } = context
      if (!unaccepted) throw new Error('scheduled.tick was handed no state to evaluate')
      if (!checkInsDue) throw new Error('scheduled.tick was handed nobody to check in with')
      if (!paused) throw new Error('scheduled.tick was handed no pauses to evaluate')
      if (!ministryName) throw new Error('scheduled.tick was handed no Ministry to speak for')
      if (!appBaseUrl) {
        throw new Error('scheduled.tick was handed nowhere for its links to point')
      }

      const now = context.clock.now()
      const effects: Effect[] = []

      // The check-in cadence. This is what makes a Leader due -- the direct
      // trigger 08a was built against is now the Admin's *send one additional
      // check-in* and nothing else.
      //
      // Safe to run as often as the scheduler likes, and safe to miss: a Leader
      // is due at most once per ISO week and stays due for the rest of the week
      // once their hour has passed, so an hourly tick asks once and a tick that
      // never ran on Monday evening asks on Tuesday rather than skipping a week.
      for (const leader of checkInsDue) {
        const due = checkInDueThisWeek(leader, now)

        if (due) {
          effects.push(
            ...openConversationWith(leader, {
              ministryId: command.ministryId,
              ministryName,
              now,
              ids: context.ids,
              // The cadence as it was read at this moment, stamped on the message.
              // Not `now`: the two differ by however long the tick took to reach
              // this Leader, and it is the cadence that has to be recoverable from
              // the row -- that is what makes an edit demonstrably future-only.
              scheduledFor: due,
            }),
          )
          // A new week has just abandoned whatever was open and asked its first
          // question. There is nothing of last week's left to chase.
          continue
        }

        // Mid-week, with a question already out. The reminder and the giving-up
        // live here rather than in their own tick because they are the same
        // clock the cadence is read against, and two schedulers would be two
        // answers to *what time is it*.
        effects.push(
          ...chaseTheOpenQuestion(leader, {
            ministryId: command.ministryId,
            ministryName,
            now,
            ids: context.ids,
          }),
        )
      }

      for (const relationship of unaccepted) {
        // From creation, not from when any one Leader was invited. Nothing adds a
        // member to a relationship after it is formed, so the two are the same
        // instant today; measuring from the relationship is what keeps them the
        // same when something does.
        const waited = now.getTime() - relationship.createdAt.getTime()

        // One reminder each, and only to the Leaders who have not agreed yet. A
        // co-leader who accepted on day one is not chased for somebody else.
        if (waited >= days(ACCEPTANCE_REMINDER_DAYS)) {
          for (const leader of relationship.awaiting) {
            if (leader.remindedAt !== null) continue
            // A reminder whose link has run out sends them to a page telling them
            // to find an Admin, which is worse than the text they never got.
            if (leader.linkExpiresAt.getTime() <= now.getTime()) continue

            effects.push(
              enqueueMessage({
                ministryId: command.ministryId,
                personId: leader.personId,
                toPhone: leader.phone,
                body: acceptanceReminderMessage({
                  ministryName,
                  fullName: leader.fullName,
                  link: invitationLink(appBaseUrl, leader.token),
                }),
                enqueuedAt: now,
                // No message to a Leader contains a phone number.
                disclosesPersonId: null,
              }),
              appendHistory({
                ministryId: command.ministryId,
                occurredAt: now,
                type: 'relationship.acceptance_reminded',
                subjectType: 'relationship',
                subjectId: relationship.relationshipId,
                payload: { personId: leader.personId },
              }),
            )
          }
        }

        // It stops being the Leader's to solve and becomes the Admin's. One open
        // item at a time: raising it again on days six and seven would tell the
        // Admin nothing they are not already looking at, and the history event
        // beside it would become a row a day for a condition nobody had acted on.
        // The partial unique index refuses the second open row regardless.
        //
        // Once the Admin resolves it and the relationship is *still* unaccepted,
        // the condition is true again and is raised again. Resolving records that
        // an Admin acted; it does not make a Leader agree.
        if (waited >= days(ACCEPTANCE_ESCALATION_DAYS) && !relationship.itemStandsOpen) {
          effects.push(
            raiseFollowUpItem({
              ministryId: command.ministryId,
              kind: 'relationship_unaccepted',
              relationshipId: relationship.relationshipId,
              // The condition is the relationship's, not any one Leader's: a group
              // waiting on two of them is one thing for an Admin to act on.
              personId: null,
              raisedAt: now,
            }),
            appendHistory({
              ministryId: command.ministryId,
              occurredAt: now,
              type: 'follow_up.relationship_unaccepted',
              subjectType: 'relationship',
              subjectId: relationship.relationshipId,
              // How long it had waited when it was raised. What the Admin is shown
              // is read live off `created_at`, because this number is true of the
              // moment it was written and stops being true the next day.
              payload: { waitedDays: daysSince(relationship.createdAt, now) },
            }),
          )
        }
      }

      // A Pause running out. **It resumes nothing.** It changes no state, sends
      // nothing, and raises an item saying which period was selected, that it has
      // run out, and that the relationship has not resumed -- because nobody's
      // check-ins should restart on a date they have forgotten. The relationship
      // stays `Paused` until an Admin resumes or ends it.
      //
      // Which is why this is not a state and not a care condition derived from
      // check-in history. Like a Concern it sits beside the relationship,
      // coexists with any state including `Paused`, and clears only when an Admin
      // resolves it.
      for (const pause of paused) {
        if (!pauseHasExpired(pause, now)) continue
        // One open item at a time. Raising it again tomorrow would tell the Admin
        // nothing they are not already looking at, and the history event beside it
        // would become a row a day for a condition nobody had acted on.
        if (pause.itemStandsOpen) continue

        effects.push(
          raiseFollowUpItem({
            ministryId: command.ministryId,
            kind: 'pause_expired',
            relationshipId: pause.relationshipId,
            // The condition is the relationship's. A group whose Pause has run out
            // is one thing for an Admin to act on, not one per Leader in it.
            personId: null,
            // The period is carried because the Admin is being asked to review a
            // decision somebody made, and *a fortnight has run out* and *a summer
            // has run out* are different reviews.
            periodWeeks: pause.periodWeeks,
            raisedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'follow_up.pause_expired',
            subjectType: 'relationship',
            subjectId: pause.relationshipId,
            payload: {
              periodWeeks: pause.periodWeeks,
              // When it ran out, which is not when this ran: a tick that fires
              // hourly raises this on the first run after the instant, and a
              // Ministry whose scheduler was down for a day raises it late.
              expiredAt: pauseExpiresAt(pause).toISOString(),
            },
          }),
        )
      }

      return { effects, rejections: [] }
    }

    case 'checkin.start': {
      const { checkIn, ministryName } = context
      if (!checkIn) throw new Error('checkin.start was handed nobody to check in with')
      if (!ministryName) {
        throw new Error('checkin.start was handed no Ministry to speak for')
      }

      // The direct trigger. It asks *now* and does not consult the cadence,
      // which is what lets 08a prove the conversation with no scheduler near it.
      // In production `scheduled.tick` is the only thing that opens one -- and
      // nothing scheduled this one, so its message carries no stamp.
      return {
        effects: openConversationWith(checkIn, {
          ministryId: command.ministryId,
          ministryName,
          now: context.clock.now(),
          ids: context.ids,
          scheduledFor: null,
        }),
        rejections: [],
      }
    }

    case 'sms.inbound': {
      const { checkIn, ministryName } = context
      if (!checkIn) throw new Error('sms.inbound was handed nobody it could be from')
      if (!ministryName) {
        throw new Error('sms.inbound was handed no Ministry to speak for')
      }

      const now = context.clock.now()

      // Keywords are read before a reply is interpreted as a check-in answer.
      // A `STOP` arriving while the satisfaction question is open is somebody
      // asking to be left alone, and reading it as an unreadable rating would
      // keep texting them.
      //
      // It opts out the Person and not one of their relationships: that is the
      // level a carrier applies it at, and it is what stops every message rather
      // than the ones about one relationship.
      //
      // Any open conversation ends with it, as abandoned. Not a second rule: a
      // Person Discipler may no longer text has no conversation left to have, and
      // leaving one open would mean the next question it tried to send was
      // refused by the outbound queue -- a reply from them failing outright
      // rather than being heard. Abandoned rather than completed, because its
      // unanswered questions stay unanswered: they are what ticket 10 reads, and
      // an opt-out is not an answer.
      if (isStopKeyword(command.body)) {
        const effects: Effect[] = [
          optPersonOut({
            ministryId: command.ministryId,
            personId: checkIn.personId,
            startedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.opted_out',
            subjectType: 'person',
            subjectId: checkIn.personId,
            payload: { keyword: 'STOP' },
          }),
        ]

        if (checkIn.openSequence) {
          effects.push(
            ...abandonSequence({
              ministryId: command.ministryId,
              personId: checkIn.personId,
              sequenceId: checkIn.openSequence.sequenceId,
              at: now,
              reason: 'opted_out',
            }),
          )
        }

        return { effects, rejections: [] }
      }

      // Resolution stops here when there is no open conversation. Nothing falls
      // back to *the Person's relationship*: a Leader may hold several, and the
      // position in the sequence is the only thing that says which one a `1` is
      // about.
      const sequence = checkIn.openSequence
      const awaiting = sequence?.awaiting
      if (!sequence || !awaiting) return { effects: [], rejections: [] }

      const reply = readCheckInReply(awaiting.question, command.body)
      const answered = sequence.covering[awaiting.position - 1]

      const asking: Asking = {
        ministryId: command.ministryId,
        ministryName,
        sequenceId: sequence.sequenceId,
        personId: checkIn.personId,
        phone: checkIn.phone,
        now,
        ids: context.ids,
        // A reply is what produced this, not a cadence. Only the message that
        // opens a conversation carries the cadence that made it due; the rest of
        // the thread travels back in seconds and nothing scheduled any of it.
        scheduledFor: null,
      }

      // A reply that resolves to no token, or to two. The question stays open and
      // the conversation stays exactly where it was: nothing is recorded as
      // answered, because a guess here is the one failure the whole matching rule
      // exists to prevent.
      if (reply.kind === 'unreadable') {
        const clarifying = awaiting.clarificationsSent < CLARIFICATIONS_PER_QUESTION

        const effects: Effect[] = [
          // Recorded whether or not it is answered, including the ones past the
          // cap. This is the record the enumerated list of synonyms and typos
          // grows from -- from what Leaders actually typed, never from what
          // somebody imagined they might.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'checkin.reply_unreadable',
            subjectType: 'relationship',
            subjectId: answered?.relationshipId ?? null,
            payload: {
              sequenceId: sequence.sequenceId,
              promptId: awaiting.promptId,
              personId: checkIn.personId,
              question: awaiting.question,
              body: command.body,
              clarified: clarifying,
            },
          }),
        ]

        // Two, and then Discipler stops talking -- not listening. The question is
        // still open, and a valid reply is still accepted right up until the
        // sequence advances past it. Only Discipler's side is capped.
        if (clarifying) {
          effects.push(
            clarifyCheckInQuestion({
              ministryId: command.ministryId,
              promptId: awaiting.promptId,
              clarifiedAt: now,
            }),
            sayToLeader(
              asking,
              checkInClarification({ ministryName, question: awaiting.question }),
            ),
          )
        }

        return { effects, rejections: [] }
      }

      const effects: Effect[] = [
        recordCheckInAnswer({
          ministryId: command.ministryId,
          promptId: awaiting.promptId,
          // The Person who sent it, never the relationship alone. A relationship
          // is not assumed to have one respondent, which is what lets Participant
          // check-ins be added without migrating what a Leader already answered.
          personId: checkIn.personId,
          answeredAt: now,
          ...recorded(reply),
        }),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'checkin.answered',
          subjectType: 'relationship',
          subjectId: answered?.relationshipId ?? null,
          payload: {
            sequenceId: sequence.sequenceId,
            personId: checkIn.personId,
            role: answered?.role ?? null,
            question: awaiting.question,
            ...withoutTheProse(reply),
          },
        }),
      ]

      // The Leader's words become a Concern of their own. Not the same record as
      // the reply they arrived in: this one is reached one Person at a time,
      // audited when it is *read*, cleared when it is resolved, and counted when
      // several stand open -- none of which the prompt row is or does. It carries
      // that row's id so the resolution can clear both copies at once.
      if (reply.kind === 'concern_detail' && answered) {
        effects.push(
          raiseConcern({
            id: concernId(context.ids.next()),
            ministryId: command.ministryId,
            relationshipId: answered.relationshipId,
            raisedBy: checkIn.personId,
            raisedAt: now,
            promptId: awaiting.promptId,
            detail: reply.detail,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'concern.raised',
            subjectType: 'relationship',
            subjectId: answered.relationshipId,
            // The prose is deliberately absent. History is append-only, so a
            // payload carrying the text would survive the resolution that cleared
            // it -- which would make clear-on-resolve a gesture rather than a rule.
            payload: { sequenceId: sequence.sequenceId, raisedBy: checkIn.personId },
          }),
        )
      }

      const advance = advancePastPaused(sequence, awaiting, reply)

      if (advance.kind === 'finish') {
        effects.push(
          sayToLeader(asking, checkInThankYou({ ministryName })),
          closeCheckInSequence({
            ministryId: command.ministryId,
            sequenceId: sequence.sequenceId,
            closedAt: now,
            outcome: 'completed',
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'checkin.sequence_completed',
            subjectType: 'person',
            subjectId: checkIn.personId,
            payload: { sequenceId: sequence.sequenceId },
          }),
        )
        return { effects, rejections: [] }
      }

      // Whatever the ladder said comes next: the rest of this relationship's
      // turn, or the next relationship's opening question sent where a closing
      // thank-you would otherwise have fallen.
      effects.push(...askNext(asking, advance))

      return { effects, rejections: [] }
    }

    case 'relationship.cancel': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.cancel was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Cancelling twice frees nobody twice, and the second one would overwrite the
      // date the first one recorded.
      if (relationship.endedAt !== null) {
        throw new CancellationRefused('relationship.already_ended')
      }
      // Every Leader agreed and the Starter Message has gone out. Stopping it now is
      // an *ending*, it carries a required outcome, and it is ticket 13's -- so this
      // refuses rather than quietly doing two thirds of it.
      if (relationship.acceptedAt !== null) {
        throw new CancellationRefused('relationship.already_accepted')
      }

      const memberIds = relationship.members.map((member) => member.personId)

      // Nobody is told. A Leader who never answered is not chased about a decision
      // that has been reversed, and no Participant has heard anything at all --
      // nothing reaches them until every Leader has agreed.
      return {
        rejections: [],
        effects: [
          cancelRelationship({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            cancelledAt: now,
            cancelledBy: command.cancelledBy,
            memberIds,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.cancelled',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              memberIds,
              waitedDays: daysSince(relationship.createdAt, now),
              // Append-only, so this is the record that survives the Admin
              // leaving the Ministry and `ended_by` being nulled with them.
              cancelledBy: command.cancelledBy,
            },
          }),
        ],
      }
    }

    case 'relationship.end': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.end was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Terminal, and the first thing checked. A second ending would overwrite the
      // outcome and the reason the first one recorded, which is the one part of an
      // ending that cannot be reconstructed afterwards.
      if (relationship.endedAt !== null) throw new EndingRefused('ending.already_ended')
      // Nobody agreed to it, so it never ran and cannot have completed. Withdrawing
      // one is `relationship.cancel`, and letting this command do both would put an
      // outcome on a relationship that never had one.
      if (relationship.acceptedAt === null) {
        throw new EndingRefused('ending.relationship_not_accepted')
      }

      const reason = command.reason.trim()
      // Both checked rather than trusted, for the reason the pause period is: this
      // command is built from a request body. The database refuses each of these
      // too -- a check constraint on the reason, an enum on the outcome -- and
      // hitting either of those is a Postgres error where a surface needs a code.
      if (reason.length === 0) throw new EndingRefused('ending.reason_is_required')
      if (!isRelationshipOutcome(command.outcome)) {
        throw new EndingRefused('ending.outcome_not_recognised')
      }

      const memberIds = relationship.members.map((member) => member.personId)

      // Nobody is told. No Admin action sends a message, and an Admin who wants to
      // say something to the people in a relationship they have just ended picks up
      // the phone -- which is the whole of Discipler's position on admin sending.
      //
      // A Pause standing on it is not resumed first and is not cleared. `Ended`
      // outranks `Paused` in the derivation, and ending is the decision the Pause
      // existed to defer.
      return {
        rejections: [],
        effects: [
          endRelationship({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            endedAt: now,
            endedBy: command.endedBy,
            reason,
            outcome: command.outcome,
            memberIds,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.ended',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              memberIds,
              reason,
              outcome: command.outcome,
              // Append-only, so this is the record that survives the Admin leaving
              // the Ministry and `ended_by` being nulled with them.
              endedBy: command.endedBy,
              // How long it ran is deliberately absent. It is `accepted_at` to
              // `ended_at`, both of them stored, and a third copy of the same
              // number is a second answer waiting to disagree with them.
            },
          }),
        ],
      }
    }

    case 'relationship.depart': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.depart was handed no relationship to act on')
      }

      const now = context.clock.now()

      if (relationship.endedAt !== null) {
        throw new DepartureRefused('departure.relationship_ended')
      }
      // Nothing has reached a Participant yet, so there is no relationship for one
      // to leave. Withdrawing one nobody agreed to is `relationship.cancel`, which
      // takes everybody out of it at once -- and leaving a Participant out of a
      // relationship still awaiting its Leader would shorten a Starter Message
      // nobody has sent yet. The same refusal a Pause carries for this state.
      if (relationship.acceptedAt === null) {
        throw new DepartureRefused('departure.relationship_not_accepted')
      }

      // Open memberships only, which is what the snapshot holds: somebody who has
      // already left is not in this relationship to leave it a second time.
      const leaving = relationship.members.find(
        (member) => member.personId === command.personId,
      )
      if (!leaving) {
        throw new DepartureRefused('departure.person_is_not_in_this_relationship')
      }
      // A relationship without its Leader does not continue with whoever remains.
      // That is a relationship that is over, and ending one records an outcome --
      // which a departure has nowhere to put.
      if (leaving.role === 'leader') {
        throw new DepartureRefused('departure.person_is_a_leader')
      }

      const remaining = relationship.members.filter(
        (member) => member.role === 'participant' && member.personId !== command.personId,
      )
      // The same refusal in its other shape. Three Participants becoming one is a
      // relationship carrying on with fewer people in it; one becoming none is a
      // relationship with nobody being discipled, and there is no check-in question
      // to ask about nobody.
      if (remaining.length === 0) {
        throw new DepartureRefused('departure.would_leave_no_participants')
      }

      // One membership closed, and nothing else. The relationship is untouched, the
      // weeks this Participant was present for stay attached to it exactly as they
      // were recorded, and the check-in copy follows the Participants who remain
      // without anything here telling it to -- `checkInSubject` reads the open
      // memberships, so there is no group-versus-one-to-one branch to keep in step.
      //
      // Nobody is told, for the reason an ending tells nobody.
      return {
        rejections: [],
        effects: [
          departFromRelationship({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            personId: command.personId,
            departedAt: now,
            departedBy: command.departedBy,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.participant_departed',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: { personId: command.personId, departedBy: command.departedBy },
          }),
        ],
      }
    }

    case 'relationship.assign_material': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.assign_material was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Terminal first, as everywhere else. A relationship that is over has no
      // further week to attribute, and a period opened after its ending would be
      // one no report could ever ask about.
      if (relationship.endedAt !== null) {
        throw new MaterialAssignmentRefused('material.relationship_ended')
      }
      // The period with no Material starts at acceptance. Before that there is
      // nothing to close, and a period opened now would start after the one
      // acceptance is about to open -- which is the gap the opening period exists
      // to prevent, written by the very act that was supposed to fill it.
      if (relationship.acceptedAt === null) {
        throw new MaterialAssignmentRefused('material.relationship_not_accepted')
      }

      // A Pause is not checked, deliberately. It suspends this relationship's
      // check-ins and nothing else, and deciding what a Leader will pick up when
      // they come back is exactly the sort of thing an Admin does during one. The
      // weeks a Pause covers are dropped from `relationship_weeks` anyway, so the
      // period spanning it attributes nothing either way.
      //
      // Nor is the Material this relationship is already on. Assigning the same
      // one again is a dated fact like any other -- it closes one period and opens
      // another with the same Material in it, which leaves every report that sums
      // by Material with the same answer and leaves the record saying truthfully
      // that somebody decided this on that day.
      return {
        rejections: [],
        effects: [
          assignMaterial({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            materialId: command.materialId,
            assignedAt: now,
            assignedBy: command.assignedBy,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.material_assigned',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            // Append-only, so this is the record that survives the Admin leaving
            // the Ministry and `assigned_by` being nulled with them. The period
            // that ended is deliberately absent: it is a row with a date on it,
            // and a second copy of that date here would be an answer waiting to
            // disagree with the first.
            payload: { materialId: command.materialId, assignedBy: command.assignedBy },
          }),
        ],
      }
    }

    case 'relationship.pause': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.pause was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Terminal first. Ending is the one thing a Pause is not a lighter version
      // of, and pausing something that has ended would append a fact about a
      // relationship that no longer has a present tense.
      if (relationship.endedAt !== null) throw new PauseRefused('pause.relationship_ended')
      // Nothing has been sent and no week has been covered, so there is nothing to
      // suspend. `Awaiting Leader Acceptance` is what it should still read as, and
      // `Paused` masking it would hide a relationship the acceptance escalation is
      // still counting the days on.
      if (relationship.acceptedAt === null) {
        throw new PauseRefused('pause.relationship_not_accepted')
      }
      // A second pause would silently move the first one's expiry, so a fortnight
      // away would become a fortnight from whenever somebody last clicked.
      if (relationship.pause !== null) throw new PauseRefused('pause.already_paused')

      const periodWeeks: PausePeriodWeeks =
        command.periodWeeks ?? DEFAULT_PAUSE_PERIOD_WEEKS

      // Checked, not trusted. `PausePeriodWeeks` is a compile-time union and this
      // command is built from a request body, so nothing between the two has
      // actually looked at the number. A three-week pause written into history is
      // a row `readStandingPause` refuses -- on the tick and on Care Needed both --
      // so the cheapest place to stop it is here, before it is a fact.
      if (!isPausePeriod(periodWeeks)) {
        throw new PauseRefused('pause.period_not_selectable')
      }

      // One event and nothing else. Membership is untouched -- which is the whole
      // of *nobody returns to the suggestion pool*, because `participation_status`
      // and the participation caps both read open memberships -- and nobody is
      // told: Discipler stops asking, it does not announce that it has stopped.
      //
      // The expiry date is deliberately not in the payload. It is
      // `pauseExpiresAt` of the two facts that are, and a third copy of the same
      // number is a second answer waiting to disagree with them.
      return {
        rejections: [],
        effects: [
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.paused',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: { periodWeeks, pausedBy: command.pausedBy },
          }),
        ],
      }
    }

    case 'relationship.resume': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.resume was handed no relationship to act on')
      }
      const { ministryName } = context
      if (!ministryName) {
        throw new Error('relationship.resume was handed no Ministry to speak for')
      }

      const now = context.clock.now()

      if (relationship.endedAt !== null) throw new PauseRefused('pause.relationship_ended')

      const pause = relationship.pause
      if (!pause) throw new PauseRefused('pause.not_paused')

      const leaders = relationship.members.filter((member) => member.role === 'leader')
      const participants = relationship.members.filter(
        (member) => member.role === 'participant',
      )

      // Resuming restores nothing by itself: it removes the mask, and the state
      // underneath is whatever the history yields. **It never sets `Healthy`** --
      // a relationship that was `Stalled` when it was paused is `Stalled` again
      // and clears only on an answered check-in, because setting `Healthy` here
      // would silently erase a live care signal.
      //
      // Nor does it close the `pause_expired` item, if one stands. A Follow-Up
      // Item closes when an Admin resolves it and at no other time, exactly as
      // cancelling a relationship does not close the item that surfaced it.
      return {
        rejections: [],
        effects: [
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.resumed',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              periodWeeks: pause.periodWeeks,
              resumedBy: command.resumedBy,
              // Whether the Admin was acting on an expiry item or coming back
              // early. Both are ordinary; the Week-by-Week History is where the
              // difference is worth keeping.
              expired: pauseHasExpired(pause, now),
            },
          }),
          // Everyone in the relationship hears that it is running again --
          // which is what *releases the Starter Message* comes to, and expiry
          // never does it. Not the Starter Message itself: *you have been
          // paired* is true on the day the match is made and would be a Ministry
          // telling somebody they had been matched to the person they have been
          // meeting all year.
          //
          // Each side is told the other side's names, like the Starter Message,
          // and neither carries a number.
          ...relationship.members.map((member) =>
            enqueueMessage({
              ministryId: command.ministryId,
              personId: member.personId,
              toPhone: member.phone,
              body: resumedMessage({
                ministryName,
                withNames: (member.role === 'leader' ? participants : leaders).map(
                  (other) => other.fullName,
                ),
              }),
              enqueuedAt: now,
              disclosesPersonId: null,
            }),
          ),
        ],
      }
    }

    case 'follow_up.resolve': {
      const now = context.clock.now()

      // No note, deliberately. Resolving is one click on a surface designed not to
      // have a writing task on it, and what the Admin actually did -- cancelled,
      // ended -- is recorded as a fact of its own rather than retyped here.
      return {
        rejections: [],
        effects: [
          resolveFollowUpItem({
            ministryId: command.ministryId,
            itemId: command.itemId,
            resolvedBy: command.resolvedBy,
            resolvedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'follow_up.resolved',
            subjectType: 'follow_up_item',
            subjectId: command.itemId,
            payload: { resolvedBy: command.resolvedBy },
          }),
        ],
      }
    }

    case 'concern.view': {
      const now = context.clock.now()

      // Reading it is the act being recorded, and it is recorded per viewing
      // rather than as a flag: the second Admin to open a Concern is a fact as
      // much as the first was. The text itself is nowhere in here -- the unit of
      // work returns it to the caller, and history keeps only that it was read.
      return {
        rejections: [],
        effects: [
          recordConcernViewing({
            ministryId: command.ministryId,
            concernId: command.concernId,
            viewedBy: command.viewedBy,
            viewedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'concern.viewed',
            subjectType: 'concern',
            subjectId: command.concernId,
            payload: { viewedBy: command.viewedBy },
          }),
        ],
      }
    }

    case 'concern.resolve': {
      const now = context.clock.now()

      return {
        rejections: [],
        effects: [
          resolveConcern({
            ministryId: command.ministryId,
            concernId: command.concernId,
            resolvedBy: command.resolvedBy,
            resolvedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'concern.resolved',
            subjectType: 'concern',
            subjectId: command.concernId,
            payload: { resolvedBy: command.resolvedBy },
          }),
        ],
      }
    }

    case 'person.import': {
      // Absent rather than empty. An empty Roster and an unloaded one are the same
      // value and opposite facts, and the second one silently re-imports everybody.
      if (!context.roster) {
        throw new Error('person.import was handed no Roster to compare against')
      }

      const { people, rejected } = readRosterFile(command.csv)
      const alreadyOnTheRoster = context.roster.people
      const now = context.clock.now()

      const effects: Effect[] = []
      const rejections: RowRejection[] = [...rejected]

      for (const row of people) {
        // A row for someone already on the Roster is reported and left alone: a
        // stale export must not overwrite a name or an email the Person themselves
        // gave at Intake.
        if (alreadyOnTheRoster.has(rosterKey(row))) {
          rejections.push({ line: row.line, problem: 'already_on_the_roster' })
          continue
        }

        // The number is on the Roster under another name. Discipler will not guess
        // whether that is a rename or the second person on a shared phone, because
        // both are ordinary in a congregation and each guess loses the other one.
        // Reported, never dropped and never silently filed twice.
        if (context.roster.namesByNumber.has(row.phone)) {
          rejections.push({ line: row.line, problem: 'same_number_different_name' })
          continue
        }

        const person = {
          id: personId(context.ids.next()),
          ministryId: command.ministryId,
          fullName: row.fullName,
          phone: row.phone,
          email: row.email,
          createdAt: now,
        }

        // No message of any kind. Being on a Roster is not consent and is not a wish
        // to participate, and Intake is the only thing that grants either.
        effects.push(
          createPerson(person),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.imported',
            subjectType: 'person',
            subjectId: person.id,
            payload: { fullName: person.fullName },
          }),
        )
      }

      return {
        effects,
        rejections: rejections.sort((first, second) => first.line - second.line),
      }
    }

    case 'intake.submit': {
      if (!context.roster) {
        throw new Error('intake.submit was handed no Roster to look the Person up in')
      }
      if (!context.ministryName) {
        throw new Error('intake.submit was handed no Ministry to speak for')
      }

      const reading = readIntakeForm(command.form)
      if ('refusals' in reading) throw new IntakeRefused(reading.refusals)

      const { submission } = reading
      const now = context.clock.now()
      const effects: Effect[] = []

      // Usually they are already here: an Admin imported the congregation and then
      // sent the link. A QR code at a leaders' meeting reaches people who are not,
      // and Intake is a way onto the Roster as much as a way through it.
      const key = rosterKey(submission)
      const existing = context.roster.people.get(key)
      const id = existing ?? personId(context.ids.next())

      if (!existing) {
        effects.push(
          createPerson({
            id,
            ministryId: command.ministryId,
            fullName: submission.fullName,
            phone: submission.phone,
            email: submission.email,
            createdAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.joined_at_intake',
            subjectType: 'person',
            subjectId: id,
            payload: { fullName: submission.fullName },
          }),
        )
      }

      // Their first submission, or a repeat. Everything below is recorded either
      // way -- a re-submission is a real act and leaves a real trail -- but only the
      // first one is greeted.
      const isFirstSubmission = !context.roster.whoCompletedIntake.has(id)

      effects.push(
        recordIntake({
          ministryId: command.ministryId,
          personId: id,
          submittedAt: now,
          ageBand: submission.ageBand,
          gender: submission.gender,
          goalId: submission.goalId,
          availability: submission.availability,
          email: submission.email,
          consentVersion: CONSENT_VERSION,
          source: submission.source,
          // Both decisions, always, including a refusal. What is current is the
          // latest record for that consent, so a decision that writes no row is a
          // decision that cannot be seen -- and on a re-submission it silently
          // leaves the previous answer standing.
          consentDecisions: [
            // Always granted: `intake.sms_consent_required` refuses a submission
            // without it. The form grants consent and never withdraws it; `STOP` is
            // the withdrawal route.
            { consent: 'sms', granted: true },
            { consent: 'contact_sharing', granted: submission.contactSharingConsent },
          ],
        }),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'intake.submitted',
          subjectType: 'person',
          subjectId: id,
          payload: {
            source: submission.source,
            consentVersion: CONSENT_VERSION,
            contactSharingConsent: submission.contactSharingConsent,
            availabilitySlots: submission.availability.length,
          },
        }),
      )

      // The one message that goes out before anybody has been paired. It reaches a
      // Person who has just given SMS consent on this form, which is the thing *no
      // SMS before pairing approval* exists to protect -- so that rule governs
      // relationship messaging and not this. Settled in docs/open-questions.md.
      if (isFirstSubmission) {
        effects.push(
          enqueueMessage({
            ministryId: command.ministryId,
            personId: id,
            toPhone: submission.phone,
            body: welcomeMessage({
              ministryName: context.ministryName,
              fullName: submission.fullName,
            }),
            enqueuedAt: now,
            // Nothing. There is no relationship yet, so there is nobody to
            // introduce -- and this is the message that reaches them before one
            // exists.
            disclosesPersonId: null,
          }),
        )
      }

      return { effects, rejections: [] }
    }

    case 'relationship.create': {
      const { leaderIds, participantIds } = command
      const ministryName = context.ministryName
      const baseUrl = context.appBaseUrl
      if (!ministryName) {
        throw new Error('relationship.create was handed no Ministry to speak for')
      }
      if (!baseUrl) {
        throw new Error('relationship.create was handed nowhere for its links to point')
      }

      if (leaderIds.length === 0) {
        throw new PairingRefused('relationship.needs_a_leader')
      }
      if (participantIds.length === 0) {
        throw new PairingRefused('relationship.needs_a_participant')
      }
      if (participantIds.some((id) => leaderIds.includes(id))) {
        throw new PairingRefused('relationship.leader_cannot_be_a_participant')
      }
      // Both roles, in one check: a person named twice is named twice whether it
      // happened on one side of the relationship or on both.
      const everyone = [...leaderIds, ...participantIds]
      if (new Set(everyone).size !== everyone.length) {
        throw new PairingRefused('relationship.person_listed_twice')
      }

      const now = context.clock.now()
      const relationship = {
        id: relationshipId(context.ids.next()),
        ministryId: command.ministryId,
        // Derived once, from the shape being paired, and frozen. The counts are the
        // fact; the kind is a record of what they were at formation, kept so the
        // participation caps and the gender rule can be expressed in the database.
        kind: kindFor(leaderIds.length, participantIds.length),
        createdAt: now,
        members: membersOf(leaderIds, participantIds, now),
      }

      // Creating a relationship does not activate it: `accepted_at` stays null and
      // it reads as Awaiting Leader Acceptance. Every Leader is invited, and
      // nothing at all reaches a Participant -- they hear nothing until *every*
      // Leader has agreed to lead them, because nobody co-leads something they did
      // not agree to.
      const effects: Effect[] = [
        createRelationship(relationship),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'relationship.created',
          subjectType: 'relationship',
          subjectId: relationship.id,
          payload: {
            leaderIds: [...leaderIds],
            participantIds: [...participantIds],
            participantCount: participantIds.length,
          },
        }),
      ]

      for (const leaderId of leaderIds) {
        const leader = whoIs(context, leaderId)

        // Individualised: one token per Leader, so a co-leader's link is not a way
        // into anybody else's acceptance.
        const invitation = issueInvitation({
          ministryId: command.ministryId,
          relationshipId: relationship.id,
          personId: leaderId,
          token: invitationToken(context.ids.next()),
          at: now,
        })

        effects.push(
          issueInvitationLink(invitation),
          enqueueMessage({
            ministryId: command.ministryId,
            personId: leaderId,
            toPhone: leader.phone,
            body: invitationMessage({
              ministryName,
              fullName: leader.fullName,
              link: invitationLink(baseUrl, invitation.token),
            }),
            enqueuedAt: now,
            // No message to a Leader contains a phone number.
            disclosesPersonId: null,
          }),
        )
      }

      return { rejections: [], effects }
    }

    case 'relationship.accept': {
      const { invitation, ministryName } = tokenContext(context)
      const now = context.clock.now()

      const state = invitationState(invitation, now)
      if (state === 'expired') throw new InvitationRefused('invitation.expired')
      if (state === 'consumed') throw new InvitationRefused('invitation.already_used')

      const me = memberHolding(invitation, invitation.personId)
      // Read off their membership, never off the token. A Participant's link opens
      // the same page and leads somewhere else entirely.
      if (me.role !== 'leader') throw new InvitationRefused('invitation.not_a_leader')

      const leaders = invitation.members.filter((member) => member.role === 'leader')
      const participants = invitation.members.filter((member) => member.role === 'participant')

      // Every other open leader membership has already accepted, so this one is the
      // last. Activation is the whole set agreeing, not the first of them.
      const activatesRelationship = leaders.every(
        (leader) => leader.personId === me.personId || leader.acceptedAt !== null,
      )

      const effects: Effect[] = [
        acceptInvitation({
          ministryId: command.ministryId,
          relationshipId: invitation.relationshipId,
          personId: me.personId,
          token: command.token,
          fullName: command.fullName,
          userId: command.userId,
          acceptedAt: now,
          activatesRelationship,
        }),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'relationship.leader_accepted',
          subjectType: 'relationship',
          subjectId: invitation.relationshipId,
          payload: { personId: me.personId, activated: activatesRelationship },
        }),
      ]

      if (!activatesRelationship) return { rejections: [], effects }

      effects.push(
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'relationship.activated',
          subjectType: 'relationship',
          subjectId: invitation.relationshipId,
          payload: { participantCount: participants.length },
        }),
        // The Material history opens here, with a period that has no Material in
        // it. *Periods never leave gaps* includes the time before a Ministry has
        // assigned anything, and a row saying *none* is a fact a later report can
        // answer with -- where no row at all is indistinguishable from a defect,
        // in exactly the history this ticket exists because nobody can
        // reconstruct.
        //
        // At activation rather than at creation, and at this instant rather than
        // `createdAt`: no check-in week exists before every Leader has agreed, so
        // a period covering time no meeting could be reported in is noise. It
        // carries no Admin, because no Admin performed it.
        assignMaterial({
          ministryId: command.ministryId,
          relationshipId: invitation.relationshipId,
          materialId: null,
          assignedAt: now,
          assignedBy: null,
        }),
      )

      // **No link for a Participant, and there is nothing for one to do.** An
      // Invitation Link is how somebody is asked a question they have not yet
      // answered, and a Participant has already answered theirs: they completed
      // Intake and consented to be paired, which is the agreement a Leader's
      // acceptance is the other half of. Only the Leader is sent one.
      //
      // So a Participant does not decline. A match that is not working is a
      // pastoral matter and reaches Discipler as a swap -- the Admin unpairs and
      // re-pairs -- rather than as a Participant refusing the relationship on a
      // web page. Somebody who stops meeting or stops replying says so by the
      // silence the care rules already read, and an Admin acts on that.

      // The Starter Message. The Leaders' names the Participants; the
      // Participants' names the Leaders, and neither carries a number -- so this
      // message discloses nobody and one goes to each Participant however many
      // Leaders a group has.
      //
      // The Leader who just accepted typed a name, not a number: the number was
      // displayed and refused as input, so `phone` is still the one on file.
      const participantNames = participants.map((participant) => participant.fullName)
      const leaderNames = leaders.map((leader) => leader.fullName)

      for (const leader of leaders) {
        effects.push(
          enqueueMessage({
            ministryId: command.ministryId,
            personId: leader.personId,
            toPhone: leader.phone,
            body: starterMessageToLeader({ ministryName, participantNames }),
            enqueuedAt: now,
            disclosesPersonId: null,
          }),
        )
      }

      for (const participant of participants) {
        effects.push(
          enqueueMessage({
            ministryId: command.ministryId,
            personId: participant.personId,
            toPhone: participant.phone,
            body: starterMessageToParticipant({ ministryName, leaderNames }),
            enqueuedAt: now,
            disclosesPersonId: null,
          }),
        )
      }

      return { rejections: [], effects }
    }

    case 'invitation.dispute_number':
    case 'match.decline': {
      const invitation = context.invitation
      if (!invitation) {
        throw new Error(`${command.type} was handed no invitation to act on`)
      }

      const me = memberHolding(invitation, invitation.personId)
      const now = context.clock.now()

      // A Leader disputes the number Discipler holds for them; a Participant says
      // the match is not right. Neither is the other's, and a link forwarded to
      // somebody else cannot become one.
      if (command.type === 'invitation.dispute_number' && me.role !== 'leader') {
        throw new InvitationRefused('invitation.not_a_leader')
      }
      if (command.type === 'match.decline' && me.role !== 'participant') {
        throw new InvitationRefused('invitation.not_a_participant')
      }

      const kind =
        command.type === 'invitation.dispute_number'
          ? 'invitation_number_disputed'
          : 'match_declined'

      // It changes nothing else. A forwarded link can never re-point an account,
      // and unpairing stays a pastoral decision an Admin makes.
      return {
        rejections: [],
        effects: [
          raiseFollowUpItem({
            ministryId: command.ministryId,
            kind,
            personId: me.personId,
            relationshipId: invitation.relationshipId,
            raisedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: `follow_up.${kind}`,
            subjectType: 'relationship',
            subjectId: invitation.relationshipId,
            payload: { personId: me.personId },
          }),
        ],
      }
    }
  }
}
