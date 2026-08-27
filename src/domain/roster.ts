import type { Branded } from './branded'
import type { MinistryId, PersonId } from './ids'

/**
 * The Roster is every Person in a Ministry. Being on it is not consent and is not a
 * wish to participate: Roster membership, Intake completion and pairing eligibility
 * are three separate facts, and nothing here collapses them into one flag.
 */

/**
 * E.164, and it has been through `asPhoneNumber`. Branded because the difference
 * between what an Admin typed into a spreadsheet and a number Discipler will dial
 * is the whole of the import's phone handling, and a plain `string` loses it: the
 * same check is written in `asPhoneNumber`, in the `person_phone_is_e164`
 * constraint, and in the identity index, and only the brand records which strings
 * have already been through the first of them.
 */
export type PhoneNumber = Branded<string, 'PhoneNumber'>

/** At the platform edge, where the database is the authority on its own column. */
export const phoneNumber = (value: string): PhoneNumber => value as PhoneNumber

/** The output of `rosterKey`, and the only thing a Roster snapshot is keyed on. */
export type RosterKey = Branded<string, 'RosterKey'>

export interface NewPerson {
  readonly id: PersonId
  readonly ministryId: MinistryId
  readonly fullName: string
  readonly phone: PhoneNumber
  readonly email: string | null
  readonly createdAt: Date
}

/**
 * Why a single row could not be imported. Codes rather than prose, for the reason
 * the sign-in page gives: the screen owns the wording, and nothing out of a
 * stranger's spreadsheet is reflected back into the page.
 *
 * They travel with a line number and nothing else. An Admin finds the row in the
 * file they just uploaded, and no congregant's name or number rides in a URL.
 */
export type RowProblem =
  | 'no_name'
  | 'no_phone'
  | 'phone_unreadable'
  | 'email_unreadable'
  | 'too_many_fields'
  | 'repeated_in_this_file'
  | 'already_on_the_roster'

/**
 * The vocabulary, listed once. What arrives in a query string has to be checked
 * against the set of real codes before anything is rendered, and that check belongs
 * beside the type rather than falling out of whichever screen happens to hold the
 * wording -- the same shape `participation.ts` uses for the four statuses.
 */
export const ROW_PROBLEMS: readonly RowProblem[] = [
  'no_name',
  'no_phone',
  'phone_unreadable',
  'email_unreadable',
  'too_many_fields',
  'repeated_in_this_file',
  'already_on_the_roster',
]

export const isRowProblem = (value: unknown): value is RowProblem =>
  ROW_PROBLEMS.includes(value as RowProblem)

export interface RowRejection {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  readonly line: number
  readonly problem: RowProblem
}

/** A row that was read successfully, before it is known whether it is a duplicate. */
export interface ImportedPerson {
  readonly line: number
  readonly fullName: string
  readonly phone: PhoneNumber
  readonly email: string | null
}

/**
 * Who a Person is, for the purpose of recognising them on a second upload: their
 * name *and* their number, never the number alone. A shared phone is ordinary, and
 * keying identity on the number alone would make the second person on one
 * unrepresentable. The reasoning is in docs/adr/0005-a-person-is-a-name-and-a-number.md.
 */
export const rosterKey = (person: {
  fullName: string
  phone: PhoneNumber
}): RosterKey =>
  `${person.phone} ${person.fullName.trim().toLowerCase().replace(/\s+/g, ' ')}` as RosterKey
