import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext, type RelationshipSnapshot } from '~/domain/boundary'
import { createTestClock, days } from '~/domain/clock'
import { CancellationRefused } from '~/domain/errors'
import {
  createSequentialIds,
  followUpItemId,
  ministryId,
  personId,
  relationshipId,
} from '~/domain/ids'

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const emily = personId('00000000-0000-4000-8000-0000000000e1')

const createdAt = new Date('2026-03-02T09:00:00Z')
const now = new Date(createdAt.getTime() + days(6))

const snapshot = (over: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
  relationshipId: relationship,
  createdAt,
  acceptedAt: null,
  endedAt: null,
  memberIds: [david, emily],
  ...over,
})

const context = (over: Partial<CommandContext> = {}): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(now),
  ids: createSequentialIds(),
  ...over,
})

const cancel = (relationshipSnapshot = snapshot()) =>
  handleCommand(
    { type: 'relationship.cancel', ministryId: ministry, relationshipId: relationship },
    context({ relationship: relationshipSnapshot }),
  )

describe('cancelling a relationship nobody accepted', () => {
  it('returns everyone in it to the suggestion pool', () => {
    const [effect] = cancel().effects
    if (effect?.kind !== 'relationship.cancel') throw new Error('nothing was cancelled')

    // Closing every open membership is the whole of it: `participation_status`
    // reads open participant memberships, so a Person with none is Ready to Pair.
    expect(effect.cancellation.memberIds).toEqual([david, emily])
    expect(effect.cancellation.cancelledAt).toEqual(now)
  })

  it('records what happened, and how long it had waited', () => {
    const [, event] = cancel().effects
    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')

    expect(event.event.type).toBe('relationship.cancelled')
    expect(event.event.subjectId).toBe(relationship)
    expect(event.event.payload).toEqual({ memberIds: [david, emily], waitedDays: 6 })
  })

  it('tells nobody', () => {
    // A Leader who never answered is not chased about a decision that has been
    // reversed, and no Participant has heard anything at all -- nothing reaches
    // them until every Leader has agreed.
    expect(cancel().effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
  })

  it('refuses a relationship every Leader has already accepted', () => {
    // Stopping one that has started is an *ending*, carries a required outcome,
    // and is a different command.
    expect(() => cancel(snapshot({ acceptedAt: createdAt }))).toThrow(CancellationRefused)
  })

  it('refuses one that has already ended', () => {
    expect(() => cancel(snapshot({ endedAt: createdAt }))).toThrow(
      expect.objectContaining({ refusal: 'relationship.already_ended' }),
    )
  })

  it('does not resolve the follow-up item it was raised by', () => {
    // The item is closed by an Admin resolving it, deliberately and as its own
    // recorded act. Cancelling is one of the things they might do first.
    expect(cancel().effects.filter((effect) => effect.kind === 'followUp.resolve')).toEqual([])
  })
})

describe('resolving a follow-up item', () => {
  const item = followUpItemId('00000000-0000-4000-8000-0000000000f1')

  const resolve = () =>
    handleCommand(
      {
        type: 'follow_up.resolve',
        ministryId: ministry,
        itemId: item,
        resolvedBy: 'admin-user-1',
      },
      context(),
    )

  it('records the acting Admin and the time', () => {
    const [effect] = resolve().effects
    if (effect?.kind !== 'followUp.resolve') throw new Error('nothing was resolved')

    expect(effect.resolution).toEqual({
      ministryId: ministry,
      itemId: item,
      resolvedBy: 'admin-user-1',
      resolvedAt: now,
    })
    // No note. Resolving is one click, and what the Admin actually did is
    // recorded as a fact of its own rather than retyped here.
    expect(Object.keys(effect.resolution)).not.toContain('note')
  })

  it('appends a history event', () => {
    const [, event] = resolve().effects
    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')

    expect(event.event.type).toBe('follow_up.resolved')
    expect(event.event.subjectType).toBe('follow_up_item')
    expect(event.event.subjectId).toBe(item)
  })
})
