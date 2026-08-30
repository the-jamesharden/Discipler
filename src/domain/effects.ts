import type {
  CheckInPromptId,
  CheckInQuestion,
  CheckInSequenceId,
  Satisfaction,
} from './check-in'
import type { ConcernResolution, ConcernViewing, NewConcern } from './concerns'
import type { NewHistoryEvent } from './history'
import type { MinistryId, PersonId, RelationshipId } from './ids'
import type {
  AgeBand,
  AvailabilitySlot,
  ConsentSource,
  DiscipleshipGoalId,
  Gender,
} from './intake'
import type { FollowUpResolution, NewFollowUpItem } from './follow-up'
import type { InvitationToken, NewInvitation } from './invitations'
import type { MemberRole, NewRelationship } from './relationships'
import type { NewPerson } from './roster'

/**
 * Commands return effects; they never perform I/O. The application service is the
 * only thing that turns an effect into a database write or a queued message, which
 * is what makes the whole domain drivable from a test with no infrastructure.
 */

/**
 * Whether the nudge ceiling governs a message. Two values because the rule needs
 * exactly two: the caps govern nudges specifically, and the Check-In Rhythm is
 * self-limiting by construction and needs no separate ceiling. A later ticket that
 * has to tell a Welcome Message from a reminder widens this.
 */
export type OutboundMessageKind = 'nudge' | 'other'

export interface OutboundMessageDraft {
  readonly ministryId: MinistryId
  /** Null when the recipient is not a Person on the Roster -- an Admin, say. */
  readonly personId: PersonId | null
  readonly toPhone: string | null
  readonly body: string
  readonly enqueuedAt: Date
  /**
   * The cadence instant that made this message due, when a cadence is what
   * produced it. Null on everything else, which is most messages: a reply travels
   * back in seconds and a Welcome Message answers a form.
   *
   * A record of which cadence sent this, never a gate on when it goes out -- the
   * dispatcher enqueues *because* the instant has arrived. Nothing rewrites it,
   * which is the whole of *an edit affects future periods only*: a coordinator
   * moving Monday 8pm to Wednesday 7pm on a Tuesday leaves this week's row
   * exactly as it was sent.
   */
  readonly scheduledFor: Date | null
  /**
   * Whose contact details this message offers to disclose, resolved at send time
   * against contact-sharing consent as it stands *then*. Null on almost every
   * message, and null without exception on anything bound for a Leader: no message
   * to a Leader contains a phone number.
   *
   * The body never carries the number itself. One that did would leave the
   * send-time check nothing to withhold.
   */
  readonly disclosesPersonId: PersonId | null
  /**
   * Whether the nudge ceiling governs this one. `'other'` on everything but a
   * nudge, and defaulted so that no existing path had to be changed to keep
   * meaning what it already meant -- only a caller that means to send a nudge
   * says so.
   *
   * The kind is what the sending layer meters on. It is not a hint the sender may
   * omit to get around the ceiling: a nudge enqueued as `'other'` is a bug, and
   * the database refuses the one shape that would make it undetectable by
   * requiring a nudge to name the Person it is counted against.
   */
  readonly kind: OutboundMessageKind
}

/**
 * What one completed Intake produces. The submission and the consents travel
 * together because they are one act: the form is the only thing that grants
 * consent, and a submission recorded without its consents would read as a Person
 * who filled the form in and agreed to nothing.
 */
/**
 * One consent decision as the form captured it. A refusal is a decision and is
 * recorded; it is not the absence of one.
 */
export interface ConsentDecision {
  readonly consent: 'sms' | 'contact_sharing'
  readonly granted: boolean
}

export interface IntakeRecord {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly submittedAt: Date
  readonly ageBand: AgeBand
  readonly gender: Gender
  readonly goalId: DiscipleshipGoalId
  readonly availability: readonly AvailabilitySlot[]
  /**
   * Optional on the form. When it is given it lands on the Person, because an
   * address somebody typed about themselves is better than one copied out of a
   * spreadsheet -- which is the same reason an import refuses to overwrite it.
   */
  readonly email: string | null
  /** The consent version the Person actually saw, recorded with each decision. */
  readonly consentVersion: string
  readonly source: ConsentSource
  /**
   * Every consent the form asked about, with what the Person decided. Both are
   * recorded, including a refusal.
   *
   * A declined consent used to write no row at all, and the send-time check asked
   * whether one existed. That reads a first refusal correctly and a *withdrawal* not
   * at all: absence cannot distinguish "never asked" from "asked and said no", and it
   * leaves an earlier grant standing as the only record. The current decision is the
   * latest record for that Person and kind -- `app.current_consent` in the database.
   */
  readonly consentDecisions: readonly ConsentDecision[]
}

/**
 * One Leader agreeing to lead one relationship, which is several facts that are
 * only true together: the token is spent, the name they typed is theirs, the
 * account they just made is linked to their Person record, and the membership
 * carries the moment they agreed. Split across effects, a failure between any two
 * would leave an account with no Person or a spent token with no acceptance.
 */
export interface LeaderAcceptance {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  readonly personId: PersonId
  readonly token: InvitationToken
  /**
   * As the Leader typed it. A spelling difference from Intake is not an error and
   * raises nothing -- somebody correcting `Dave` to `David` is telling Discipler
   * something true, not failing a check.
   */
  readonly fullName: string
  /** The account just created. Linking it is what `person.user_id` is for. */
  readonly userId: string
  readonly acceptedAt: Date
  /**
   * Whether this was the last open leader membership left to accept. Only then
   * does the relationship leave Awaiting Leader Acceptance -- nobody co-leads
   * something they did not agree to -- and only then does anything reach a
   * Participant.
   */
  readonly activatesRelationship: boolean
}

/**
 * A relationship nobody accepted, withdrawn. One effect rather than a membership
 * close per Person, because the relationship and everyone in it leave together or
 * not at all -- a half-cancelled relationship would hold somebody out of the pool
 * for a decision that had already been reversed.
 */
export interface RelationshipCancellation {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  readonly cancelledAt: Date
  /**
   * The Admin who decided. Written to `relationship.ended_by`, whose composite key
   * onto `ministry_member` is what refuses somebody who merely holds an account,
   * and appended to history, which outlives the membership.
   */
  readonly cancelledBy: string
  /** Everyone whose open membership this closes. Recorded, not looked up again. */
  readonly memberIds: readonly PersonId[]
}

/**
 * One Leader's weekly conversation, opened. The relationships it covers are fixed
 * at this moment rather than re-read as it advances, so a pause halfway through
 * does not renumber the questions still to come.
 */
export interface NewCheckInSequence {
  readonly id: CheckInSequenceId
  readonly ministryId: MinistryId
  /** Whom the conversation is with. A Leader today; the row does not say so. */
  readonly personId: PersonId
  readonly startedAt: Date
  /**
   * What this week's conversation covers, in the order it asks. Recorded on the
   * sequence because the shape of a conversation is fixed when it opens -- a
   * relationship paused halfway through does not renumber the questions still to
   * come, and a relationship covered but never reached is still a
   * relationship-week that went unanswered.
   */
  readonly covering: readonly RelationshipId[]
}

/**
 * One question, sent. It carries the relationship it is about *and* the role it
 * was sent for, which is what keeps a dual-role Person's messages apart in the
 * data when they share one phone number -- and what makes Participant check-ins
 * addable later without migrating anything.
 */
export interface NewCheckInPrompt {
  readonly id: CheckInPromptId
  readonly ministryId: MinistryId
  readonly sequenceId: CheckInSequenceId
  readonly relationshipId: RelationshipId
  readonly role: MemberRole
  /** Position in the conversation, so history reads back in the order it happened. */
  readonly position: number
  readonly question: CheckInQuestion
  readonly askedAt: Date
}

/**
 * One reply, bound to the question it answers and to the Person who sent it.
 *
 * `personId` is not decoration: nothing may assume one respondent per
 * relationship, so an answer keyed to the relationship alone would have to be
 * rewritten the day a Ministry asks for Participant check-ins.
 */
export interface CheckInAnswer {
  readonly ministryId: MinistryId
  readonly promptId: CheckInPromptId
  readonly personId: PersonId
  readonly answeredAt: Date
  /** Set by a `met` answer, null on every other question. */
  readonly met: boolean | null
  /** `outstanding`, `good` or `concern` -- the word, never the letter. */
  readonly satisfaction: Satisfaction | null
  /** The Concern in the Leader's own words. Prose, unparsed. */
  readonly detail: string | null
}

/**
 * One clarification spent on the question that is open, against the cap of
 * `CLARIFICATIONS_PER_QUESTION`.
 *
 * Counted on the prompt rather than derived by counting unreadable replies in
 * history, because they are different numbers: the third unreadable reply is
 * recorded and answered with nothing, so a Leader who mistypes five times has
 * five events and two clarifications. The cap is over what Discipler said.
 */
export interface CheckInClarification {
  readonly ministryId: MinistryId
  readonly promptId: CheckInPromptId
  readonly clarifiedAt: Date
}

/**
 * The one re-send an unanswered question gets, stamped on the prompt it re-sent.
 *
 * Deliberately not a second prompt row. A reminder that created one would be
 * counted as a second question the Leader failed to answer, which would advance
 * ticket 10's stall threshold twice for one silence -- so the question keeps its
 * identity and only gains the date it was chased on.
 */
export interface CheckInReminder {
  readonly ministryId: MinistryId
  readonly promptId: CheckInPromptId
  readonly remindedAt: Date
}

export interface CheckInSequenceClosure {
  readonly ministryId: MinistryId
  readonly sequenceId: CheckInSequenceId
  readonly closedAt: Date
  /**
   * `completed` once the final relationship has been answered for and the
   * thank-you sent, and only then.
   *
   * `abandoned` every other way a conversation ends: a new week displaced it, a
   * `STOP` ended it, or its last question was reminded once and given up on. The
   * three are one outcome because they are one fact -- the Leader did not finish
   * it -- and the questions it left open stay unanswered in history rather than
   * being tidied away. Which of the three it was is on the history event beside
   * it, where a reason belongs.
   */
  readonly outcome: 'completed' | 'abandoned'
}

/**
 * The carrier-level opt-out, at the level the carrier applies it: the Person, not
 * any one relationship. Dated rather than flagged, because `STOP` today and a
 * re-opt-in in six weeks are two facts.
 */
export interface PersonOptOut {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly startedAt: Date
}

export type Effect =
  | { readonly kind: 'history.append'; readonly event: NewHistoryEvent }
  | { readonly kind: 'person.create'; readonly person: NewPerson }
  | { readonly kind: 'intake.record'; readonly intake: IntakeRecord }
  | { readonly kind: 'message.enqueue'; readonly message: OutboundMessageDraft }
  | { readonly kind: 'relationship.create'; readonly relationship: NewRelationship }
  | { readonly kind: 'invitation.issue'; readonly invitation: NewInvitation }
  | { readonly kind: 'invitation.accept'; readonly acceptance: LeaderAcceptance }
  | { readonly kind: 'followUp.raise'; readonly item: NewFollowUpItem }
  | { readonly kind: 'followUp.resolve'; readonly resolution: FollowUpResolution }
  | {
      readonly kind: 'relationship.cancel'
      readonly cancellation: RelationshipCancellation
    }
  | { readonly kind: 'checkin.open'; readonly sequence: NewCheckInSequence }
  | { readonly kind: 'checkin.ask'; readonly prompt: NewCheckInPrompt }
  | { readonly kind: 'checkin.answer'; readonly answer: CheckInAnswer }
  | { readonly kind: 'checkin.clarify'; readonly clarification: CheckInClarification }
  | { readonly kind: 'checkin.remind'; readonly reminder: CheckInReminder }
  | { readonly kind: 'checkin.close'; readonly closure: CheckInSequenceClosure }
  | { readonly kind: 'person.opt_out'; readonly optOut: PersonOptOut }
  | { readonly kind: 'concern.raise'; readonly concern: NewConcern }
  | { readonly kind: 'concern.view'; readonly viewing: ConcernViewing }
  | { readonly kind: 'concern.resolve'; readonly resolution: ConcernResolution }

export const appendHistory = (event: NewHistoryEvent): Effect => ({
  kind: 'history.append',
  event,
})

export const recordIntake = (intake: IntakeRecord): Effect => ({
  kind: 'intake.record',
  intake,
})

export const enqueueMessage = (
  message: Omit<OutboundMessageDraft, 'scheduledFor' | 'kind'> & {
    readonly scheduledFor?: Date | null
    readonly kind?: OutboundMessageKind
  },
): Effect => ({
  kind: 'message.enqueue',
  message: {
    ...message,
    // Null unless the caller names a cadence, because almost nothing has one: a
    // message answers an act, and only the dispatcher enqueues *because* a cadence
    // instant arrived. Stated once here rather than on every call that has none.
    scheduledFor: message.scheduledFor ?? null,
    // Unmetered unless the caller says it is a nudge. Defaulting the other way
    // would meter the Check-In Rhythm, which the rule exempts, and would make
    // every existing send subject to a ceiling nobody asked it to obey.
    kind: message.kind ?? 'other',
  },
})

export const createRelationship = (relationship: NewRelationship): Effect => ({
  kind: 'relationship.create',
  relationship,
})

export const createPerson = (person: NewPerson): Effect => ({
  kind: 'person.create',
  person,
})

export const issueInvitationLink = (invitation: NewInvitation): Effect => ({
  kind: 'invitation.issue',
  invitation,
})

export const acceptInvitation = (acceptance: LeaderAcceptance): Effect => ({
  kind: 'invitation.accept',
  acceptance,
})

export const raiseFollowUpItem = (item: NewFollowUpItem): Effect => ({
  kind: 'followUp.raise',
  item,
})

export const resolveFollowUpItem = (resolution: FollowUpResolution): Effect => ({
  kind: 'followUp.resolve',
  resolution,
})

export const cancelRelationship = (cancellation: RelationshipCancellation): Effect => ({
  kind: 'relationship.cancel',
  cancellation,
})

export const openCheckInSequence = (sequence: NewCheckInSequence): Effect => ({
  kind: 'checkin.open',
  sequence,
})

export const askCheckInQuestion = (prompt: NewCheckInPrompt): Effect => ({
  kind: 'checkin.ask',
  prompt,
})

export const recordCheckInAnswer = (answer: CheckInAnswer): Effect => ({
  kind: 'checkin.answer',
  answer,
})

export const clarifyCheckInQuestion = (clarification: CheckInClarification): Effect => ({
  kind: 'checkin.clarify',
  clarification,
})

export const remindCheckInQuestion = (reminder: CheckInReminder): Effect => ({
  kind: 'checkin.remind',
  reminder,
})

export const closeCheckInSequence = (closure: CheckInSequenceClosure): Effect => ({
  kind: 'checkin.close',
  closure,
})

export const optPersonOut = (optOut: PersonOptOut): Effect => ({
  kind: 'person.opt_out',
  optOut,
})

export const raiseConcern = (concern: NewConcern): Effect => ({
  kind: 'concern.raise',
  concern,
})

export const recordConcernViewing = (viewing: ConcernViewing): Effect => ({
  kind: 'concern.view',
  viewing,
})

export const resolveConcern = (resolution: ConcernResolution): Effect => ({
  kind: 'concern.resolve',
  resolution,
})
