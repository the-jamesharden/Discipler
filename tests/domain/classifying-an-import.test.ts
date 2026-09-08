import { describe, expect, it } from 'vitest'
import { personId, type PersonId } from '~/domain/ids'
import { classifyImport, type ImportReadback } from '~/domain/roster-import'
import type { RosterFileReading } from '~/domain/roster-csv'
import { phoneNumber, rosterKey, type ImportedPerson, type PhoneNumber } from '~/domain/roster'

/**
 * What an import will do, decided once for the command and the dialog alike.
 * Pure over what the reader read and what the Roster holds.
 */

const person = (line: number, fullName: string, phone: string, email: string | null = null): ImportedPerson => ({
  line,
  fullName,
  phone: phoneNumber(phone),
  email,
})

const reading = (over: Partial<RosterFileReading> = {}): RosterFileReading => ({
  people: [],
  pairings: [],
  rejected: [],
  ...over,
})

const onRoster = (
  people: { fullName: string; phone: string; id: PersonId }[],
  openPlans: ImportReadback['openPlans'] = [],
): ImportReadback => ({
  people: new Map(people.map((each) => [rosterKey({ fullName: each.fullName, phone: phoneNumber(each.phone) }), each.id])),
  namesByNumber: people.reduce((byNumber, each) => {
    const number = phoneNumber(each.phone)
    return byNumber.set(number, [...(byNumber.get(number) ?? []), each.fullName])
  }, new Map<PhoneNumber, string[]>()),
  openPlans,
})

const sam = person(2, 'Sam Rivera', '+17065550101', 'sam@example.org')
const taylor = person(2, 'Taylor Brooks', '+17065550440')
const existing = personId('00000000-0000-4000-9000-000000000001')

describe('classifying the rows', () => {
  it('files a new person, recognises one already on the Roster, and holds a new name on a known number', () => {
    const { rows, rejections, counts } = classifyImport(
      reading({ people: [sam, person(3, 'Ruth Adeyemi', '+17065550999'), person(4, 'Dave Ellis', '+17065550999')] }),
      onRoster([{ fullName: 'Ruth Adeyemi', phone: '+17065550999', id: existing }]),
    )
    expect(rows.map((row) => [row.line, row.outcome])).toEqual([
      [2, 'new'],
      [3, 'already_on_the_roster'],
      [4, 'held'],
    ])
    expect(rows[1]?.existingId).toBe(existing)
    expect(rejections).toEqual([
      { line: 3, problem: 'already_on_the_roster' },
      { line: 4, problem: 'same_number_different_name' },
    ])
    expect(counts).toEqual({ newDisciplers: 0, newDisciples: 1, pairsPlanned: 0, alreadyOnTheRoster: 1 })
  })

  it('keeps the reader’s own refusals, in line order', () => {
    const { rejections } = classifyImport(
      reading({ people: [person(5, 'Late Row', '+17065550105')], rejected: [{ line: 3, problem: 'no_phone' }] }),
      onRoster([]),
    )
    expect(rejections).toEqual([{ line: 3, problem: 'no_phone' }])
  })
})

describe('classifying the pairings', () => {
  it('plans a pair of two new rows, and counts the Discipler among the disciplers', () => {
    const { pairings, counts } = classifyImport(
      reading({
        people: [sam, taylor],
        pairings: [{ line: 2, leader: { kind: 'in_file', key: rosterKey(sam) }, participant: { kind: 'in_file', key: rosterKey(taylor) } }],
      }),
      onRoster([]),
    )
    expect(pairings).toEqual([
      { line: 2, leader: { kind: 'row', index: 0 }, participant: { kind: 'row', index: 1 }, outcome: 'planned', reason: null },
    ])
    expect(counts).toEqual({ newDisciplers: 1, newDisciples: 1, pairsPlanned: 1, alreadyOnTheRoster: 0 })
  })

  it('pairs a new row with somebody already on the Roster, by their row or by their name', () => {
    const byRow = classifyImport(
      reading({
        people: [sam, person(2, 'Ruth Adeyemi', '+17065550999')],
        pairings: [{ line: 2, leader: { kind: 'in_file', key: rosterKey(sam) }, participant: { kind: 'in_file', key: rosterKey(person(2, 'Ruth Adeyemi', '+17065550999')) } }],
      }),
      onRoster([{ fullName: 'Ruth Adeyemi', phone: '+17065550999', id: existing }]),
    )
    expect(byRow.pairings[0]).toMatchObject({ outcome: 'planned', participant: { kind: 'person', personId: existing } })
    expect(byRow.counts).toEqual({ newDisciplers: 1, newDisciples: 0, pairsPlanned: 1, alreadyOnTheRoster: 1 })

    const byName = classifyImport(
      reading({
        people: [taylor],
        pairings: [{ line: 2, leader: { kind: 'by_name', name: '  ruth   ADEYEMI ' }, participant: { kind: 'in_file', key: rosterKey(taylor) } }],
      }),
      onRoster([{ fullName: 'Ruth Adeyemi', phone: '+17065550999', id: existing }]),
    )
    expect(byName.pairings[0]).toMatchObject({ outcome: 'planned', leader: { kind: 'person', personId: existing } })
  })

  it('refuses a name nobody on the Roster holds, and one that two people hold', () => {
    const unknown = classifyImport(
      reading({ people: [taylor], pairings: [{ line: 2, leader: { kind: 'by_name', name: 'Nobody Here' }, participant: { kind: 'in_file', key: rosterKey(taylor) } }] }),
      onRoster([]),
    )
    expect(unknown.pairings[0]).toMatchObject({ outcome: 'not_recordable', reason: 'paired_with_unknown' })
    expect(unknown.rejections).toEqual([{ line: 2, problem: 'paired_with_unknown' }])

    const twins = classifyImport(
      reading({ people: [taylor], pairings: [{ line: 2, leader: { kind: 'by_name', name: 'Chris Miller' }, participant: { kind: 'in_file', key: rosterKey(taylor) } }] }),
      onRoster([
        { fullName: 'Chris Miller', phone: '+17065550301', id: personId('00000000-0000-4000-9000-000000000002') },
        { fullName: 'Chris Miller', phone: '+17065550302', id: personId('00000000-0000-4000-9000-000000000003') },
      ]),
    )
    expect(twins.pairings[0]).toMatchObject({ outcome: 'not_recordable', reason: 'paired_with_ambiguous' })
  })

  it('does not plan against a row that is being held, and says so', () => {
    const held = person(2, 'Dave Ellis', '+17065550999')
    const { pairings, rejections } = classifyImport(
      reading({ people: [sam, held], pairings: [{ line: 2, leader: { kind: 'in_file', key: rosterKey(sam) }, participant: { kind: 'in_file', key: rosterKey(held) } }] }),
      onRoster([{ fullName: 'David Ellis', phone: '+17065550999', id: existing }]),
    )
    expect(pairings[0]).toMatchObject({ outcome: 'not_recordable', reason: 'paired_with_held' })
    expect(rejections).toEqual([
      { line: 2, problem: 'same_number_different_name' },
      { line: 2, problem: 'paired_with_held' },
    ])
  })

  it('keeps a Disciple to one plan, on the Roster and within the file', () => {
    const second = person(3, 'Jordan Lee', '+17065550103')
    const { pairings, counts } = classifyImport(
      reading({
        people: [sam, taylor, second],
        pairings: [
          { line: 2, leader: { kind: 'in_file', key: rosterKey(sam) }, participant: { kind: 'in_file', key: rosterKey(taylor) } },
          { line: 3, leader: { kind: 'in_file', key: rosterKey(second) }, participant: { kind: 'in_file', key: rosterKey(taylor) } },
        ],
      }),
      onRoster([]),
    )
    expect(pairings.map((pairing) => pairing.outcome)).toEqual(['planned', 'not_recordable'])
    expect(pairings[1]?.reason).toBe('pairing_already_planned')
    expect(counts.pairsPlanned).toBe(1)

    const alreadyPlanned = classifyImport(
      reading({ people: [sam], pairings: [{ line: 2, leader: { kind: 'in_file', key: rosterKey(sam) }, participant: { kind: 'by_name', name: 'Ruth Adeyemi' } }] }),
      onRoster(
        [{ fullName: 'Ruth Adeyemi', phone: '+17065550999', id: existing }],
        [{ leaderId: personId('00000000-0000-4000-9000-000000000009'), participantId: existing }],
      ),
    )
    expect(alreadyPlanned.pairings[0]).toMatchObject({ outcome: 'not_recordable', reason: 'pairing_already_planned' })
  })

  it('refuses a person paired with themselves', () => {
    const { pairings } = classifyImport(
      reading({ people: [sam], pairings: [{ line: 2, leader: { kind: 'in_file', key: rosterKey(sam) }, participant: { kind: 'in_file', key: rosterKey(sam) } }] }),
      onRoster([]),
    )
    expect(pairings[0]).toMatchObject({ outcome: 'not_recordable', reason: 'paired_with_self' })
  })

  it('plans a pair of two people already on the Roster, and reports both rows as already there', () => {
    const other = personId('00000000-0000-4000-9000-000000000004')
    const { pairings, rejections, counts } = classifyImport(
      reading({
        people: [person(2, 'Ruth Adeyemi', '+17065550999'), person(2, 'Omar Haddad', '+17065550888')],
        pairings: [{ line: 2, leader: { kind: 'in_file', key: rosterKey(person(2, 'Ruth Adeyemi', '+17065550999')) }, participant: { kind: 'in_file', key: rosterKey(person(2, 'Omar Haddad', '+17065550888')) } }],
      }),
      onRoster([
        { fullName: 'Ruth Adeyemi', phone: '+17065550999', id: existing },
        { fullName: 'Omar Haddad', phone: '+17065550888', id: other },
      ]),
    )
    expect(pairings[0]).toMatchObject({ outcome: 'planned', leader: { personId: existing }, participant: { personId: other } })
    // One line, one reason, however many people it named.
    expect(rejections).toEqual([{ line: 2, problem: 'already_on_the_roster' }])
    expect(counts).toEqual({ newDisciplers: 0, newDisciples: 0, pairsPlanned: 1, alreadyOnTheRoster: 2 })
  })
})
