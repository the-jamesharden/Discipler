import type { ImportRowRefusal, PairingRefusal } from '~/domain/errors'
import type { DeclaredSide, ExperienceAnswer } from '~/domain/intake'
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
 * Which side a Person offered to stand on at Intake, as the Roster says it.
 *
 * Worded as something they did rather than as something they are. *Offered to
 * mentor* is an answer on a form; *Mentor* would read as a role somebody holds,
 * which is exactly the collapse this column must not invite -- leading is a plan an
 * Admin records in the column beside it, and this one sets nothing there.
 */
export const declaredSideLabel: Record<DeclaredSide, string> = {
  mentor: 'Offered to mentor',
  mentee: 'Asked to be mentored',
}

/**
 * Said as *not asked* rather than as a dash meaning nothing, because that is what
 * it is: this Person completed a form that never put the question to them, or has
 * not completed one at all. It is not them declining to offer.
 */
export const NOTHING_DECLARED = 'Not asked'

/**
 * Whether this is their first time, per candidate, on the pairing screen. Both
 * answers are said outright, including *has done this before* -- said only for the
 * first-timers, a blank would read as *no* rather than as *nobody asked them*.
 *
 * Keyed on the form's own two answers rather than on yes and no, for the reason
 * `EXPERIENCE_ANSWERS` exists at all: the screen words them as statements, and a
 * `yes` meaning *first time* is the one key that reads backwards.
 */
export const firstTimeLabel: Record<ExperienceAnswer, string> = {
  first_time: 'New to this',
  done_before: 'Has done this before',
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

/**
 * The heading over the rows an Admin can still answer. Named as *waiting on you*
 * rather than as errors: nothing went wrong with these rows, and the file is not
 * where the answer is. The one thing missing is a fact only somebody who knows the
 * congregation has.
 */
export const HELD_ROWS_HEADING = 'Rows waiting on you'

/**
 * Said once, above the rows, rather than repeated on each of them. It says what
 * Discipler does not know and why, because an Admin who does not understand the
 * question is the one most likely to click whichever button is on the left.
 */
export const HELD_ROWS_EXPLANATION =
  'Each of these came in on a phone number the Roster already holds, under a name '
  + 'it has never seen. That is either the same person with their name written '
  + 'differently, or somebody else who shares the phone — a spouse, a parent and a '
  + 'teenager. Discipler cannot tell, and will not guess.'

/**
 * How the question reads when the Roster no longer holds anybody on that number.
 * It should not happen: the row exists because the number was held. It is said
 * rather than the row being dropped, because a question that disappeared would be
 * the silent expiry this whole surface exists to prevent.
 */
export const NOBODY_ON_THIS_NUMBER =
  'Nobody is on the Roster against this number any more, so there is nobody left to '
  + 'rename. Adding them is the only answer left.'

/**
 * One answer per Person the number already reaches, each naming that Person. A
 * number may reach two of them, and *the same person* is a different question about
 * each -- so the button says whose name is about to change rather than leaving an
 * Admin to work out which of two the product had in mind.
 */
export const samePersonAnswer = (fullName: string): string => `Same person as ${fullName}`

/** Said under the button, so the consequence is visible before it is clicked. */
export const samePersonConsequence = (was: string, becomes: string): string =>
  `${was} keeps their history and everything they are part of, and is called ${becomes} from now on.`

export const SOMEONE_ELSE_ANSWER = 'Someone else on this number'

export const SOMEONE_ELSE_CONSEQUENCE =
  'A second person is added on the same phone. Nobody already on the Roster changes.'

/**
 * Why an answer could not be applied. None of them is a disagreement about which
 * answer was right -- that is the Admin's -- so each says what moved underneath
 * them and what to do about it.
 *
 * A `Record` rather than a lookup with a default, like the import failures above:
 * a refusal added to `ImportRowRefusal` and left unworded fails the build rather
 * than falling through to a sentence that names nothing.
 *
 * The lookup below still has a fallback, and that is a different job. The `Record`
 * answers *is every refusal this product can raise worded*, at build time; the
 * fallback answers *what does the page say about a string somebody typed into the
 * query bar*, which is the same promise the sign-in page makes about an invented
 * `?error=` -- the screen says its own words, and nothing a stranger supplied is
 * reflected back into it.
 */
const IMPORT_ROW_REFUSALS: Record<ImportRowRefusal, string> = {
  'import_row.already_answered':
    'Somebody answered that row before you did. The Roster below shows where it landed.',
  'import_row.person_is_not_on_this_number':
    'That person is not on the phone number this row came in on. Reload the Roster and answer it again.',
  // The row stays. Nothing here can close it -- neither answer is a default and
  // neither is Discipler's to choose -- so it says plainly that both have been
  // overtaken rather than quietly hiding a question nobody answered.
  'import_row.name_is_already_on_this_number':
    'That name is already on the Roster against this number, so neither answer would '
    + 'add anything. The row was left as it was.',
}

export const importRowRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return (
    IMPORT_ROW_REFUSALS[code as ImportRowRefusal] ?? 'That row could not be answered.'
  )
}

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
    + 'mixed, if you say that is what it is.',
  // Names what the Admin themselves declared, because the fix is one of two things
  // and they are the only person who knows which: change who is in it, or say it is
  // mixed. A sentence that only said "genders do not match" would describe a rule
  // rather than the choice in front of them.
  //
  // Names no shape and does not say to remove somebody: the form asks the question of
  // every shape, so an Admin who declared a men's relationship and then selected two
  // women reaches this on a pair, where there is nothing to create and taking one of
  // the two out leaves nobody. Saying it is mixed is the fix that works either way.
  'relationship.gender_does_not_match_the_declaration':
    'Somebody selected is not of the gender this relationship was declared to be. '
    + 'Either change who is in it, or say it is mixed.',
  // Only a group is asked, so the wording says group. An Admin pairing two people
  // never sees this: their relationship’s gender is the gender of the two of them.
  'relationship.needs_a_gender_declaration':
    'Say whether this is a men’s group, a women’s group, or a mixed one. Everybody '
    + 'in a men’s or women’s group must be of that gender.',
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
