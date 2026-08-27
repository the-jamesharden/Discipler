/**
 * Refusals travel as codes, never as prose. The same rule the sign-in page follows:
 * a surface renders its own wording, and nothing a caller supplied is reflected back
 * into the page.
 *
 * Three of these are decided in the domain, which can see the whole request. The
 * other three are decided by the database, which is the only thing that can see the
 * Ministry's other relationships, and are translated where the constraint is caught.
 */
export type PairingRefusal =
  | 'relationship.needs_a_participant'
  | 'relationship.leader_cannot_be_a_participant'
  | 'relationship.person_listed_twice'
  | 'relationship.person_already_in_this_relationship'
  | 'relationship.leader_already_leads_a_group'
  | 'relationship.participant_already_in_a_one_to_one'
  | 'relationship.person_belongs_to_another_ministry'

export class PairingRefused extends Error {
  constructor(readonly refusal: PairingRefusal) {
    super(refusal)
    this.name = 'PairingRefused'
  }
}
