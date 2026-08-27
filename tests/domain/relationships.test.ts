import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId } from '~/domain/ids'
import { kindForParticipantCount } from '~/domain/relationships'

/**
 * One Leader and N Participants, formed but not activated. The rules that can be
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
})

const create = (participantIds: ReturnType<typeof personId>[]) =>
  handleCommand(
    { type: 'relationship.create', ministryId: ministry, leaderId: leader, participantIds },
    context(),
  )

const relationshipIn = (result: ReturnType<typeof create>) => {
  const effect = result.effects.find((e) => e.kind === 'relationship.create')
  if (effect?.kind !== 'relationship.create') throw new Error('no relationship was created')
  return effect.relationship
}

describe('the kind of a relationship', () => {
  it('is one-to-one for a single Participant and a group for more', () => {
    expect(kindForParticipantCount(1)).toBe('one_to_one')
    expect(kindForParticipantCount(2)).toBe('group')
    expect(kindForParticipantCount(5)).toBe('group')
  })
})

describe('creating a relationship', () => {
  it('is one Leader and N Participants, with no separate group', () => {
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

  it('does not activate the relationship, and enqueues nothing to anyone', () => {
    const result = create([emily])

    // Nothing reaches a Participant before their Leader has agreed to lead them, and
    // the relationship stays Awaiting Leader Acceptance until Acceptance stamps it.
    expect(result.effects.filter((e) => e.kind === 'message.enqueue')).toEqual([])
    expect(result.effects.map((e) => e.kind)).toEqual([
      'relationship.create',
      'history.append',
    ])
  })

  it('records who was paired, as a fact that can be read back', () => {
    const result = create([emily, ada])
    const event = result.effects.find((e) => e.kind === 'history.append')

    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')
    expect(event.event.type).toBe('relationship.created')
    expect(event.event.subjectType).toBe('relationship')
    expect(event.event.payload).toMatchObject({
      leaderId: leader,
      participantIds: [emily, ada],
      participantCount: 2,
    })
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

  it('is pure: the same request against the same context yields the same effects', () => {
    const command = {
      type: 'relationship.create',
      ministryId: ministry,
      leaderId: leader,
      participantIds: [emily],
    } as const

    expect(handleCommand(command, context())).toEqual(handleCommand(command, context()))
  })
})
