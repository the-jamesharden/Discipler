import type { PairingRefusal } from '~/domain/errors'
import type { ParticipationStatus } from '~/domain/participation'
import type { MemberRole } from '~/domain/relationships'
import type { RowProblem } from '~/domain/roster'
import type { ImportFailure } from './report'

/**
 * Everything the Roster says in words, in one place. The derivation deals in facts
 * and the import deals in codes; deciding how to say them is the screen's, for the
 * same reason sign-in failures are.
 *
 * One module because it changes for one reason -- somebody rewording what an Admin
 * reads -- and that is a different reason from the one the wire format in
 * `report.ts` changes for.
 */

export const participationStatusLabel: Record<ParticipationStatus, string> = {
  no_intake_submitted: 'No Intake Submitted',
  ready_to_pair: 'Ready to Pair',
  paired: 'Paired',
  opted_out: 'Opted Out',
}

/**
 * What this Person is in each of their relationships, said as a sentence opener
 * rather than as the word `leader`.
 *
 * It is the half of the row that makes the status beside it legible. A man leading
 * two relationships and discipled by nobody reads `Ready to Pair`, and a column of
 * bare names cannot say which of the two he is -- so the row says *leads* and the
 * Admin reads a fact rather than a bug.
 */
export const rosterRoleLabel: Record<MemberRole, string> = {
  leader: 'Leads',
  // Not "discipled by", because the names beside it are everyone else in the
  // relationship, and in a group that includes people being discipled alongside
  // them rather than doing the discipling.
  participant: 'In a relationship with',
}

/**
 * Said beside the relationship rather than beside the Person, because it is a fact
 * about the relationship: both sides of the same pairing read the same words, and
 * neither of them is `Paired` differently because of it.
 *
 * The Participation Status column is left alone on purpose. `Paired` answers *is
 * this person being discipled*, and someone whose only relationship has not been
 * accepted yet is -- arranged for, not yet started. Folding acceptance into that
 * column would give one word two jobs and make the derivation in SQL disagree with
 * the one on the screen.
 */
export const AWAITING_LEADER_ACCEPTANCE = 'Awaiting Leader Acceptance'

const PROBLEMS: Record<RowProblem, string> = {
  no_name: 'no name',
  no_phone: 'no phone number',
  phone_unreadable: 'the phone number could not be read',
  email_unreadable: 'the email address could not be read',
  too_many_fields: 'more columns than the header row',
  // Name and number together, per ADR-0005: two people on one phone are two people.
  repeated_in_this_file: 'the same person appears earlier in the file',
  already_on_the_roster: 'already on the Roster',
  same_number_different_name:
    'this number is on the Roster under a different name — check whether it is the same person or someone sharing the number',
}

export const rowProblemMessage = (problem: RowProblem): string => PROBLEMS[problem]

const FAILURES: Record<ImportFailure, string> = {
  no_file: 'Choose a CSV file to import.',
  too_large: 'That file is larger than this import accepts. Split it and try again.',
  nothing_to_read: 'That file had no rows in it.',
  no_name_column:
    'That file has no column of names. Name the column Name or Full Name and try again.',
  no_phone_column:
    'That file has no column of phone numbers. Name the column Phone or Mobile and try again.',
  roster_changed:
    'The Roster changed while this import was running, so none of it was applied. Try it again.',
}

export const importFailureMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return FAILURES[code as ImportFailure] ?? 'That file could not be imported.'
}

/**
 * Why a pairing was refused, in words an Admin can act on. A `Record` rather than a
 * lookup with a default, so that adding a refusal to `PairingRefusal` and forgetting
 * to word it fails the build rather than falling through to "that pairing could not
 * be created" -- which is the silent no-op again, wearing a message.
 *
 * Each sentence names the thing to change. "Emily is already in a one-to-one" sends
 * the Admin somewhere; "constraint violated" does not.
 */
export const REFUSALS: Record<PairingRefusal, string> = {
  'relationship.needs_a_leader': 'Choose who will lead this relationship.',
  'relationship.needs_a_participant':
    'Choose at least one person to be discipled in this relationship.',
  'relationship.leader_cannot_be_a_participant':
    'The leader cannot also be a participant in the same relationship.',
  'relationship.person_listed_twice':
    'Somebody was selected twice. Each person can be in this relationship once.',
  'relationship.person_already_in_this_relationship':
    'Somebody is already in this relationship.',
  // Named as a cap rather than as an error: the Admin has not done anything wrong,
  // they have run into how much this leader is already carrying.
  'relationship.leader_already_leads_a_group':
    'This leader already leads a group. A leader leads one group at a time, and any '
    + 'number of one-to-one relationships.',
  'relationship.participant_already_in_a_one_to_one':
    'Somebody selected is already being discipled one-to-one. A person is in one '
    + 'one-to-one relationship at a time, and any number of groups.',
  'relationship.person_belongs_to_another_ministry':
    'Somebody selected is not on this Ministry\u2019s Roster.',
  'relationship.participant_has_not_completed_intake':
    'Somebody selected has not completed Intake yet. Being on the Roster is not the '
    + 'same as asking to take part.',
  'relationship.participant_has_opted_out':
    'Somebody selected has opted out, and cannot be paired.',
  'relationship.leader_has_not_completed_intake':
    'This leader has not completed Intake yet. Send them the Intake link first.',
  'relationship.leader_has_opted_out': 'This leader has opted out, and cannot lead.',
  // The one refusal with no way around it. Said as a policy rather than as a
  // mistake, because an Admin who reads it as a mistake will go looking for the
  // setting that turns it off, and there is not one on this screen. It names the
  // one-to-one, because the Admin it stops has a real alternative -- the same people
  // in a group are not refused -- and a sentence that said "a relationship" would
  // hide that from them.
  'relationship.gender_must_match':
    'A one-to-one relationship must be between two people of the same gender. This is '
    + 'a safeguarding rule and pairing by hand does not override it. A group can be '
    + 'mixed.',
  'relationship.already_has_a_leader':
    'A one-to-one relationship has one leader. Add another person to be discipled to '
    + 'make it a group, and it can then have several.',
}

/**
 * The age band is deliberately not in the list. It governs suggestion only, so
 * pairing across it by hand is a supported thing to do and produces no refusal at
 * all -- there is nothing here to say about it.
 */
export const pairingRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  // A code arriving from the query string is whatever somebody typed there. It is
  // looked up, never rendered.
  return REFUSALS[code as PairingRefusal] ?? 'That relationship could not be created.'
}
