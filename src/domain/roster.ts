import type { MinistryId, PersonId } from './ids'

/**
 * The Roster is every Person in a Ministry. Being on it is not consent and is not a
 * wish to participate: Roster membership, Intake completion and pairing eligibility
 * are three separate facts, and nothing here collapses them into one flag.
 */

export interface NewPerson {
  readonly id: PersonId
  readonly ministryId: MinistryId
  readonly fullName: string
  readonly phone: string
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

export interface RowRejection {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  readonly line: number
  readonly problem: RowProblem
}

/** A row that was read successfully, before it is known whether it is a duplicate. */
export interface ImportedPerson {
  readonly line: number
  readonly fullName: string
  readonly phone: string
  readonly email: string | null
}

/**
 * Who a Person is, for the purpose of recognising them on a second upload: their
 * name *and* their number, never the number alone.
 *
 * A shared phone is ordinary -- a married couple, a parent and a teenager -- and
 * ticket 20 is built on it, serialising prompts so that a number holds one
 * conversation however many people are reachable on it. Keying identity on the
 * number alone would make the second of those people unrepresentable.
 *
 * See docs/adr/0005-a-person-is-a-name-and-a-number.md.
 */
export const rosterKey = (person: { fullName: string; phone: string }): string =>
  `${person.phone} ${person.fullName.trim().toLowerCase().replace(/\s+/g, ' ')}`
