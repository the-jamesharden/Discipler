import { describe, expect, it } from 'vitest'
import { handleCommand } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { ImportRowResolutionRefused } from '~/domain/errors'
import {
  createSequentialIds,
  importRowId,
  ministryId,
  personId,
  type PersonId,
} from '~/domain/ids'
import {
  phoneNumber,
  rosterKey,
  type HeldImportRow,
  type PhoneNumber,
} from '~/domain/roster'

/**
 * The Admin-facing half of `same_number_different_name`. The importer already
 * refuses to guess whether a new name on a number it holds is a rename or a second
 * person; this is where the Admin says which, and the whole of what it must not do
 * is guess on their behalf.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const at = new Date('2026-03-09T09:00:00Z')
/** The Admin's account, which is what every judgement in this product records. */
const admin = '99999999-9999-4999-8999-999999999999'

const shared = phoneNumber('+15550143030')
const rowId = importRowId('22222222-2222-4222-8222-222222222222')

const emily = personId('00000000-0000-4000-9000-000000000001')
const daniel = personId('00000000-0000-4000-9000-000000000002')

/**
 * The Roster as the resolution reads it: names against the number, and the Person
 * behind each name. Built the way the adapter builds it, from one list of people.
 */
const rosterOf = (people: { id: PersonId; fullName: string; phone: PhoneNumber }[]) => ({
  people: new Map(
    people.map((person) => [rosterKey(person), person.id] as const),
  ),
  namesByNumber: people.reduce(
    (byNumber, person) =>
      byNumber.set(person.phone, [...(byNumber.get(person.phone) ?? []), person.fullName]),
    new Map<PhoneNumber, string[]>(),
  ),
  whoCompletedIntake: new Set<PersonId>(),
})

const held: HeldImportRow = {
  id: rowId,
  ministryId: ministry,
  line: 7,
  fullName: 'Em Johnson',
  phone: shared,
  email: 'em@example.test',
  importedAt: new Date('2026-03-02T09:00:00Z'),
  resolvedAt: null,
}

const resolving = (
  answer:
    | { kind: 'same_person'; personId: PersonId }
    | { kind: 'someone_else' },
  {
    row = held,
    onTheRoster = [{ id: emily, fullName: 'Emily Johnson', phone: shared }],
  }: {
    row?: typeof held
    onTheRoster?: { id: PersonId; fullName: string; phone: PhoneNumber }[]
  } = {},
) =>
  handleCommand(
    {
      type: 'import_row.resolve',
      ministryId: ministry,
      rowId: row.id,
      resolvedBy: admin,
      answer,
    },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      importRow: row,
      roster: rosterOf(onTheRoster),
    },
  )

const peopleIn = (result: ReturnType<typeof resolving>) =>
  result.effects.flatMap((effect) => (effect.kind === 'person.create' ? [effect.person] : []))

const renamesIn = (result: ReturnType<typeof resolving>) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'person.rename' ? [effect.renaming] : [],
  )

const resolutionsIn = (result: ReturnType<typeof resolving>) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'importRow.resolve' ? [effect.resolution] : [],
  )

describe('resolving a number the Roster already holds', () => {
  describe('same person', () => {
    it('renames the Person the Admin named, and creates nobody', () => {
      const result = resolving({ kind: 'same_person', personId: emily })

      expect(renamesIn(result)).toEqual([
        {
          ministryId: ministry,
          personId: emily,
          fullName: 'Em Johnson',
          renamedAt: at,
        },
      ])
      expect(peopleIn(result)).toEqual([])
    })

    it('records the answer against the row, and against the Person it landed on', () => {
      const result = resolving({ kind: 'same_person', personId: emily })

      expect(resolutionsIn(result)).toEqual([
        {
          ministryId: ministry,
          rowId,
          answer: 'same_person',
          personId: emily,
          resolvedBy: admin,
          resolvedAt: at,
        },
      ])
    })

    it('leaves the email alone, because only the name was answered for', () => {
      // A stale export must not overwrite an address the Person gave at Intake.
      // The Admin answered *which Person this row is*, not *replace what they told
      // us*, and the rename is the only thing the ticket asks for.
      const result = resolving({ kind: 'same_person', personId: emily })

      expect(JSON.stringify(result.effects)).not.toContain('em@example.test')
    })

    it('renames the one of two on a shared number that the Admin picked', () => {
      // ADR-0005 has always allowed a second person on a shared phone, so the
      // number may already hold two -- and *same person* is a question with two
      // answers then. The row offers one per name and the command renames the one
      // that was named; nothing here picks between them.
      const result = resolving(
        { kind: 'same_person', personId: daniel },
        {
          onTheRoster: [
            { id: emily, fullName: 'Emily Johnson', phone: shared },
            { id: daniel, fullName: 'Daniel Johnson', phone: shared },
          ],
        },
      )

      expect(renamesIn(result).map((renaming) => renaming.personId)).toEqual([daniel])
    })

    it('refuses to rename somebody who is not on this number', () => {
      // The row names a number, and a rename that reached past it would let a form
      // post rename any Person in the Ministry.
      const elsewhere = personId('00000000-0000-4000-9000-000000000009')

      expect(() => resolving({ kind: 'same_person', personId: elsewhere })).toThrow(
        ImportRowResolutionRefused,
      )
    })

    it('does not write a history event for the rename', () => {
      // Ticket 26 leaves *whether a rename appends a history event* open, to be
      // settled with ticket 07's history work rather than by inventing an event
      // kind here. The row itself records who answered and when.
      const result = resolving({ kind: 'same_person', personId: emily })

      expect(result.effects.filter((effect) => effect.kind === 'history.append')).toEqual([])
    })
  })

  describe('someone else on this number', () => {
    it('creates a second Person on the shared number, and renames nobody', () => {
      const result = resolving({ kind: 'someone_else' })

      expect(peopleIn(result)).toEqual([
        {
          id: '00000000-0000-4000-8000-000000000001',
          ministryId: ministry,
          fullName: 'Em Johnson',
          phone: shared,
          email: 'em@example.test',
          createdAt: at,
        },
      ])
      expect(renamesIn(result)).toEqual([])
    })

    it('records the answer against the Person it just created', () => {
      const result = resolving({ kind: 'someone_else' })

      expect(resolutionsIn(result)).toEqual([
        {
          ministryId: ministry,
          rowId,
          answer: 'someone_else',
          personId: '00000000-0000-4000-8000-000000000001',
          resolvedBy: admin,
          resolvedAt: at,
        },
      ])
    })

    it('records that the Person was imported, like every other imported Person', () => {
      // They arrived in a spreadsheet and reached the Roster from it. The answer is
      // what unblocked the row, not a different way of joining a Ministry.
      const result = resolving({ kind: 'someone_else' })

      expect(
        result.effects.flatMap((effect) =>
          effect.kind === 'history.append' ? [effect.event] : [],
        ),
      ).toMatchObject([{ type: 'person.imported', subjectType: 'person' }])
    })
  })

  describe('what it will not do', () => {
    it('refuses a row somebody has already answered', () => {
      // Two Admins on the same report. The second must not rename a Person on the
      // strength of a question the first one already closed.
      expect(() =>
        resolving(
          { kind: 'same_person', personId: emily },
          { row: { ...held, resolvedAt: at } },
        ),
      ).toThrow(ImportRowResolutionRefused)
    })

    it('refuses either answer once the name is on the number after all', () => {
      // Between the import and the answer, somebody imported that exact person --
      // or answered a second copy of this row. Both answers would now make a
      // duplicate the identity index refuses; the Admin is told rather than shown
      // a constraint.
      const alreadyThere = [
        { id: emily, fullName: 'Emily Johnson', phone: shared },
        { id: daniel, fullName: 'Em Johnson', phone: shared },
      ]

      expect(() =>
        resolving({ kind: 'someone_else' }, { onTheRoster: alreadyThere }),
      ).toThrow(ImportRowResolutionRefused)
      expect(() =>
        resolving({ kind: 'same_person', personId: emily }, { onTheRoster: alreadyThere }),
      ).toThrow(ImportRowResolutionRefused)
    })
  })
})
