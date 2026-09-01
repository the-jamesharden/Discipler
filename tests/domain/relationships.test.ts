import { describe, expect, it } from 'vitest'
import { roleNoun } from '~/domain/ministry-settings'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId } from '~/domain/ids'
import { kindFor } from '~/domain/relationships'

/**
 * M Leaders and N Participants, formed but not activated. The rules that can be
 * judged from the request alone are judged here; the participation caps cannot be,
 * because they depend on the Ministry's other relationships, and they are refused by
 * the database instead.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const leader = personId('22222222-2222-2222-2222-222222222222')
const emily = personId('33333333-3333-3333-3333-333333333333')
const ada = personId('44444444-4444-4444-4444-444444444444')

const at = new Date('2026-03-02T09:00:00Z')

const context = (): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
  appBaseUrl: 'https://discipler.example',
  // Creating a relationship texts every Leader an Invitation Link, so the names
  // and numbers travel with the request now. Nothing here is a Participant's
  // concern: they are told nothing until a Leader has agreed.
  contacts: {
    people: new Map([
      [leader, { fullName: 'David Ellis', phone: '+15550100' }],
      [emily, { fullName: 'Emily Johnson', phone: '+15550102' }],
      [ada, { fullName: 'Ada Lovelace', phone: '+15550103' }],
    ]),
  },
})

const create = (
  participantIds: ReturnType<typeof personId>[],
  leaderIds: ReturnType<typeof personId>[] = [leader],
) =>
  handleCommand(
    { type: 'relationship.create', ministryId: ministry, leaderIds, participantIds },
    context(),
  )

const relationshipIn = (result: ReturnType<typeof create>) => {
  const effect = result.effects.find((e) => e.kind === 'relationship.create')
  if (effect?.kind !== 'relationship.create') throw new Error('no relationship was created')
  return effect.relationship
}

describe('the kind of a relationship', () => {
  it('is one-to-one for one Leader and one Participant, and a group for anything else', () => {
    expect(kindFor(1, 1)).toBe('one_to_one')
    expect(kindFor(1, 2)).toBe('group')
    expect(kindFor(1, 5)).toBe('group')
  })

  it('is a group when several Leaders share one Participant', () => {
    // Three people meeting is a group whichever side the third stands on. Deriving
    // the kind from the Participant count alone would have called this a one-to-one,
    // and a one-to-one holds exactly one Leader -- so the database would then have
    // refused the very shape the Admin was told to form.
    expect(kindFor(2, 1)).toBe('group')
    expect(relationshipIn(create([emily], [leader, ada])).kind).toBe('group')
  })
})

describe('creating a relationship', () => {
  it('is M Leaders and N Participants, with no separate group', () => {
    const oneToOne = relationshipIn(create([emily]))
    const group = relationshipIn(create([emily, ada]))

    // The same shape either way: the second is a relationship with N=2, not a third
    // kind of thing. Only the capacity declaration differs.
    expect(oneToOne.members.map((m) => m.role)).toEqual(['leader', 'participant'])
    expect(group.members.map((m) => m.role)).toEqual(['leader', 'participant', 'participant'])
    expect(oneToOne.kind).toBe('one_to_one')
    expect(group.kind).toBe('group')
  })

  it('dates every membership, the Leader s included', () => {
    const relationship = relationshipIn(create([emily, ada]))

    expect(relationship.members.every((m) => m.startedAt.getTime() === at.getTime())).toBe(true)
  })

  it('does not activate the relationship, and enqueues nothing to a Participant', () => {
    const result = create([emily])

    // Nothing reaches a Participant before their Leader has agreed to lead them, and
    // the relationship stays Awaiting Leader Acceptance until Acceptance stamps it.
    // The Leader hears now, because being invited is what they are waiting for.
    const enqueued = result.effects.flatMap((e) =>
      e.kind === 'message.enqueue' ? [e.message] : [],
    )
    expect(enqueued.map((m) => m.personId)).toEqual([leader])
    expect(result.effects.map((e) => e.kind)).toEqual([
      'relationship.create',
      'history.append',
      'invitation.issue',
      'message.enqueue',
    ])
  })

  it('records who was paired, as a fact that can be read back', () => {
    const result = create([emily, ada])
    const event = result.effects.find((e) => e.kind === 'history.append')

    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')
    expect(event.event.type).toBe('relationship.created')
    expect(event.event.subjectType).toBe('relationship')
    expect(event.event.payload).toMatchObject({
      leaderIds: [leader],
      participantIds: [emily, ada],
      participantCount: 2,
    })
  })

  it('refuses a relationship with no Leader', () => {
    // The form offers checkboxes and cannot say "at least one of these", so an empty
    // selection reaches the domain rather than being stopped in the browser.
    expect(() => create([emily], [])).toThrow(
      new PairingRefused('relationship.needs_a_leader'),
    )
  })

  it('refuses a relationship with no Participant', () => {
    expect(() => create([])).toThrow(
      new PairingRefused('relationship.needs_a_participant'),
    )
  })

  it('refuses to pair a Leader with themselves', () => {
    expect(() => create([leader])).toThrow(
      new PairingRefused('relationship.leader_cannot_be_a_participant'),
    )
  })

  it('refuses the same Person listed twice', () => {
    expect(() => create([emily, emily])).toThrow(
      new PairingRefused('relationship.person_listed_twice'),
    )
  })

  it('refuses the same Person leading twice', () => {
    expect(() => create([emily], [leader, leader])).toThrow(
      new PairingRefused('relationship.person_listed_twice'),
    )
  })

  it('refuses a Person who is leading and being discipled in the same relationship', () => {
    expect(() => create([emily], [leader, emily])).toThrow(
      new PairingRefused('relationship.leader_cannot_be_a_participant'),
    )
  })

  it('gives several Leaders a leader membership each', () => {
    const group = relationshipIn(create([emily], [leader, ada]))

    expect(group.members.filter((m) => m.role === 'leader').map((m) => m.personId)).toEqual([
      leader,
      ada,
    ])
    // Role lives on the membership, so a second Leader is a second row and nothing
    // about the relationship changes shape to hold them.
    expect(group.members).toHaveLength(3)
  })

  it('is pure: the same request against the same context yields the same effects', () => {
    const command = {
      type: 'relationship.create',
      ministryId: ministry,
      leaderIds: [leader],
      participantIds: [emily],
    } as const

    expect(handleCommand(command, context())).toEqual(handleCommand(command, context()))
  })
})
