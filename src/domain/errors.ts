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
