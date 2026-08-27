import { RosterFileUnreadable } from './errors'
import { rosterKey, type ImportedPerson, type RowProblem, type RowRejection } from './roster'

/**
 * Reading the spreadsheet an Admin exported from wherever they keep their
 * congregation. Pure string work, so it sits in the domain and is driven by tests
 * with no file system and no upload anywhere near it.
 *
 * The rule the whole file exists to hold: a row Discipler cannot read is reported
 * back with its line number, never dropped. An import that quietly loses four
 * people is worse than one that refuses, because nobody finds out until those four
 * are the ones nobody discipled.
 */

export interface RosterFileReading {
  readonly people: readonly ImportedPerson[]
  readonly rejected: readonly RowRejection[]
}

interface Row {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  readonly line: number
  readonly fields: readonly string[]
}

/**
 * A CSV reader rather than a `split(',')`: a name held as `"Johnson, Emily"` is
 * ordinary in an export, and splitting on commas reads the surname as a phone
 * number. Quoted fields, doubled quotes, CRLF and a byte-order mark are all things
 * a real export arrives carrying.
 */
const rowsIn = (text: string): Row[] => {
  const source = text.replace(/^﻿/, '')
  const rows: Row[] = []

  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowStartedAt = 1

  const endField = () => {
    fields.push(field)
    field = ''
  }

  const endRow = () => {
    endField()
    rows.push({ line: rowStartedAt, fields })
    fields = []
  }

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!

    if (quoted) {
      if (char !== '"') {
        // A newline inside quotes belongs to the field, but the lines it spans
        // still have to be counted or every later row reports the wrong number.
        if (char === '\n') line++
        field += char
      } else if (source[index + 1] === '"') {
        field += '"'
        index++
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && field === '') quoted = true
    else if (char === ',') endField()
    else if (char === '\r') continue
    else if (char === '\n') {
      endRow()
      rowStartedAt = ++line
    } else field += char
  }

  if (field !== '' || fields.length > 0) endRow()

  // A blank line is not an unreadable row. Exports end with one, and people leave
  // them between sections.
  return rows.filter((row) => row.fields.some((value) => value.trim() !== ''))
}

const asHeading = (value: string): string =>
  value.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ')

/**
 * The headings a real export uses. Unrecognised headings are not guessed at: a file
 * whose name column cannot be identified is refused whole, because the alternative
 * is importing a column of phone numbers as people's names.
 */
const HEADINGS = {
  name: ['name', 'full name', 'fullname', 'person', 'person name', 'first name last name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'mobile phone', 'cell', 'cell phone', 'telephone', 'number'],
  email: ['email', 'email address', 'e mail', 'e mail address'],
}

const columnFor = (headings: readonly string[], accepted: readonly string[]): number =>
  headings.findIndex((heading) => accepted.includes(heading))

/**
 * Normalised to E.164, because a number written two ways is one number: the same
 * congregant typed `555-014-2000` in one export and `(555) 014-2000` in the next has
 * to be recognised as the same number both times.
 *
 * A bare ten- or eleven-digit number is read as North American. That is the pilot's
 * ground, and a number that cannot be read that way is reported rather than guessed
 * at -- an Admin correcting `+44...` into the file is a better outcome than
 * Discipler texting a number it invented a country code for.
 */
const asPhoneNumber = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '')

  if (raw.trim().startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`
  return null
}

const looksLikeAnEmail = (raw: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)

export const readRosterFile = (text: string): RosterFileReading => {
  const rows = rowsIn(text)
  const header = rows[0]
  if (!header) throw new RosterFileUnreadable('nothing_to_read')

  const headings = header.fields.map(asHeading)
  const nameColumn = columnFor(headings, HEADINGS.name)
  const phoneColumn = columnFor(headings, HEADINGS.phone)
  const emailColumn = columnFor(headings, HEADINGS.email)

  if (nameColumn < 0) throw new RosterFileUnreadable('no_name_column')
  if (phoneColumn < 0) throw new RosterFileUnreadable('no_phone_column')

  const people: ImportedPerson[] = []
  const rejected: RowRejection[] = []
  const seen = new Set<string>()

  for (const row of rows.slice(1)) {
    const reject = (problem: RowProblem) => rejected.push({ line: row.line, problem })
    const valueIn = (column: number) => (column < 0 ? '' : (row.fields[column] ?? '').trim())

    // Checked before anything is read out of the row: the usual cause is an
    // unquoted comma, and every column after it is now describing something else.
    if (row.fields.length > header.fields.length) {
      reject('too_many_fields')
      continue
    }

    const fullName = valueIn(nameColumn)
    if (!fullName) {
      reject('no_name')
      continue
    }

    const rawPhone = valueIn(phoneColumn)
    if (!rawPhone) {
      reject('no_phone')
      continue
    }

    const phone = asPhoneNumber(rawPhone)
    if (!phone) {
      reject('phone_unreadable')
      continue
    }

    const rawEmail = valueIn(emailColumn)
    if (rawEmail && !looksLikeAnEmail(rawEmail)) {
      // The row is refused rather than filed without the email: an address the
      // Admin meant to give is not something to drop on their behalf.
      reject('email_unreadable')
      continue
    }

    // Name and number together. Two people on one phone is a couple, not a
    // duplicate; the same person twice is a duplicate.
    const key = rosterKey({ fullName, phone })
    if (seen.has(key)) {
      reject('repeated_in_this_file')
      continue
    }

    seen.add(key)
    people.push({ line: row.line, fullName, phone, email: rawEmail || null })
  }

  return { people, rejected }
}
