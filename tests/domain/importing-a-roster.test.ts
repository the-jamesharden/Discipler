import { describe, expect, it } from 'vitest'
import { handleCommand } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds, intendedPairingId, ministryId, personId, type PersonId } from '~/domain/ids'
import { phoneNumber, rosterKey, type PhoneNumber } from '~/domain/roster'
import type { ImportMode } from '~/domain/roster-csv'
import { file } from '../support/roster'

/**
 * Importing a spreadsheet, at the command boundary. Two rules carry the ticket:
 * importing speaks to nobody, and a row that could not be read comes back with its
 * line number instead of disappearing.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const at = new Date('2026-03-02T09:00:00Z')

const importing = (
  csv: string,
  alreadyOnRoster: { fullName: string; phone: string }[] = [],
  mode: ImportMode = 'people_only',
) =>
  handleCommand(
    { type: 'person.import', ministryId: ministry, mode, text: csv },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      // Nothing planned yet; the plans a paste makes are tested below.
      openPlans: [],
      roster: {
        people: new Map(
          alreadyOnRoster.map(({ fullName, phone }, index) => [
            rosterKey({ fullName, phone: phoneNumber(phone) }),
            personId(`00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`),
          ]),
        ),
        namesByNumber: alreadyOnRoster.reduce((byNumber, { fullName, phone }) => {
          const number = phoneNumber(phone)
          return byNumber.set(number, [...(byNumber.get(number) ?? []), fullName])
        }, new Map<PhoneNumber, string[]>()),
        // An import greets nobody, so who has completed Intake does not bear on it.
        whoCompletedIntake: new Set<PersonId>(),
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

  it('reports a number it already holds under another name, and files nobody', () => {
    // Two things look like this and Discipler cannot tell them apart: Emily
    // Johnson renamed, and her husband on the same phone. Guessing either way
    // loses the other one, so it reports and an Admin says which.
    const result = importing(file('Name,Phone', 'Em Johnson,5550143020'), [
      { fullName: 'Emily Johnson', phone: '+15550143020' },
    ])

    expect(peopleIn(result)).toEqual([])
    expect(result.rejections).toEqual([{ line: 2, problem: 'same_number_different_name' }])
  })

  it('keeps the row it would not guess about, so an Admin can answer it later', () => {
    // The report is a redirect and outlives nothing. A row that expired with it
    // would leave the Admin exactly where reporting was meant to stop leaving
    // them: editing the spreadsheet and uploading it again.
    const result = importing(file('Name,Phone,Email', 'Em Johnson,5550143023,em@example.test'), [
      { fullName: 'Emily Johnson', phone: '+15550143023' },
    ])

    expect(
      result.effects.flatMap((effect) => (effect.kind === 'importRow.raise' ? [effect.row] : [])),
    ).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        ministryId: ministry,
        line: 2,
        fullName: 'Em Johnson',
        phone: '+15550143023',
        email: 'em@example.test',
        importedAt: at,
        resolvedAt: null,
      },
    ])
  })

  it('keeps nothing for a row it refused for any other reason', () => {
    // Only this one has an answer an Admin can give. A row with no phone number is
    // a spreadsheet to fix, and holding it would put a question on the Roster that
    // nothing on the screen could close.
    const result = importing(
      file('Name,Phone', ',5550143024', 'No Number,', 'Too,Many,Fields'),
      [],
    )

    expect(result.effects.filter((effect) => effect.kind === 'importRow.raise')).toEqual([])
  })

  it('tells an exact repeat apart from a number under a new name', () => {
    const result = importing(
      file('Name,Phone', 'Emily Johnson,5550143021', 'Em Johnson,5550143021'),
      [{ fullName: 'Emily Johnson', phone: '+15550143021' }],
    )

    expect(result.rejections).toEqual([
      { line: 2, problem: 'already_on_the_roster' },
      { line: 3, problem: 'same_number_different_name' },
    ])
  })

  it('does not file a second Person for somebody the product itself renamed', () => {
    // Acceptance stores the name a Leader typed, which is often not the name the
    // spreadsheet had. Re-uploading that same unchanged spreadsheet afterwards
    // must not quietly produce a second Emily.
    const result = importing(file('Name,Phone', 'Emily Johnson,5550143022'), [
      { fullName: 'Emily J Johnson', phone: '+15550143022' },
    ])

    expect(peopleIn(result)).toEqual([])
    expect(result.rejections).toEqual([{ line: 2, problem: 'same_number_different_name' }])
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

const plansIn = (result: ReturnType<typeof importing>) =>
  result.effects.flatMap((effect) => (effect.kind === 'intendedPairing.plan' ? [effect.plan] : []))

describe('importing who disciples whom', () => {
  it('plans a pair from an Already paired row, between the two people it just added', () => {
    const result = importing(
      file(
        'Discipler,Discipler Phone,Disciple,Disciple Phone',
        'Sam Rivera,5550143100,Taylor Brooks,5550143101',
      ),
      [],
      'already_paired',
    )

    expect(peopleIn(result).map((person) => [person.id, person.fullName])).toEqual([
      ['00000000-0000-4000-8000-000000000001', 'Sam Rivera'],
      ['00000000-0000-4000-8000-000000000002', 'Taylor Brooks'],
    ])
    expect(plansIn(result)).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000003',
        ministryId: ministry,
        leaderId: '00000000-0000-4000-8000-000000000001',
        participantId: '00000000-0000-4000-8000-000000000002',
        plannedAt: at,
      },
    ])
    // Recorded in history like everything else, with the line it came from.
    expect(
      result.effects.flatMap((effect) =>
        effect.kind === 'history.append' && effect.event.type === 'intended_pairing.planned' ? [effect.event] : [],
      ),
    ).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'intended_pairing.planned',
        subjectType: 'intended_pairing',
        subjectId: '00000000-0000-4000-8000-000000000003',
        payload: {
          leaderId: '00000000-0000-4000-8000-000000000001',
          participantId: '00000000-0000-4000-8000-000000000002',
          line: 2,
        },
      },
    ])
    // A plan, not a relationship: nothing is formed and nobody is texted.
    expect(result.effects.filter((effect) => effect.kind === 'relationship.create')).toEqual([])
    expect(result.effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
  })

  it('plans a pair with somebody already on the Roster, by their name, and changes nothing about them', () => {
    const result = importing(
      file('Name,Role,Phone,Paired With', 'Taylor Brooks,Disciple,5550143102,Ruth Adeyemi'),
      [{ fullName: 'Ruth Adeyemi', phone: '+15550143103' }],
    )

    expect(peopleIn(result).map((person) => person.fullName)).toEqual(['Taylor Brooks'])
    expect(plansIn(result)).toMatchObject([
      { leaderId: '00000000-0000-4000-9000-000000000001', participantId: '00000000-0000-4000-8000-000000000001' },
    ])
    expect(result.rejections).toEqual([])
  })

  it('plans nothing for a row that is being held, and says so on the line', () => {
    const result = importing(
      file(
        'Discipler,Discipler Phone,Disciple,Disciple Phone',
        'Sam Rivera,5550143104,Tay Brooks,5550143105',
      ),
      [{ fullName: 'Taylor Brooks', phone: '+15550143105' }],
      'already_paired',
    )

    expect(peopleIn(result).map((person) => person.fullName)).toEqual(['Sam Rivera'])
    expect(result.effects.filter((effect) => effect.kind === 'importRow.raise')).toHaveLength(1)
    expect(plansIn(result)).toEqual([])
    expect(result.rejections).toEqual([
      { line: 2, problem: 'same_number_different_name' },
      { line: 2, problem: 'paired_with_held' },
    ])
  })

  it('plans against the plans still standing, so a Disciple is never planned twice', () => {
    const result = handleCommand(
      {
        type: 'person.import',
        ministryId: ministry,
        mode: 'people_only',
        text: file('Name,Role,Phone,Paired With', 'Sam Rivera,Discipler,5550143106,Ruth Adeyemi'),
      },
      {
        ministryId: ministry,
        clock: createTestClock(at),
        ids: createSequentialIds(),
        openPlans: [
          {
            id: intendedPairingId('00000000-0000-4000-9000-000000000099'),
            leaderId: personId('00000000-0000-4000-9000-000000000002'),
            participantId: personId('00000000-0000-4000-9000-000000000001'),
            plannedAt: at,
          },
        ],
        roster: {
          people: new Map([[rosterKey({ fullName: 'Ruth Adeyemi', phone: phoneNumber('+15550143107') }), personId('00000000-0000-4000-9000-000000000001')]]),
          namesByNumber: new Map([[phoneNumber('+15550143107'), ['Ruth Adeyemi']]]),
          whoCompletedIntake: new Set<PersonId>(),
        },
      },
    )

    expect(peopleIn(result)).toHaveLength(1)
    expect(plansIn(result)).toEqual([])
    expect(result.rejections).toEqual([{ line: 2, problem: 'pairing_already_planned' }])
  })

  it('refuses to run without the plans, as it refuses to run without the Roster', () => {
    expect(() =>
      handleCommand(
        { type: 'person.import', ministryId: ministry, mode: 'people_only', text: file('Name,Phone') },
        {
          ministryId: ministry,
          clock: createTestClock(at),
          ids: createSequentialIds(),
          roster: { people: new Map(), namesByNumber: new Map(), whoCompletedIntake: new Set<PersonId>() },
        },
      ),
    ).toThrow(/no plans/)
  })
})
