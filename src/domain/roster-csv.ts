import { RosterFileUnreadable } from './errors'
import {
  asEmail,
  asPhoneNumber,
  rosterKey,
  type ImportedPerson,
  type PhoneNumber,
  type RosterKey,
  type RowProblem,
  type RowRejection,
} from './roster'

/**
 * Reading the rows an Admin pasted straight out of wherever they keep their
 * congregation. Pure string work, so it sits in the domain and is driven by tests
 * with no upload anywhere near it -- and runs in the browser for the review, on
 * the same text, so the review and the import cannot disagree (ticket 36).
 *
 * The rule the whole file exists to hold: a row Discipler cannot read is reported
 * back with its line number, never dropped. An import that quietly loses four
 * people is worse than one that refuses, because nobody finds out until those four
 * are the ones nobody discipled.
 *
 * Two layouts, and the Admin says which. *People only* is one person per row,
 * with a Role and a Paired With column if they want to plan pairs; *Already
 * paired* is one discipler-disciple pair per row. Both come out as the same
 * reading: the people, the pairings the rows described, and the rows refused.
 */

export type ImportMode = 'already_paired' | 'people_only'
export const IMPORT_MODES: readonly ImportMode[] = ['already_paired', 'people_only']
export const isImportMode = (value: unknown): value is ImportMode =>
  value === 'already_paired' || value === 'people_only'

/**
 * One side of a pairing the rows describe: a row of the same paste, or a name
 * that has to be found on the Roster because no row of the paste carries it.
 */
export type PairingSide =
  | { readonly kind: 'in_file'; readonly key: RosterKey }
  | { readonly kind: 'by_name'; readonly name: string }

export interface ImportedPairing {
  readonly line: number
  readonly leader: PairingSide
  readonly participant: PairingSide
}

export interface RosterFileReading {
  readonly people: readonly ImportedPerson[]
  readonly pairings: readonly ImportedPairing[]
  readonly rejected: readonly RowRejection[]
}

interface Row {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  readonly line: number
  readonly fields: readonly string[]
}

/**
 * A spreadsheet pastes as tab-separated text and an export saves as CSV; the
 * header row says which this is. A tab anywhere in it is a paste, because a
 * comma-separated header never holds one.
 */
const delimiterIn = (text: string): '\t' | ',' => {
  const header = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'))
  return header.includes('\t') ? '\t' : ','
}

/**
 * A reader rather than a `split(',')`: a name held as `"Johnson, Emily"` is
 * ordinary in an export, and splitting on commas reads the surname as a phone
 * number. Quoted fields, doubled quotes, CRLF and a byte-order mark are all things
 * a real export arrives carrying, and a spreadsheet quotes a pasted cell that
 * holds a line break the same way.
 */
const rowsIn = (text: string): Row[] => {
  const source = text.replace(/^﻿/, '')
  const delimiter = delimiterIn(source)
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
    else if (char === delimiter) endField()
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
 *
 * The two sides of a pair go by the product's words and, silently, by the words
 * a church's own spreadsheet may already use (ticket 36, Q10).
 */
const HEADINGS = {
  name: ['name', 'full name', 'fullname', 'person', 'person name', 'first name last name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'mobile phone', 'cell', 'cell phone', 'telephone', 'number'],
  email: ['email', 'email address', 'e mail', 'e mail address'],
  role: ['role'],
  pairedWith: ['paired with', 'pairedwith', 'paired', 'pair with', 'partner'],
  discipler: ['discipler', 'leader', 'mentor'],
  disciple: ['disciple', 'participant', 'mentee'],
}

const columnFor = (headings: readonly string[], accepted: readonly string[]): number =>
  headings.findIndex((heading) => accepted.includes(heading))

/**
 * The columns of one side of the Already paired layout: `Discipler`, `Discipler
 * Phone`, `Discipler Email`, and the same again for the Disciple. The side word
 * alone, or with *name* after it, is the name column.
 */
const sideColumns = (headings: readonly string[], side: readonly string[]) => {
  const after = (heading: string): string | null => {
    const word = side.find((each) => heading === each || heading.startsWith(`${each} `))
    return word === undefined ? null : heading.slice(word.length).trim()
  }
  const find = (accepted: readonly string[]) =>
    headings.findIndex((heading) => {
      const rest = after(heading)
      return rest !== null && accepted.includes(rest)
    })
  return {
    name: find(['', 'name', 'full name']),
    phone: find(HEADINGS.phone),
    email: find(HEADINGS.email),
  }
}

type Role = 'discipler' | 'disciple'

/** Discipler or Disciple, by the product's words or a spreadsheet's own; blank is no answer. */
const asRole = (raw: string): Role | null | undefined => {
  const value = asHeading(raw)
  if (value === '') return null
  if (HEADINGS.discipler.includes(value)) return 'discipler'
  if (HEADINGS.disciple.includes(value)) return 'disciple'
  return undefined
}

/** The fold ADR-0005 uses on a name, so a name typed two ways is one name. */
export const normalisedName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * One name, number and email read off a row, or why they could not be. The same
 * reading for a row of its own and for either side of a pair.
 */
const readPerson = (
  fields: readonly string[],
  columns: { readonly name: number; readonly phone: number; readonly email: number },
): { fullName: string; phone: PhoneNumber; email: string | null } | { problem: RowProblem } => {
  const valueIn = (column: number) => (column < 0 ? '' : (fields[column] ?? '').trim())

  const fullName = valueIn(columns.name)
  if (!fullName) return { problem: 'no_name' }

  const rawPhone = valueIn(columns.phone)
  if (!rawPhone) return { problem: 'no_phone' }

  const phone = asPhoneNumber(rawPhone)
  if (!phone) return { problem: 'phone_unreadable' }

  const rawEmail = valueIn(columns.email)
  // The row is refused rather than filed without the email: an address the
  // Admin meant to give is not something to drop on their behalf.
  if (rawEmail && asEmail(rawEmail) === null) return { problem: 'email_unreadable' }

  return { fullName, phone, email: rawEmail || null }
}

const sideId = (side: PairingSide): string =>
  side.kind === 'in_file' ? `key:${side.key}` : `name:${normalisedName(side.name)}`

/**
 * The pairings the rows described, one per pair of people however many rows said
 * it. The same pair said from both rows -- Sam's row names Taylor and Taylor's
 * names Sam -- is one pairing; the same two people the other way round on a later
 * row is a contradiction, refused on that line.
 */
const collectPairings = (
  described: readonly ImportedPairing[],
  reject: (line: number, problem: RowProblem) => void,
): ImportedPairing[] => {
  const kept: ImportedPairing[] = []
  const seen = new Set<string>()
  for (const pairing of described) {
    const forward = `${sideId(pairing.leader)}>${sideId(pairing.participant)}`
    const backward = `${sideId(pairing.participant)}>${sideId(pairing.leader)}`
    if (seen.has(forward)) continue
    if (seen.has(backward)) {
      reject(pairing.line, 'paired_with_conflict')
      continue
    }
    seen.add(forward)
    kept.push(pairing)
  }
  return kept
}

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
export const readRosterFile = (text: string, mode: ImportMode = 'people_only'): RosterFileReading => {
  const rows = rowsIn(text)
  const header = rows[0]
  if (!header) throw new RosterFileUnreadable('nothing_to_read')

  const headings = header.fields.map(asHeading)
  const rejected: RowRejection[] = []
  const reject = (line: number, problem: RowProblem) => rejected.push({ line, problem })

  /** A row carrying more fields than the header: an unquoted comma, usually, and every column after it is describing something else. */
  const overflows = (row: Row): boolean => {
    if (row.fields.length <= header.fields.length) return false
    reject(row.line, 'too_many_fields')
    return true
  }

  const reading =
    mode === 'already_paired'
      ? readPairs(rows.slice(1), headings, overflows, reject)
      : readPeople(rows.slice(1), headings, overflows, reject)

  return {
    people: reading.people,
    pairings: collectPairings(reading.pairings, reject),
    rejected: rejected.sort((first, second) => first.line - second.line),
  }
}

/** *People only*: one person per row, and a pair wherever a row says who they are paired with. */
const readPeople = (
  rows: readonly Row[],
  headings: readonly string[],
  overflows: (row: Row) => boolean,
  reject: (line: number, problem: RowProblem) => void,
) => {
  const columns = {
    name: columnFor(headings, HEADINGS.name),
    phone: columnFor(headings, HEADINGS.phone),
    email: columnFor(headings, HEADINGS.email),
  }
  if (columns.name < 0) throw new RosterFileUnreadable('no_name_column')
  if (columns.phone < 0) throw new RosterFileUnreadable('no_phone_column')
  const roleColumn = columnFor(headings, HEADINGS.role)
  const pairedWithColumn = columnFor(headings, HEADINGS.pairedWith)

  const people: ImportedPerson[] = []
  const seen = new Set<string>()
  /** What each kept row said about a pair, resolved once every row has been read. */
  const said: { line: number; key: RosterKey; role: Role | null | undefined; pairedWith: string }[] = []

  for (const row of rows) {
    if (overflows(row)) continue
    const person = readPerson(row.fields, columns)
    if ('problem' in person) {
      reject(row.line, person.problem)
      continue
    }

    // Name and number together. Two people on one phone is a couple, not a
    // duplicate; the same person twice is a duplicate.
    const key = rosterKey(person)
    if (seen.has(key)) {
      reject(row.line, 'repeated_in_this_file')
      continue
    }
    seen.add(key)
    people.push({ line: row.line, ...person })

    const valueIn = (column: number) => (column < 0 ? '' : (row.fields[column] ?? '').trim())
    said.push({ line: row.line, key, role: asRole(valueIn(roleColumn)), pairedWith: valueIn(pairedWithColumn) })
  }

  // Paired With is resolved first within the paste, by the name fold, and only
  // then against the Roster: the classifier takes a name it could not place here.
  const rowsByName = new Map<string, RosterKey[]>()
  for (const person of people) {
    const name = normalisedName(person.fullName)
    rowsByName.set(name, [...(rowsByName.get(name) ?? []), rosterKey(person)])
  }

  const pairings: ImportedPairing[] = []
  for (const row of said) {
    // A Role the reader cannot read is refused on its own: the person is imported,
    // and the pair is not planned, because guessing the side of it would put the
    // wrong person in charge of the other.
    if (row.role === undefined) {
      reject(row.line, 'role_unreadable')
      continue
    }
    // A Role with nobody in Paired With changes nothing (ticket 36, decision 11):
    // being paired is what makes a Discipler.
    if (!row.pairedWith) continue
    if (row.role === null) {
      reject(row.line, 'paired_with_no_role')
      continue
    }
    const inFile = rowsByName.get(normalisedName(row.pairedWith)) ?? []
    if (inFile.length > 1) {
      reject(row.line, 'paired_with_ambiguous')
      continue
    }
    const other: PairingSide =
      inFile.length === 1 ? { kind: 'in_file', key: inFile[0]! } : { kind: 'by_name', name: row.pairedWith }
    const self: PairingSide = { kind: 'in_file', key: row.key }
    pairings.push(
      row.role === 'discipler'
        ? { line: row.line, leader: self, participant: other }
        : { line: row.line, leader: other, participant: self },
    )
  }

  return { people, pairings }
}

/** *Already paired*: one discipler-disciple pair per row, both people read off it. */
const readPairs = (
  rows: readonly Row[],
  headings: readonly string[],
  overflows: (row: Row) => boolean,
  reject: (line: number, problem: RowProblem) => void,
) => {
  const discipler = sideColumns(headings, HEADINGS.discipler)
  const disciple = sideColumns(headings, HEADINGS.disciple)
  if (discipler.name < 0 || discipler.phone < 0) throw new RosterFileUnreadable('no_discipler_columns')
  if (disciple.name < 0 || disciple.phone < 0) throw new RosterFileUnreadable('no_disciple_columns')

  const people: ImportedPerson[] = []
  const seen = new Set<string>()
  const pairings: ImportedPairing[] = []

  for (const row of rows) {
    if (overflows(row)) continue
    const leader = readPerson(row.fields, discipler)
    if ('problem' in leader) {
      reject(row.line, leader.problem)
      continue
    }
    const participant = readPerson(row.fields, disciple)
    if ('problem' in participant) {
      reject(row.line, participant.problem)
      continue
    }

    // The same Discipler on several rows is the ordinary case -- one leads any
    // number of one-to-ones -- so a person already read is the same person, not
    // a repeat. The classifier keeps a Disciple to one plan.
    for (const person of [leader, participant]) {
      const key = rosterKey(person)
      if (seen.has(key)) continue
      seen.add(key)
      people.push({ line: row.line, ...person })
    }

    pairings.push({
      line: row.line,
      leader: { kind: 'in_file', key: rosterKey(leader) },
      participant: { kind: 'in_file', key: rosterKey(participant) },
    })
  }

  return { people, pairings }
}
