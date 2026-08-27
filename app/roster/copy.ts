import type { ParticipationStatus } from '~/domain/participation'
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

const PROBLEMS: Record<RowProblem, string> = {
  no_name: 'no name',
  no_phone: 'no phone number',
  phone_unreadable: 'the phone number could not be read',
  email_unreadable: 'the email address could not be read',
  too_many_fields: 'more columns than the header row',
  // Name and number together, per ADR-0005: two people on one phone are two people.
  repeated_in_this_file: 'the same person appears earlier in the file',
  already_on_the_roster: 'already on the Roster',
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
