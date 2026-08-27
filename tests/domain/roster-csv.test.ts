import { describe, expect, it } from 'vitest'
import { readRosterFile } from '~/domain/roster-csv'
import { RosterFileUnreadable } from '~/domain/errors'

/**
 * Reading the spreadsheet an Admin exported from wherever they keep their
 * congregation. The rule this file exists to hold is that a row Discipler cannot
 * read is *reported*, never dropped: an import that quietly loses four people is
 * worse than one that refuses, because nobody finds out until those four are the
 * ones nobody discipled.
 */

const file = (...lines: string[]) => lines.join('\n')

describe('reading a Roster file', () => {
  it('reads a name, a phone number and an email into a Person', () => {
    const { people, rejected } = readRosterFile(
      file('Name,Phone,Email', 'Emily Johnson,555-014-2000,emily@example.test'),
    )

    expect(rejected).toEqual([])
    expect(people).toEqual([
      { line: 2, fullName: 'Emily Johnson', phone: '+15550142000', email: 'emily@example.test' },
    ])
  })

  it('takes the columns in whatever order the Admin exported them', () => {
    const { people } = readRosterFile(
      file('Email Address,Mobile,Full Name', 'd@example.test,+1 555 014 2001,David Ellis'),
    )

    expect(people).toEqual([
      { line: 2, fullName: 'David Ellis', phone: '+15550142001', email: 'd@example.test' },
    ])
  })

  it('does not require an email, because a Ministry may only hold numbers', () => {
    const { people, rejected } = readRosterFile(file('Name,Phone', 'Grace Lin,5550142002'))

    expect(rejected).toEqual([])
    expect(people[0]).toMatchObject({ fullName: 'Grace Lin', email: null })
  })

  it('reports the line of a row with no name rather than importing a blank Person', () => {
    const { people, rejected } = readRosterFile(
      file('Name,Phone', 'Emily Johnson,5550142003', ' ,5550142004'),
    )

    expect(people).toHaveLength(1)
    expect(rejected).toEqual([{ line: 3, problem: 'no_name' }])
  })

  it('reports a row with no phone number, because everything a Person receives is SMS', () => {
    const { rejected } = readRosterFile(file('Name,Phone', 'Emily Johnson,'))

    expect(rejected).toEqual([{ line: 2, problem: 'no_phone' }])
  })

  it('reports a phone number it cannot make sense of', () => {
    const { rejected } = readRosterFile(
      file('Name,Phone', 'Emily Johnson,ask her at church', 'David Ellis,555-014'),
    )

    expect(rejected).toEqual([
      { line: 2, problem: 'phone_unreadable' },
      { line: 3, problem: 'phone_unreadable' },
    ])
  })

  it('reports an email it cannot make sense of rather than filing the Person without one', () => {
    const { people, rejected } = readRosterFile(
      file('Name,Phone,Email', 'Emily Johnson,5550142005,emily at example dot test'),
    )

    expect(people).toEqual([])
    expect(rejected).toEqual([{ line: 2, problem: 'email_unreadable' }])
  })

  it('reports a row carrying more fields than the header, rather than shifting its columns', () => {
    // The usual cause is an unquoted comma in a name, and the silent version of
    // this reads someone's surname as their phone number.
    const { rejected } = readRosterFile(
      file('Name,Phone', 'Johnson, Emily,5550142006,extra'),
    )

    expect(rejected).toEqual([{ line: 2, problem: 'too_many_fields' }])
  })

  it('reports the second of two rows naming the same person, and keeps the first', () => {
    const { people, rejected } = readRosterFile(
      file('Name,Phone', 'Emily Johnson,5550142007', '  emily   johnson ,(555) 014-2007'),
    )

    expect(people).toHaveLength(1)
    expect(people[0]).toMatchObject({ fullName: 'Emily Johnson' })
    expect(rejected).toEqual([{ line: 3, problem: 'repeated_in_this_file' }])
  })

  it('keeps two people who share a phone, because a couple is not a duplicate', () => {
    // A shared number is ordinary, and ticket 20's serialisation exists because of
    // it: a phone holds one conversation however many people are reachable on it.
    const { people, rejected } = readRosterFile(
      file('Name,Phone', 'Emily Johnson,5550142014', 'David Johnson,5550142014'),
    )

    expect(rejected).toEqual([])
    expect(people.map((person) => person.fullName)).toEqual(['Emily Johnson', 'David Johnson'])
  })

  it('keeps reading after a row it could not read', () => {
    const { people, rejected } = readRosterFile(
      file('Name,Phone', 'Emily Johnson,nope', 'David Ellis,5550142008'),
    )

    expect(people).toHaveLength(1)
    expect(rejected).toHaveLength(1)
  })

  it('understands quoted fields, a byte-order mark, and Windows line endings', () => {
    const { people, rejected } = readRosterFile(
      '﻿Name,Phone,Email\r\n"Johnson, Emily",5550142009,"emily@example.test"\r\n',
    )

    expect(rejected).toEqual([])
    expect(people).toEqual([
      { line: 2, fullName: 'Johnson, Emily', phone: '+15550142009', email: 'emily@example.test' },
    ])
  })

  it('understands a doubled quote inside a quoted field', () => {
    const { people } = readRosterFile(file('Name,Phone', '"Emily ""Em"" Johnson",5550142010'))

    expect(people[0]).toMatchObject({ fullName: 'Emily "Em" Johnson' })
  })

  it('skips blank lines without calling them unreadable', () => {
    const { people, rejected } = readRosterFile(
      file('Name,Phone', '', 'Emily Johnson,5550142011', '   ', ''),
    )

    expect(people).toHaveLength(1)
    expect(rejected).toEqual([])
  })

  it('keeps a number already in international form', () => {
    const { people } = readRosterFile(file('Name,Phone', 'Ana Silva,+44 7700 900123'))

    expect(people[0]).toMatchObject({ phone: '+447700900123' })
  })

  it('refuses a file with no name column rather than guessing which one it is', () => {
    expect(() => readRosterFile(file('Phone,Email', '5550142012,e@example.test'))).toThrow(
      new RosterFileUnreadable('no_name_column'),
    )
  })

  it('refuses a file with no phone column', () => {
    expect(() => readRosterFile(file('Name,Email', 'Emily Johnson,e@example.test'))).toThrow(
      new RosterFileUnreadable('no_phone_column'),
    )
  })

  it('refuses an empty file', () => {
    expect(() => readRosterFile('   \n\n')).toThrow(new RosterFileUnreadable('nothing_to_read'))
  })

  it('refuses a file whose header row is missing, rather than eating the first Person', () => {
    // Without a header the first congregant is silently consumed as column names.
    expect(() => readRosterFile(file('Emily Johnson,5550142013'))).toThrow(RosterFileUnreadable)
  })
})
