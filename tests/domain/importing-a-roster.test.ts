import { describe, expect, it } from 'vitest'
import { handleCommand } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds, ministryId } from '~/domain/ids'
import { phoneNumber, rosterKey } from '~/domain/roster'
import { file } from '../support/roster'

/**
 * Importing a spreadsheet, at the command boundary. Two rules carry the ticket:
 * importing speaks to nobody, and a row that could not be read comes back with its
 * line number instead of disappearing.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const at = new Date('2026-03-02T09:00:00Z')

const importing = (csv: string, alreadyOnRoster: { fullName: string; phone: string }[] = []) =>
  handleCommand(
    { type: 'person.import', ministryId: ministry, csv },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      roster: {
        people: new Set(
          alreadyOnRoster.map(({ fullName, phone }) =>
            rosterKey({ fullName, phone: phoneNumber(phone) }),
          ),
        ),
      },
    },
  )

const peopleIn = (result: ReturnType<typeof importing>) =>
  result.effects.flatMap((effect) => (effect.kind === 'person.create' ? [effect.person] : []))

describe('importing a Roster', () => {
  it('puts everyone the file named onto the Roster', () => {
    const result = importing(
      file('Name,Phone,Email', 'Emily Johnson,5550143000,emily@example.test', 'David Ellis,5550143001'),
    )

    expect(peopleIn(result)).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        ministryId: ministry,
        fullName: 'Emily Johnson',
        phone: '+15550143000',
        email: 'emily@example.test',
        createdAt: at,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        ministryId: ministry,
        fullName: 'David Ellis',
        phone: '+15550143001',
        email: null,
        createdAt: at,
      },
    ])
  })

  it('enqueues nothing to anyone, because a Roster row is not consent', () => {
    const result = importing(file('Name,Phone', 'Emily Johnson,5550143002'))

    expect(result.effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
  })

  it('records each import in history, where everything else is derived from', () => {
    const result = importing(file('Name,Phone', 'Emily Johnson,5550143003'))
    const history = result.effects.flatMap((effect) =>
      effect.kind === 'history.append' ? [effect.event] : [],
    )

    expect(history).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'person.imported',
        subjectType: 'person',
        subjectId: '00000000-0000-4000-8000-000000000001',
        payload: { fullName: 'Emily Johnson' },
      },
    ])
  })

  it('reports a row naming someone already on the Roster, and imports nobody twice', () => {
    const result = importing(
      file('Name,Phone', 'Emily Johnson,5550143004', 'David Ellis,5550143005'),
      [{ fullName: 'Emily Johnson', phone: '+15550143004' }],
    )

    expect(peopleIn(result).map((person) => person.fullName)).toEqual(['David Ellis'])
    expect(result.rejections).toEqual([{ line: 2, problem: 'already_on_the_roster' }])
  })

  it('changes nothing about the Person already on the Roster', () => {
    // A stale export must not overwrite a name or an email the Person themselves
    // gave at Intake, so a row already on file produces no effect at all.
    const result = importing(file('Name,Phone,Email', 'Em J,5550143006,new@example.test'), [
      { fullName: 'em j', phone: '+15550143006' },
    ])

    expect(result.effects).toEqual([])
  })

  it('reports every row it could not read, in the order they appear in the file', () => {
    const result = importing(
      file(
        'Name,Phone',
        'Emily Johnson,5550143007',
        ',5550143008',
        'David Ellis,ask him',
        'Grace Lin,5550143009',
      ),
      [{ fullName: 'Grace Lin', phone: '+15550143009' }],
    )

    expect(result.rejections).toEqual([
      { line: 3, problem: 'no_name' },
      { line: 4, problem: 'phone_unreadable' },
      { line: 5, problem: 'already_on_the_roster' },
    ])
    expect(peopleIn(result)).toHaveLength(1)
  })

  it('is pure: the same file against the same Roster yields the same effects', () => {
    const csv = file('Name,Phone', 'Emily Johnson,5550143010')

    expect(importing(csv)).toEqual(importing(csv))
  })

  it('imports nobody, and refuses nobody, from a file naming nobody', () => {
    const result = importing(file('Name,Phone'))

    expect(result).toEqual({ effects: [], rejections: [] })
  })
})
