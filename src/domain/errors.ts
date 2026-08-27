/**
 * Refusals travel as codes, never as prose. The same rule the sign-in page follows:
 * a surface renders its own wording, and nothing a caller supplied is reflected back
 * into the page.
 *
 * Three of these are decided in the domain, which can see the whole request. The
 * rest are decided by the database, which is the only thing that can see the
 * Ministry's other relationships and each Person's derived status, and are
 * translated where the constraint is caught.
 */
export type PairingRefusal =
  | 'relationship.needs_a_participant'
  | 'relationship.leader_cannot_be_a_participant'
  | 'relationship.person_listed_twice'
  | 'relationship.person_already_in_this_relationship'
  | 'relationship.leader_already_leads_a_group'
  | 'relationship.participant_already_in_a_one_to_one'
  | 'relationship.person_belongs_to_another_ministry'
  // Being on a Roster is not a wish to participate. An imported Person has agreed
  // to nothing yet, and an opted-out Person has said so plainly.
  | 'relationship.participant_has_not_completed_intake'
  | 'relationship.participant_has_opted_out'

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
