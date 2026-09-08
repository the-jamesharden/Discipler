import { describe, expect, it } from 'vitest'
import { readRosterFile } from '~/domain/roster-csv'
import { RosterFileUnreadable } from '~/domain/errors'
import { phoneNumber, rosterKey } from '~/domain/roster'
import { file } from '../support/roster'

/**
 * Reading the spreadsheet an Admin exported from wherever they keep their
 * congregation. The rule this file exists to hold is that a row Discipler cannot
 * read is *reported*, never dropped: an import that quietly loses four people is
 * worse than one that refuses, because nobody finds out until those four are the
 * ones nobody discipled.
 */

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

  it('reads a paste from a spreadsheet, which is tab-separated', () => {
    const { people, rejected } = readRosterFile(
      'Name\tPhone\tEmail\nJohnson, Emily\t(555) 014-2015\temily@example.test\n',
    )

    expect(rejected).toEqual([])
    expect(people).toEqual([
      { line: 2, fullName: 'Johnson, Emily', phone: '+15550142015', email: 'emily@example.test' },
    ])
  })

  it('reads nothing about pairs from rows that say nothing about them', () => {
    const { pairings } = readRosterFile(file('Name,Phone', 'Emily Johnson,5550142016'))
    expect(pairings).toEqual([])
  })
})

/**
 * People only, with the two optional columns (ticket 36): Role says which side of
 * a Paired With pair the person takes, and on a row naming nobody it changes
 * nothing, because being paired is what makes a Discipler.
 */
describe('reading who is paired with whom, one person per row', () => {
  const key = (fullName: string, phone: string) => rosterKey({ fullName, phone: phoneNumber(phone) })

  it('pairs a row with another row of the paste, from either side', () => {
    const { pairings, rejected } = readRosterFile(
      file(
        'Name,Role,Phone,Paired With',
        'Sam Rivera,Discipler,5550142020,Taylor Brooks',
        'Taylor Brooks,Disciple,5550142021,',
        'Casey Nguyen,Disciple,5550142022,  alex   MORGAN ',
        'Alex Morgan,,5550142023,',
      ),
    )

    expect(rejected).toEqual([])
    expect(pairings).toEqual([
      { line: 2, leader: { kind: 'in_file', key: key('Sam Rivera', '+15550142020') }, participant: { kind: 'in_file', key: key('Taylor Brooks', '+15550142021') } },
      { line: 4, leader: { kind: 'in_file', key: key('Alex Morgan', '+15550142023') }, participant: { kind: 'in_file', key: key('Casey Nguyen', '+15550142022') } },
    ])
  })

  it('reads the same pair said from both rows as one pair', () => {
    const { pairings } = readRosterFile(
      file(
        'Name,Role,Phone,Paired With',
        'Sam Rivera,Discipler,5550142024,Taylor Brooks',
        'Taylor Brooks,Disciple,5550142025,Sam Rivera',
      ),
    )
    expect(pairings).toHaveLength(1)
    expect(pairings[0]?.line).toBe(2)
  })

  it('refuses the same two people paired the other way round on a later row', () => {
    const { pairings, rejected } = readRosterFile(
      file(
        'Name,Role,Phone,Paired With',
        'Sam Rivera,Discipler,5550142026,Taylor Brooks',
        'Taylor Brooks,Discipler,5550142027,Sam Rivera',
      ),
    )
    expect(pairings).toHaveLength(1)
    expect(rejected).toEqual([{ line: 3, problem: 'paired_with_conflict' }])
  })

  it('leaves a name no row carries for the Roster to answer', () => {
    const { pairings } = readRosterFile(
      file('Name,Role,Phone,Paired With', 'Taylor Brooks,Disciple,5550142028,Ruth Adeyemi'),
    )
    expect(pairings).toEqual([
      { line: 2, leader: { kind: 'by_name', name: 'Ruth Adeyemi' }, participant: { kind: 'in_file', key: key('Taylor Brooks', '+15550142028') } },
    ])
  })

  it('refuses a name two rows of the paste go by, rather than picking one', () => {
    const { pairings, rejected, people } = readRosterFile(
      file(
        'Name,Role,Phone,Paired With',
        'Chris Miller,,5550142029,',
        'Chris Miller,,5550142030,',
        'Taylor Brooks,Disciple,5550142031,Chris Miller',
      ),
    )
    expect(people).toHaveLength(3)
    expect(pairings).toEqual([])
    expect(rejected).toEqual([{ line: 4, problem: 'paired_with_ambiguous' }])
  })

  it('refuses a pair whose row says no Role, and a Role it cannot read, and keeps the person', () => {
    const { people, pairings, rejected } = readRosterFile(
      file(
        'Name,Role,Phone,Paired With',
        'Taylor Brooks,,5550142032,Sam Rivera',
        'Sam Rivera,Pastor,5550142033,',
      ),
    )
    expect(people).toHaveLength(2)
    expect(pairings).toEqual([])
    expect(rejected).toEqual([
      { line: 2, problem: 'paired_with_no_role' },
      { line: 3, problem: 'role_unreadable' },
    ])
  })

  it('accepts the words a church’s own spreadsheet may use for the two sides, silently', () => {
    const { pairings, rejected } = readRosterFile(
      file(
        'Name,Role,Phone,Partner',
        'Sam Rivera,Mentor,5550142034,Taylor Brooks',
        'Taylor Brooks,Mentee,5550142035,',
        'Jordan Lee,Leader,5550142036,Riley Carter',
        'Riley Carter,Participant,5550142037,',
      ),
    )
    expect(rejected).toEqual([])
    expect(pairings.map((pairing) => pairing.leader)).toEqual([
      { kind: 'in_file', key: key('Sam Rivera', '+15550142034') },
      { kind: 'in_file', key: key('Jordan Lee', '+15550142036') },
    ])
  })

  it('reads a Role on a row naming nobody as nothing at all', () => {
    const { pairings, rejected } = readRosterFile(
      file('Name,Role,Phone,Paired With', 'Sam Rivera,Discipler,5550142038,'),
    )
    expect(pairings).toEqual([])
    expect(rejected).toEqual([])
  })
})

/**
 * Already paired: one discipler-disciple pair per row, both people read off it.
 */
describe('reading rows that are already pairs', () => {
  const key = (fullName: string, phone: string) => rosterKey({ fullName, phone: phoneNumber(phone) })
  const paired = (text: string) => readRosterFile(text, 'already_paired')

  it('reads both people and the pair off each row', () => {
    const { people, pairings, rejected } = paired(
      'Discipler\tDiscipler Phone\tDiscipler Email\tDisciple\tDisciple Phone\tDisciple Email\n'
        + 'Sam Rivera\t(706) 555-0101\tsam@example.org\tTaylor Brooks\t(706) 555-0440\t\n',
    )

    expect(rejected).toEqual([])
    expect(people).toEqual([
      { line: 2, fullName: 'Sam Rivera', phone: '+17065550101', email: 'sam@example.org' },
      { line: 2, fullName: 'Taylor Brooks', phone: '+17065550440', email: null },
    ])
    expect(pairings).toEqual([
      { line: 2, leader: { kind: 'in_file', key: key('Sam Rivera', '+17065550101') }, participant: { kind: 'in_file', key: key('Taylor Brooks', '+17065550440') } },
    ])
  })

  it('takes the columns in any order, by the side word and what follows it', () => {
    const { people, rejected } = paired(
      file('Mentee Mobile,Mentee Name,Leader,Leader Cell', '5550142040,Riley Carter,Jordan Lee,5550142041'),
    )
    expect(rejected).toEqual([])
    expect(people.map((person) => person.fullName)).toEqual(['Jordan Lee', 'Riley Carter'])
  })

  it('reads a Discipler on several rows once, leading each of them', () => {
    const { people, pairings, rejected } = paired(
      file(
        'Discipler,Discipler Phone,Disciple,Disciple Phone',
        'Sam Rivera,5550142042,Taylor Brooks,5550142043',
        'Sam Rivera,5550142042,Casey Nguyen,5550142044',
      ),
    )
    expect(rejected).toEqual([])
    expect(people.map((person) => person.fullName)).toEqual(['Sam Rivera', 'Taylor Brooks', 'Casey Nguyen'])
    expect(pairings).toHaveLength(2)
  })

  it('refuses the whole row when either side cannot be read', () => {
    const { people, pairings, rejected } = paired(
      file(
        'Discipler,Discipler Phone,Disciple,Disciple Phone',
        'Sam Rivera,5550142045,,5550142046',
        ',5550142047,Taylor Brooks,5550142048',
        'Alex Morgan,ask him,Casey Nguyen,5550142049',
      ),
    )
    expect(people).toEqual([])
    expect(pairings).toEqual([])
    expect(rejected).toEqual([
      { line: 2, problem: 'no_name' },
      { line: 3, problem: 'no_name' },
      { line: 4, problem: 'phone_unreadable' },
    ])
  })

  it('refuses rows with no columns for one of the two sides', () => {
    expect(() => paired(file('Name,Phone', 'Sam Rivera,5550142050'))).toThrow(
      new RosterFileUnreadable('no_discipler_columns'),
    )
    expect(() => paired(file('Discipler,Discipler Phone,Disciple', 'Sam Rivera,5550142050,Taylor'))).toThrow(
      new RosterFileUnreadable('no_disciple_columns'),
    )
  })
})
