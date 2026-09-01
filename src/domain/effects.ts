import type { GoalWording } from './discipleship-goals'
import type {
  CheckInPromptId,
  CheckInQuestion,
  CheckInSequenceId,
  Satisfaction,
} from './check-in'
import type { ConcernResolution, ConcernViewing, NewConcern } from './concerns'
import type { NewHistoryEvent } from './history'
import type { ImportRowId, MaterialId, MinistryId, PersonId, RelationshipId } from './ids'
import type {
  AgeBand,
  AvailabilitySlot,
  ConsentSource,
  DeclaredSide,
  DiscipleshipGoalId,
  Gender,
  IntakePath,
} from './intake'
import type { FollowUpResolution, NewFollowUpItem } from './follow-up'
import type {
  KeywordExchangeId,
  KeywordRelationship,
  RelationshipKeyword,
} from './keywords'
import type { NewIntakeLink } from './intake-link'
import type { MinistrySettings } from './ministry-settings'
import type { InvitationToken, NewInvitation } from './invitations'
import type { OutboundMessageKind, OutstandingReplyCutoff } from './outstanding-reply'
import type { MemberRole, NewRelationship, RelationshipOutcome } from './relationships'
import type { HeldImportRow, ImportRowAnswer, NewPerson, PhoneNumber } from './roster'

/**
 * Commands return effects; they never perform I/O. The application service is the
 * only thing that turns an effect into a database write or a queued message, which
 * is what makes the whole domain drivable from a test with no infrastructure.
 */

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
   * What kind of message this is, which is the only thing serialisation reads. A
   * phone holds one conversation at a time, and nothing else on the row tells a
   * scheduled question apart from a Starter Message: both carry a number, a body
   * and no reply yet.
   *
   * Required rather than defaulted. A default would be a quiet answer to *does
   * this take the recipient's number*, and the two wrong answers are a Welcome
   * Message that blocks a first check-in and a check-in question that lets a
   * second one land on top of it.
   */
  readonly kind: OutboundMessageKind
}

/**
 * One phone's conversation, closed, so whatever was waiting behind it may go out.
 *
 * The number is the key and the Person is not, which is the whole of the rule: a
 * number holds one conversation however many people are reachable on it.
 *
 * Null on a Person with no number. There is nothing to close -- a message with no
 * `to_phone` is withheld before it can ever open anything -- and the effect carries
 * the null rather than the caller filtering it out, so that *this Person has no
 * number* stays one thing said in one place.
 */
export interface OutstandingReplyClosure {
  readonly ministryId: MinistryId
  readonly phone: string | null
  /**
   * `answered` -- the reply arrived and bound to it. `timed_out` -- a reply can no
   * longer change anything, which a new week's sequence makes true of last week's
   * question the moment it opens.
   *
   * `superseded` is deliberately absent. Nothing decides it: it is what happens to
   * whatever was open when a later question takes the number, and the queue writes it
   * in the same statement that takes it.
   */
  readonly as: 'answered' | 'timed_out'
  /**
   * Which kinds of question this closes. `WHATEVER_WAS_ASKED` where a reply
   * arrived and settled it; `LAST_WEEKS_QUESTION` where a new week replaced it and
   * a Keyword Exchange running on its own clock must survive.
   *
   * A list rather than a mode, so the rule stays where the rest of it is: nothing
   * downstream has to know which kinds exist in order to apply this.
   */
  readonly closing: readonly OutboundMessageKind[]
}

/**
 * Every outstanding reply the clock has run out on, in one statement.
 *
 * Cutoffs rather than a rule, for the reason `outstandingReplyCutoffs` gives: the
 * windows belong to the Check-In Rhythm and are read against the injected clock,
 * so what reaches the database is two instants and no product knowledge.
 */
export interface OutstandingReplySweep {
  readonly ministryId: MinistryId
  readonly cutoffs: readonly OutstandingReplyCutoff[]
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

/** What a Person changed about themselves, on a form that already knew who they were. */
export interface ContactCorrection {
  readonly fullName: string
  readonly phone: PhoneNumber
}

export interface IntakeRecord {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly submittedAt: Date
  /**
   * The name and number as the Person just typed them, landing on the Person
   * record -- and null on the Ministry-wide form, where nothing may land.
   *
   * The two routes differ in who they name, and that is what decides this. On the
   * Ministry-wide form a Person *is* the name and number they typed: they were
   * recognised by that pair, so writing it back could only ever overwrite what they
   * were matched against with a differently-cased copy of itself. Through a link an
   * Admin sent, the token names them -- so the pair is no longer how they are
   * recognised, and is instead exactly what they came to change.
   *
   * Without this write, a correction would be recorded on the submission and never
   * reach the number Discipler dials.
   */
  readonly corrections: ContactCorrection | null
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
  /**
   * Whether the Person said this is their first time. Recorded on the submission
   * rather than on the consent record: it is a matching input the pairing surface
   * reads, not a fact about what they were agreeing to. Null where the form did not
   * ask.
   */
  readonly firstTime: boolean | null
  /** The consent version the Person actually saw, recorded with each decision. */
  readonly consentVersion: string
  readonly source: ConsentSource
  /**
   * Which form they answered, and which side they offered to stand on -- recorded
   * beside `source` on every consent record this submission writes, because
   * `source` answers *link or QR* and stops answering it cleanly the moment a
   * second form is folded into the same enum.
   *
   * Both null where the form did not ask, which is not a gap: it is the state every
   * record written before the wizard existed is in, and the one the single-page
   * form still writes. Neither is backfilled with a guess.
   */
  readonly intakePath: IntakePath | null
  readonly declaredSide: DeclaredSide | null
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
 * A relationship that ran, finished. One effect rather than a membership close per
 * Person, for the reason a cancellation is one: the relationship and everyone in
 * it leave together or not at all, and a half-ended relationship would hold
 * somebody out of the pool for a relationship that no longer exists.
 *
 * The store applies it through the one database function that ends a
 * relationship, which is what keeps *no open membership outlives its
 * relationship* true of every write path rather than of this one.
 */
export interface RelationshipEnding {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  readonly endedAt: Date
  /**
   * The Admin who decided. Written to `relationship.ended_by`, whose composite key
   * onto `ministry_member` refuses somebody who merely holds an account, and
   * appended to history, which outlives the membership.
   */
  readonly endedBy: string
  /** What happened, in the Ministry's own words. */
  readonly reason: string
  /** The part a Ministry can count. */
  readonly outcome: RelationshipOutcome
  /** Everyone whose open membership this closes. Recorded, not looked up again. */
  readonly memberIds: readonly PersonId[]
}

/**
 * One Participant leaving a relationship that continues. Their membership gains an
 * end date; it is never deleted, so the weeks they were present for stay attached
 * to the relationship exactly as they were recorded.
 *
 * A readmission later is a second membership row rather than this one reopened,
 * which is why `relationship_member` has a surrogate key: reopening would rewrite
 * the months they were away as months they were present.
 */
export interface ParticipantDeparture {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  readonly personId: PersonId
  readonly departedAt: Date
  /**
   * The Admin who decided, checked the way every other Admin act's actor is
   * checked: written to `relationship_member.departed_by`, whose composite key
   * onto `ministry_member` refuses somebody who merely holds an account. It also
   * marks *how* this membership closed -- a membership closed by the relationship
   * ending carries no departer -- and it is appended to history, which outlives
   * the membership.
   */
  readonly departedBy: string
}

/**
 * One period a relationship spends on one Material, opened -- and, where one was
 * already running, the previous period closed at the same instant. One effect
 * rather than a close and an open, because *periods never leave gaps* is a fact
 * about the pair of them: a close applied without its open, or an open with a
 * different instant on it, would put a hole in a history that cannot be
 * reconstructed afterwards.
 *
 * Two things emit it, and they differ only in what is in the period. Acceptance
 * opens the one with no Material and no Admin behind it; an Admin assigning opens
 * one with both.
 */
export interface MaterialAssignment {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  /**
   * Null on exactly one period per relationship: the one acceptance opens, before
   * the Ministry has assigned anything. A row saying *no Material*, rather than no
   * row -- a report asking what was in use that week gets a fact instead of a
   * silence indistinguishable from a defect.
   */
  readonly materialId: MaterialId | null
  /**
   * When this period begins, and when the previous one ends. One instant for both
   * halves, which is the whole of *never overlap and never leave gaps*.
   */
  readonly assignedAt: Date
  /**
   * The Admin who decided, checked the way every other Admin act's actor is
   * checked: the composite key onto `ministry_member` refuses somebody who merely
   * holds an account. Null on the opening period, which no Admin performed --
   * acceptance opened it.
   */
  readonly assignedBy: string | null
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

/**
 * An Admin's plan that this Person may lead. Dated on the decision rather than
 * flagged silently, and recorded either way round: withdrawing eligibility is the
 * same fact with the other answer, not the absence of one.
 *
 * The Person, never a relationship. It is independent of whether they hold an
 * account, of whether they have completed Intake, and of how many relationships
 * they already lead -- which is why nothing here names any of those.
 */
export interface LeadEligibility {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly eligible: boolean
  readonly decidedAt: Date
}

/**
 * One Discipleship Goal option, added to the end of the Ministry's list.
 *
 * The id is minted at the boundary rather than by the database, like every other
 * identifier in this product: the history event beside it names the option, and a
 * default the insert generated would not be knowable until after the row landed.
 */
export interface NewDiscipleshipGoal {
  readonly id: DiscipleshipGoalId
  readonly ministryId: MinistryId
  readonly label: GoalWording
  readonly position: number
  readonly createdAt: Date
}

/**
 * One option, reworded. The id does not change, and that is the whole of what
 * this effect is for: every answer pointing at this option goes on pointing at
 * it, because a reworded option is the same option.
 */
export interface DiscipleshipGoalRenaming {
  readonly ministryId: MinistryId
  readonly goalId: DiscipleshipGoalId
  readonly label: GoalWording
}

/**
 * The Ministry's whole list, in the order it will now be shown.
 *
 * Every option rather than the two that swapped. Positions are rewritten from
 * this list, so a list that had drifted -- gaps a removal left, a position two
 * options once shared -- comes out contiguous rather than carrying the drift
 * forward one swap at a time.
 */
export interface DiscipleshipGoalOrder {
  readonly ministryId: MinistryId
  readonly order: readonly DiscipleshipGoalId[]
}

/**
 * One option, gone, and what it cost.
 *
 * `chosenBy` is carried for the history event beside it and for nothing else --
 * as are the blanked answers the boundary reads alongside it. Between them they
 * are the whole of what survives: the answers themselves are blanked by the
 * database, and nothing anywhere can say afterwards who had chosen this option, or
 * what it said, unless the removal wrote it down first. ADR-0014.
 */
export interface DiscipleshipGoalRemoval {
  readonly ministryId: MinistryId
  readonly goalId: DiscipleshipGoalId
  readonly label: GoalWording
  readonly chosenBy: number
}

/**
 * One Ministry's settings, saved.
 *
 * Every field at once and never a patch. It is one form and one save, and a
 * partial write is how a Ministry ends up with a timezone from one edit and a
 * cadence from another -- which is a check-in due at an hour nobody chose.
 */
export interface MinistrySettingsSaving {
  readonly ministryId: MinistryId
  readonly settings: MinistrySettings
}

/**
 * A Keyword Exchange, opened. The eligible relationships travel with it in the
 * order the menu numbered them, because a menu that renumbered itself between the
 * message and the reply would apply the keyword to whichever relationship happened
 * to sort first today.
 *
 * `target` is set at the moment of opening only where there was nothing to choose:
 * a `PAUSE` with exactly one eligible relationship goes straight to its
 * confirmation. Everything else opens on the menu with no target at all.
 */
export interface NewKeywordExchange {
  readonly id: KeywordExchangeId
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly keyword: RelationshipKeyword
  readonly options: readonly KeywordRelationship[]
  readonly target: KeywordRelationship | null
  readonly openedAt: Date
}

/**
 * A menu answered: the relationship this exchange has settled on, and the moment it
 * put its next question. Only a `PAUSE` writes one -- the other two apply on the
 * selection and close in the same breath, so there is no state between choosing and
 * acting for them to be in.
 *
 * The clarification count goes back to nothing here, because the confirmation is a
 * new question. A Leader who mistyped the menu twice has spent nothing against it.
 */
export interface KeywordExchangeTarget {
  readonly ministryId: MinistryId
  readonly exchangeId: KeywordExchangeId
  readonly relationshipId: RelationshipId
  readonly promptedAt: Date
}

/**
 * One of the two clarifications Discipler will spend on an exchange's question.
 * Counted rather than inferred, for the same reason a check-in's is: what Discipler
 * said is a different number from what the Leader typed, and it is Discipler's side
 * that is capped.
 */
export interface KeywordExchangeClarification {
  readonly ministryId: MinistryId
  readonly exchangeId: KeywordExchangeId
  readonly clarifiedAt: Date
}

/**
 * An exchange that is no longer open, and why.
 *
 * `applied` -- the request went through. `replaced` -- a second keyword arrived, and
 * the most recent request is the one that stands. `expired` -- twenty-four hours ran
 * out, which raises nothing and changes nothing and is recorded here only so the row
 * stops occupying the one open slot a Person has. `overtaken` -- the Leader answered,
 * and by then there was nothing left to answer about: an Admin paused the same
 * relationship an hour ago, or ended it.
 *
 * `overtaken` exists rather than being folded into `applied` because they are
 * opposite facts about the same Leader's evening. One of them means their pause is
 * running.
 */
export type KeywordExchangeOutcome = 'applied' | 'replaced' | 'expired' | 'overtaken'

export interface KeywordExchangeClosure {
  readonly ministryId: MinistryId
  readonly exchangeId: KeywordExchangeId
  readonly closedAt: Date
  readonly outcome: KeywordExchangeOutcome
}

/**
 * The carrier-level re-opt-in, `START`, which reverses a `STOP` and restores
 * messaging to a Person. Dated on the opt-out it ends rather than deleting the row:
 * `STOP` in March and `START` in April are two facts, and a deletion is neither of
 * them.
 *
 * It resumes no relationship. Whatever was paused is still paused and whatever
 * ended is still ended -- this restores permission to be texted and nothing else.
 */
export interface PersonOptIn {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly endedAt: Date
}

export type Effect =
  | { readonly kind: 'history.append'; readonly event: NewHistoryEvent }
  | { readonly kind: 'person.create'; readonly person: NewPerson }
  | { readonly kind: 'importRow.raise'; readonly row: HeldImportRow }
  | { readonly kind: 'importRow.resolve'; readonly resolution: ImportRowResolution }
  | { readonly kind: 'person.rename'; readonly renaming: PersonRenaming }
  | { readonly kind: 'intake.record'; readonly intake: IntakeRecord }
  | { readonly kind: 'message.enqueue'; readonly message: OutboundMessageDraft }
  | {
      readonly kind: 'outstandingReply.close'
      readonly closure: OutstandingReplyClosure
    }
  | { readonly kind: 'outstandingReply.sweep'; readonly sweep: OutstandingReplySweep }
  | { readonly kind: 'relationship.create'; readonly relationship: NewRelationship }
  | { readonly kind: 'invitation.issue'; readonly invitation: NewInvitation }
  | { readonly kind: 'invitation.reissue'; readonly invitation: NewInvitation }
  | { readonly kind: 'intake_link.issue'; readonly link: NewIntakeLink }
  | { readonly kind: 'invitation.accept'; readonly acceptance: LeaderAcceptance }
  | { readonly kind: 'followUp.raise'; readonly item: NewFollowUpItem }
  | { readonly kind: 'followUp.resolve'; readonly resolution: FollowUpResolution }
  | {
      readonly kind: 'relationship.cancel'
      readonly cancellation: RelationshipCancellation
    }
  | { readonly kind: 'relationship.end'; readonly ending: RelationshipEnding }
  | { readonly kind: 'relationship.depart'; readonly departure: ParticipantDeparture }
  | { readonly kind: 'material.assign'; readonly assignment: MaterialAssignment }
  | { readonly kind: 'checkin.open'; readonly sequence: NewCheckInSequence }
  | { readonly kind: 'checkin.ask'; readonly prompt: NewCheckInPrompt }
  | { readonly kind: 'checkin.answer'; readonly answer: CheckInAnswer }
  | { readonly kind: 'checkin.clarify'; readonly clarification: CheckInClarification }
  | { readonly kind: 'checkin.remind'; readonly reminder: CheckInReminder }
  | { readonly kind: 'checkin.close'; readonly closure: CheckInSequenceClosure }
  | { readonly kind: 'person.opt_out'; readonly optOut: PersonOptOut }
  | { readonly kind: 'person.opt_in'; readonly optIn: PersonOptIn }
  | { readonly kind: 'keyword.open'; readonly exchange: NewKeywordExchange }
  | { readonly kind: 'keyword.target'; readonly target: KeywordExchangeTarget }
  | {
      readonly kind: 'keyword.clarify'
      readonly clarification: KeywordExchangeClarification
    }
  | { readonly kind: 'keyword.close'; readonly closure: KeywordExchangeClosure }
  | {
      readonly kind: 'person.lead_eligibility'
      readonly eligibility: LeadEligibility
    }
  | { readonly kind: 'settings.save'; readonly saving: MinistrySettingsSaving }
  | { readonly kind: 'goal.add'; readonly goal: NewDiscipleshipGoal }
  | { readonly kind: 'goal.rename'; readonly renaming: DiscipleshipGoalRenaming }
  | { readonly kind: 'goal.reorder'; readonly order: DiscipleshipGoalOrder }
  | { readonly kind: 'goal.remove'; readonly removal: DiscipleshipGoalRemoval }
  | { readonly kind: 'concern.raise'; readonly concern: NewConcern }
  | { readonly kind: 'concern.view'; readonly viewing: ConcernViewing }
  | { readonly kind: 'concern.resolve'; readonly resolution: ConcernResolution }

export const appendHistory = (event: NewHistoryEvent): Effect => ({
  kind: 'history.append',
  event,
})

export const recordIntakeLink = (link: NewIntakeLink): Effect => ({
  kind: 'intake_link.issue',
  link,
})

export const setLeadEligibility = (eligibility: LeadEligibility): Effect => ({
  kind: 'person.lead_eligibility',
  eligibility,
})

export const saveMinistrySettings = (saving: MinistrySettingsSaving): Effect => ({
  kind: 'settings.save',
  saving,
})

export const addDiscipleshipGoal = (goal: NewDiscipleshipGoal): Effect => ({
  kind: 'goal.add',
  goal,
})

export const renameDiscipleshipGoal = (renaming: DiscipleshipGoalRenaming): Effect => ({
  kind: 'goal.rename',
  renaming,
})

export const reorderDiscipleshipGoals = (order: DiscipleshipGoalOrder): Effect => ({
  kind: 'goal.reorder',
  order,
})

export const removeDiscipleshipGoal = (removal: DiscipleshipGoalRemoval): Effect => ({
  kind: 'goal.remove',
  removal,
})

export const recordIntake = (intake: IntakeRecord): Effect => ({
  kind: 'intake.record',
  intake,
})

export const enqueueMessage = (
  message: Omit<OutboundMessageDraft, 'scheduledFor'> & {
    readonly scheduledFor?: Date | null
  },
): Effect => ({
  kind: 'message.enqueue',
  // Null unless the caller names a cadence, because almost nothing has one: a
  // message answers an act, and only the dispatcher enqueues *because* a cadence
  // instant arrived. Stated once here rather than on every call that has none.
  message: { ...message, scheduledFor: message.scheduledFor ?? null },
})

/**
 * The number is free again. Emitted where a reply binds to what was asked, and
 * where a new week's sequence makes last week's question no longer worth answering.
 */
export const closeOutstandingReply = (closure: OutstandingReplyClosure): Effect => ({
  kind: 'outstandingReply.close',
  closure,
})

export const sweepOutstandingReplies = (sweep: OutstandingReplySweep): Effect => ({
  kind: 'outstandingReply.sweep',
  sweep,
})

export const createRelationship = (relationship: NewRelationship): Effect => ({
  kind: 'relationship.create',
  relationship,
})

/**
 * An Admin's answer to a row the importer would not guess about, recorded against
 * the row it answers and against the Person it landed on -- the one renamed, or the
 * one created. Both are named because *which Person did this row become* is the
 * question anybody reading the row afterwards has, and the answer alone does not
 * say.
 *
 * `resolvedBy` is the Admin, for the reason a resolved Concern and a resolved
 * Follow-Up Item both record one: this is pastoral judgement being exercised over
 * a congregant's identity, not a field being edited.
 */
export interface ImportRowResolution {
  readonly ministryId: MinistryId
  readonly rowId: ImportRowId
  readonly answer: ImportRowAnswer
  readonly personId: PersonId
  /**
   * What that Person was called before the rename, on `same_person`, and null on
   * the answer that renames nobody.
   *
   * Kept because `person.full_name` is overwritten in place: without it the name
   * this Ministry used to call somebody by is gone from the whole system, and
   * *preserve historical ministry events rather than overwriting past facts* is
   * the rule that forbids that. ADR-0014 gives a reworded Discipleship Goal the
   * same treatment for the same reason.
   *
   * Deliberately not a history event. Whether a rename appends one is ticket 26's
   * open question and ticket 07's to settle; this is the fact that question will
   * need, kept so it is still there to be read when somebody answers it.
   */
  readonly renamedFrom: string | null
  /** The Admin's account. The row keeps the fact even if the account later goes. */
  readonly resolvedBy: string
  readonly resolvedAt: Date
}

/**
 * The name on file becoming the name in the file. One Person row throughout and
 * `person.id` never moves, which is what makes this a rename and not a merge: the
 * Person keeps their history, their relationships and every message ever sent to
 * them.
 *
 * The name and nothing else. The email the row carried is deliberately absent --
 * the Admin answered *which Person this row is*, and an address a Person gave at
 * Intake is not a spreadsheet's to overwrite, which is the rule the importer
 * already follows for a row it recognises.
 */
export interface PersonRenaming {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly fullName: string
  readonly renamedAt: Date
}

export const createPerson = (person: NewPerson): Effect => ({
  kind: 'person.create',
  person,
})

export const holdImportRow = (row: HeldImportRow): Effect => ({
  kind: 'importRow.raise',
  row,
})

export const resolveImportRow = (resolution: ImportRowResolution): Effect => ({
  kind: 'importRow.resolve',
  resolution,
})

export const renamePerson = (renaming: PersonRenaming): Effect => ({
  kind: 'person.rename',
  renaming,
})

export const issueInvitationLink = (invitation: NewInvitation): Effect => ({
  kind: 'invitation.issue',
  invitation,
})

/**
 * Replaces the link a Leader holds rather than adding one beside it.
 *
 * A separate effect from `invitation.issue` and not an upsert on it, because the
 * two mean different things to the index that governs them: issuing must refuse a
 * second live token for the same pairing, and re-issuing must replace the one
 * that is already there. Folding them together would make the guard depend on
 * which caller was speaking.
 */
export const reissueInvitationLink = (invitation: NewInvitation): Effect => ({
  kind: 'invitation.reissue',
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

export const endRelationship = (ending: RelationshipEnding): Effect => ({
  kind: 'relationship.end',
  ending,
})

export const departFromRelationship = (departure: ParticipantDeparture): Effect => ({
  kind: 'relationship.depart',
  departure,
})

export const assignMaterial = (assignment: MaterialAssignment): Effect => ({
  kind: 'material.assign',
  assignment,
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

export const openKeywordExchange = (exchange: NewKeywordExchange): Effect => ({
  kind: 'keyword.open',
  exchange,
})

export const setKeywordExchangeTarget = (target: KeywordExchangeTarget): Effect => ({
  kind: 'keyword.target',
  target,
})

export const clarifyKeywordExchange = (
  clarification: KeywordExchangeClarification,
): Effect => ({ kind: 'keyword.clarify', clarification })

export const closeKeywordExchange = (closure: KeywordExchangeClosure): Effect => ({
  kind: 'keyword.close',
  closure,
})

export const optPersonIn = (optIn: PersonOptIn): Effect => ({
  kind: 'person.opt_in',
  optIn,
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
