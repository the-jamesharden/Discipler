import type { Branded } from './branded'
import type { ImportRowId, MinistryId, PersonId } from './ids'

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

/**
 * The one definition of a number Discipler will dial, shared by every way a number
 * reaches the Roster -- a spreadsheet column, and a Person typing their own into
 * the Intake form. Two readings of what counts as a phone number would eventually
 * disagree, and the one that accepted less would silently make somebody
 * unreachable.
 *
 * A bare ten-digit number is read as North American, because that is what a pilot
 * ministry's spreadsheet holds; anything else has to say `+` and its country code.
 */
export const asPhoneNumber = (raw: string): PhoneNumber | null => {
  const digits = raw.replace(/\D/g, '')

  if (raw.trim().startsWith('+')) {
    return /^[1-9]\d{7,14}$/.test(digits) ? (`+${digits}` as PhoneNumber) : null
  }
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}` as PhoneNumber
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}` as PhoneNumber
  return null
}

/**
 * The one reading of what counts as an email address, for the same reason
 * `asPhoneNumber` is: a spreadsheet column and a Person typing their own into the
 * Intake form must agree, and two regexes drift apart silently -- the one that
 * accepted less would refuse an address somebody actually has.
 *
 * Deliberately loose. Discipler never sends email; the address is a contact detail
 * a pastor reads, so the check is against a typo rather than against the RFC.
 */
export const asEmail = (raw: string): string | null => {
  const trimmed = raw.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? trimmed : null
}

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
   * The number is on the Roster against a different name. Two things look like
   * this and Discipler cannot tell them apart: the same Person under a new name,
   * and the second person on a shared phone. Both are ordinary, and guessing
   * either way loses somebody -- merging hides a congregant who was never
   * imported, filing a second row hides a rename. So it is reported and an Admin
   * says which it is. See docs/adr/0005-a-person-is-a-name-and-a-number.md.
   */
  | 'same_number_different_name'

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
  'same_number_different_name',
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
 * An exact match on a second upload: the same name on the same number. It is not
 * the whole of recognition -- the number alone decides whether Discipler has seen
 * this line before, and this decides whether it has seen it unchanged. A number
 * that matches under a different name is `same_number_different_name` and reaches
 * an Admin. See docs/adr/0005-a-person-is-a-name-and-a-number.md.
 */
export const rosterKey = (person: {
  fullName: string
  phone: PhoneNumber
}): RosterKey =>
  `${person.phone} ${person.fullName.trim().toLowerCase().replace(/\s+/g, ' ')}` as RosterKey


/**
 * What an Admin answered about a row the importer could not file. Two answers and
 * no third, because the question has exactly two ordinary readings -- the same
 * Person under a new name, and the second person on a shared phone -- and
 * ADR-0005 is what says both are real.
 *
 * Neither is a default and neither is inferred. The whole point of reporting the
 * row is that Discipler does not know which it is, and an answer chosen by
 * anything but an Admin would put the ambiguity back where the importer took it
 * out of.
 */
export type ImportRowAnswer = 'same_person' | 'someone_else'

/**
 * A row an import refused because the number was already on the Roster under
 * another name, kept so an Admin can answer it. Stored rather than carried in the
 * import report's query string, which is the whole of *resolving does not require
 * re-uploading the file*: the report is a redirect and outlives nothing, and a row
 * that expired with it would be the silent drop the reporting exists to prevent.
 *
 * It holds the row as the file had it -- the name that collided, the number, the
 * email beside them -- because that is what either answer needs and the file is
 * gone by the time anybody reads this.
 *
 * `resolvedAt` is null while it is still a question. The row is kept afterwards
 * rather than deleted, like every other decision in this product: what an Admin
 * answered about a congregant's identity is a fact about the Ministry.
 */
export interface HeldImportRow {
  readonly id: ImportRowId
  readonly ministryId: MinistryId
  /** 1-based and counting the header, as the import report says it. */
  readonly line: number
  readonly fullName: string
  readonly phone: PhoneNumber
  readonly email: string | null
  readonly importedAt: Date
  readonly resolvedAt: Date | null
}

/** One Person already on a held row's number, and the name they are on it under. */
export interface NameOnTheNumber {
  readonly personId: PersonId
  readonly fullName: string
}

/**
 * Everyone the Roster already holds on one number, read out of a snapshot keyed by
 * name and number. A number may reach more than one of them -- that is what
 * ADR-0005 protects -- so *the same Person* is a question with as many answers as
 * there are names on it, and this is the list the surface offers one answer per.
 *
 * A name with no Person behind it is dropped rather than guessed at: both halves
 * come from one read, so reaching that means they have drifted apart, and offering
 * a rename for a Person that cannot be named would be an answer nothing could
 * apply.
 */
export const namesOnTheNumber = (
  roster: {
    readonly people: ReadonlyMap<RosterKey, PersonId>
    readonly namesByNumber: ReadonlyMap<PhoneNumber, readonly string[]>
  },
  phone: PhoneNumber,
): readonly NameOnTheNumber[] =>
  (roster.namesByNumber.get(phone) ?? []).flatMap((fullName) => {
    const held = roster.people.get(rosterKey({ fullName, phone }))
    return held ? [{ personId: held, fullName }] : []
  })
