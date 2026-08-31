import type { IntakeRefusal } from './intake'

/**
 * Refusals travel as codes, never as prose. The same rule the sign-in page follows:
 * a surface renders its own wording, and nothing a caller supplied is reflected back
 * into the page.
 *
 * Four of these are decided in the domain, which can see the whole request. The
 * rest are decided by the database, which is the only thing that can see the
 * Ministry's other relationships and each Person's derived status, and are
 * translated where the constraint is caught.
 */
export type PairingRefusal =
  | 'relationship.needs_a_leader'
  | 'relationship.needs_a_participant'
  | 'relationship.leader_cannot_be_a_participant'
  | 'relationship.person_listed_twice'
  | 'relationship.person_already_in_this_relationship'
  | 'relationship.leader_already_leads_a_group'
  | 'relationship.participant_already_in_a_one_to_one'
  | 'relationship.person_belongs_to_another_ministry'
  // Being on a Roster is not a wish to participate. An imported Person has agreed
  // to nothing yet, and an opted-out Person has said so plainly. Both hold whichever
  // side of the relationship the Person is on: the flow is import, then Intake, then
  // pairing, and leading does not make the middle step optional. The two roles are
  // named separately because the Admin who hits one is being told a different thing.
  | 'relationship.participant_has_not_completed_intake'
  | 'relationship.participant_has_opted_out'
  | 'relationship.leader_has_not_completed_intake'
  | 'relationship.leader_has_opted_out'
  // Safeguarding, and the one constraint on pairing an Admin cannot decide to cross.
  // It binds a one-to-one only: a group is people who meet together and may be mixed.
  // Its sibling, the age band, governs suggestion only and is deliberately absent
  // from this list: crossing it by hand is a supported thing to do, not a refusal.
  | 'relationship.gender_must_match'
  // A one-to-one is two people and holds exactly one Leader. Reachable now that the
  // form offers several: an Admin who ticks two Leaders and one Participant has
  // formed a group, but one who reopens a closed leader membership on a one-to-one
  // has not, and an index the store cannot name escapes as a Postgres error and a
  // 500 -- the silent no-op with the volume turned up.
  | 'relationship.already_has_a_leader'

export class PairingRefused extends Error {
  constructor(readonly refusal: PairingRefusal) {
    super(refusal)
    this.name = 'PairingRefused'
  }
}

/**
 * Why a token could not do what its holder asked of it. The page renders its own
 * wording from these, like every other refusal, and none of them says anything
 * about a relationship the holder has not proved they belong to.
 */
export type InvitationRefusal =
  /** Nothing in this Ministry answers to that token. */
  | 'invitation.not_found'
  /** Seven to fourteen days have passed. An Admin re-issues; nobody self-serves. */
  | 'invitation.expired'
  /** Already consumed by account creation. Their way back in is to sign in. */
  | 'invitation.already_used'
  /** Only a Leader accepts. A Participant is told about a match, not asked to ratify it. */
  | 'invitation.not_a_leader'
  /** Only a Participant declines. A Leader who will not lead is ticket 13's, not this. */
  | 'invitation.not_a_participant'

export class InvitationRefused extends Error {
  constructor(readonly refusal: InvitationRefusal) {
    super(refusal)
    this.name = 'InvitationRefused'
  }
}

/**
 * The import read the Roster and the database disagreed with what it read, which
 * can only happen when something else wrote between the two. The import is refused
 * whole rather than partly applied, so the Admin re-uploads the same file and gets
 * a report that matches what actually landed.
 */
export type RosterImportRefusal = 'roster.changed_during_the_import'

export class RosterImportRefused extends Error {
  constructor(readonly refusal: RosterImportRefusal) {
    super(refusal)
    this.name = 'RosterImportRefused'
  }
}

/**
 * Why the file as a whole could not be read. A file problem rejects every row in it,
 * so it is not a `RowProblem` with a line number -- there is no line to point at.
 */
export type FileProblem = 'nothing_to_read' | 'no_name_column' | 'no_phone_column'

export class RosterFileUnreadable extends Error {
  constructor(readonly problem: FileProblem) {
    super(problem)
    this.name = 'RosterFileUnreadable'
  }
}

/**
 * An Intake form Discipler could not accept. It carries every problem at once
 * rather than the first, because a Person filling this in on a phone should not
 * have to discover their mistakes one round trip at a time.
 */
export class IntakeRefused extends Error {
  constructor(readonly refusals: readonly IntakeRefusal[]) {
    super(refusals.join(', '))
    this.name = 'IntakeRefused'
  }
}

/**
 * Why a relationship could not be cancelled. Cancelling withdraws something nobody
 * agreed to; it is not a way of ending something that has started, and the two are
 * kept apart here rather than collapsed into one permissive command.
 */
export type CancellationRefusal =
  /** Nothing in this Ministry answers to that relationship. */
  | 'relationship.not_found'
  /**
   * Every Leader has agreed and the Starter Message has gone out. Ending it is a
   * different act, carries a required outcome, and is ticket 13's.
   */
  | 'relationship.already_accepted'
  /** Already withdrawn or already ended. Cancelling twice frees nobody twice. */
  | 'relationship.already_ended'
  /**
   * The account cancelling is not a member of this Ministry. Holding an account is
   * not standing to disband somebody else's relationship, and the composite key on
   * `ended_by` is what says so.
   */
  | 'relationship.canceller_is_not_in_this_ministry'

export class CancellationRefused extends Error {
  constructor(readonly refusal: CancellationRefusal) {
    super(refusal)
    this.name = 'CancellationRefused'
  }
}

/**
 * Why a relationship could not be ended.
 *
 * Ending and cancelling are two acts with two refusal sets, kept apart for the
 * same reason the commands are: an Admin who is told *this one has already been
 * accepted* is being told to end it, and one told *nobody has accepted this yet*
 * is being told to cancel it. One permissive command would have neither sentence
 * to say.
 */
export type EndingRefusal =
  /** Nothing in this Ministry answers to that relationship. */
  | 'ending.relationship_not_found'
  /**
   * Nobody has accepted it, so it never ran. Withdrawing one is
   * `relationship.cancel`, which records no outcome -- a relationship that never
   * started cannot have completed.
   */
  | 'ending.relationship_not_accepted'
  /** `Ended` is terminal. A second ending would overwrite the first one's record. */
  | 'ending.already_ended'
  /**
   * No reason was given. The database refuses it too; this is the same rule said
   * where a surface can render it, because a command is built from a request body.
   */
  | 'ending.reason_is_required'
  /**
   * An outcome that is neither `completed` nor `discontinued`. The union says so
   * at compile time, and nothing between a request body and here has looked at
   * the word.
   */
  | 'ending.outcome_not_recognised'
  /**
   * The account ending it is not a member of this Ministry. Holding an account is
   * not standing to end somebody else's relationship, and the composite key on
   * `ended_by` is what says so.
   */
  | 'ending.ender_is_not_in_this_ministry'

export class EndingRefused extends Error {
  constructor(readonly refusal: EndingRefusal) {
    super(refusal)
    this.name = 'EndingRefused'
  }
}

/**
 * Why one Participant could not leave a relationship.
 *
 * Two of these say the same thing in different words: *what you are describing is
 * an ending*. A relationship with no Leader, or with nobody being discipled, is
 * finished -- and finishing one records whether it completed or broke down, which
 * a departure has no place to put.
 */
export type DepartureRefusal =
  /** Nothing in this Ministry answers to that relationship. */
  | 'departure.relationship_not_found'
  /** It is already over. Nobody leaves a relationship that has ended. */
  | 'departure.relationship_ended'
  /** They hold no open membership on it -- they have already left, or never were in it. */
  | 'departure.person_is_not_in_this_relationship'
  /** Removing the Leader does not leave a relationship that continues. */
  | 'departure.person_is_a_leader'
  /** The last Participant leaving is a relationship that is over. */
  | 'departure.would_leave_no_participants'
  /**
   * Nobody has accepted it. Nothing has reached a Participant, so there is no
   * relationship to leave -- withdrawing one nobody agreed to is
   * `relationship.cancel`, which takes everybody out of it at once. The same
   * refusal a Pause carries for the same state, and for the same reason.
   */
  | 'departure.relationship_not_accepted'
  /**
   * The account recording it is not a member of this Ministry. Removing somebody
   * from a relationship is an Admin act on other people's ministry, and holding an
   * account is not standing to perform one -- the same rule an ending carries, and
   * the composite key on `relationship_member.departed_by` is what says so.
   */
  | 'departure.departer_is_not_in_this_ministry'

export class DepartureRefused extends Error {
  constructor(readonly refusal: DepartureRefusal) {
    super(refusal)
    this.name = 'DepartureRefused'
  }
}

/**
 * Why a Material could not be assigned to a relationship.
 *
 * Every one of these is a state in which the relationship has no period for a new
 * one to follow. The opening period runs from acceptance, so a relationship that
 * nobody has accepted has no history to add to -- and one that has ended has no
 * further week to attribute.
 */
export type MaterialAssignmentRefusal =
  /** Nothing in this Ministry answers to that relationship. */
  | 'material.relationship_not_found'
  /**
   * Nobody has accepted it. The period with no Material starts at acceptance, so
   * there is nothing here to close -- and an assignment dated before it would open
   * the gap that period exists to prevent.
   */
  | 'material.relationship_not_accepted'
  /** Terminal. A relationship that is over has no week left to attribute. */
  | 'material.relationship_ended'
  /**
   * No Material in this Ministry answers to that identifier. Decided by the
   * database, which is the only thing that can see the Ministry's own list.
   */
  | 'material.not_found'
  /**
   * The account assigning is not a member of this Ministry. Holding an account is
   * not standing to decide what somebody else's relationship works through, and
   * the composite key on `material_assignment.assigned_by` is what says so.
   */
  | 'material.assigner_is_not_in_this_ministry'

export class MaterialAssignmentRefused extends Error {
  constructor(readonly refusal: MaterialAssignmentRefusal) {
    super(refusal)
    this.name = 'MaterialAssignmentRefused'
  }
}

/**
 * Why a relationship could not be paused or resumed. One type for both, because
 * they are the two halves of one act and three of the five codes belong to
 * neither half in particular.
 *
 * A pause suspends a relationship that is running, so a relationship nobody has
 * accepted and one that has ended are both outside it -- neither is sending
 * check-ins for a pause to suspend. And the two symmetric refusals are what keep
 * the dates honest: a second pause would silently reset the first one's clock, so
 * a fortnight away would become a fortnight from whenever somebody last clicked,
 * and a resume with nothing to resume would append a fact that never happened.
 */
export type PauseRefusal =
  /** Nothing in this Ministry answers to that relationship. */
  | 'pause.relationship_not_found'
  /** Nobody has accepted it. It sends no check-ins, so there is nothing to suspend. */
  | 'pause.relationship_not_accepted'
  /** Terminal. Ending is the one thing a pause is not a lighter version of. */
  | 'pause.relationship_ended'
  /** A pause already stands. A second would reset the first one's period. */
  | 'pause.already_paused'
  /** No pause stands, so there is nothing to resume. */
  | 'pause.not_paused'
  /**
   * A period that is not one of the five. The `PausePeriodWeeks` union says so at
   * compile time, but a command is built from a request body, and a number that
   * reached here unchecked would be written into history as a Pause nothing can
   * read back.
   */
  | 'pause.period_not_selectable'

export class PauseRefused extends Error {
  constructor(readonly refusal: PauseRefusal) {
    super(refusal)
    this.name = 'PauseRefused'
  }
}

/**
 * Why a Follow-Up Item could not be resolved. Both are decided by the database,
 * which is the only thing that can see whether the row is still open by the time
 * the update lands -- two Admins clicking Resolve on the same item is ordinary.
 */
export type FollowUpRefusal =
  | 'follow_up.not_found'
  /** Somebody else got there first. It is closed, which is what was wanted. */
  | 'follow_up.already_resolved'
  /**
   * A real account, in another Ministry. Holding a login is not standing to close
   * somebody else's care item, and the composite key onto `ministry_member` is
   * what says so.
   */
  | 'follow_up.resolver_is_not_in_this_ministry'

export class FollowUpRefused extends Error {
  constructor(readonly refusal: FollowUpRefusal) {
    super(refusal)
    this.name = 'FollowUpRefused'
  }
}

/**
 * Why a Concern command could not act. The same shape as a Follow-Up refusal and
 * for the same reason: only the database can see whether the row is still open by
 * the time the update lands.
 */
export type ConcernRefusal =
  | 'concern.not_found'
  /** Somebody else got there first. It is closed, which is what was wanted. */
  | 'concern.already_resolved'
  /**
   * A real account, in another Ministry. Holding a login is not standing to read
   * or to close what a Leader said about somebody's marriage, and the composite
   * key onto `ministry_member` is what says so.
   *
   * Two codes rather than one because they are two acts, and an Admin who cannot
   * open a Concern is being told a different thing from one who cannot close it.
   */
  | 'concern.resolver_is_not_in_this_ministry'
  | 'concern.viewer_is_not_in_this_ministry'

export class ConcernRefused extends Error {
  constructor(readonly refusal: ConcernRefusal) {
    super(refusal)
    this.name = 'ConcernRefused'
  }
}

/**
 * Why a check-in command could not act. There is one reason: the Person it named
 * is not on this Ministry's Roster.
 *
 * It is a refusal rather than an empty snapshot because the two mean different
 * things and would otherwise reach a surface as the same silence -- *nobody by
 * that name here* is a fault in whatever called, while *nothing to ask about* is
 * an ordinary week for a Leader whose relationships are all paused.
 */
export type CheckInRefusal = 'checkin.person_not_found'

export class CheckInRefused extends Error {
  constructor(readonly refusal: CheckInRefusal) {
    super(refusal)
    this.name = 'CheckInRefused'
  }
}
