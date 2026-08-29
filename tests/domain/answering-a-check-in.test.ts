import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import {
  checkInPromptId,
  checkInSequenceId,
  type CheckInQuestion,
  type CheckInRelationship,
  type CheckInSnapshot,
  type OpenSequence,
} from '~/domain/check-in'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'

/**
 * The question ladder, one relationship at a time. `did you meet` first, `how did
 * it go` only on a yes, and `what was the Concern` only on a concern -- so a
 * Leader who did not meet spends one reply on that week and is never asked to
 * rate a meeting that did not happen.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const james = personId('00000000-0000-4000-8000-0000000000d0')
const sequence = checkInSequenceId('00000000-0000-4000-8000-0000000000f0')
const prompt = checkInPromptId('00000000-0000-4000-8000-0000000000f1')

const march = new Date('2026-03-02T09:00:00Z')
const june = new Date('2026-06-01T09:00:00Z')
const repliedAt = new Date('2026-10-05T09:30:00Z')

const emily = relationshipId('00000000-0000-4000-8000-0000000000b1')
const theGroup = relationshipId('00000000-0000-4000-8000-0000000000b2')

const covers = (
  id: typeof emily,
  startedAt: Date,
  participantNames: readonly string[],
): CheckInRelationship => ({
  relationshipId: id,
  role: 'leader',
  startedAt,
  participantNames,
  acceptedAt: startedAt,
  paused: false,
})

const emilysTurn = covers(emily, march, ['Emily'])
const theGroupsTurn = covers(theGroup, june, ['Marcus', 'Dan'])

const open = (question: CheckInQuestion, position = 1, covering = [emilysTurn, theGroupsTurn]): OpenSequence => ({
  sequenceId: sequence,
  startedAt: new Date('2026-10-05T09:00:00Z'),
  covering,
  awaiting: {
    promptId: prompt,
    relationshipId: covering[position - 1]!.relationshipId,
    position,
    question,
  },
})

const reply = (body: string, openSequence: OpenSequence) =>
  handleCommand({ type: 'sms.inbound', ministryId: ministry, personId: james, body }, {
    ministryId: ministry,
    clock: createTestClock(repliedAt),
    ids: createSequentialIds(),
    ministryName: 'ABC Church',
    appBaseUrl: 'https://discipler.example',
    checkIn: {
      personId: james,
      phone: '+15550100001',
      leads: [emilysTurn, theGroupsTurn],
      openSequence,
      lastCheckInAt: new Date('2026-10-05T09:00:00Z'),
    } satisfies CheckInSnapshot,
  } satisfies CommandContext)

const bodies = (effects: readonly Effect[]): string[] =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message.body] : []))

const answers = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'checkin.answer' ? [effect.answer] : []))

const asked = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'checkin.ask' ? [effect.prompt] : []))

describe('answering the meeting question', () => {
  it('follows a yes with the satisfaction question', () => {
    expect(bodies(reply('1', open('met')).effects)).toEqual([
      'ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern.',
    ])
  })

  it('ends that relationship’s turn on a no and moves straight on', () => {
    // A missed week costs one reply. Nothing here frames it as a failure and
    // nothing asks how a meeting that did not happen went.
    expect(bodies(reply('2', open('met')).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('binds the answer to the relationship it was asked about and the Person who sent it', () => {
    expect(answers(reply('1', open('met')).effects)).toEqual([
      {
        ministryId: ministry,
        promptId: prompt,
        personId: james,
        answeredAt: repliedAt,
        met: true,
        satisfaction: null,
        detail: null,
      },
    ])
  })

  it('carries the relationship and the role onto the question it asks next', () => {
    expect(asked(reply('1', open('met')).effects)[0]).toMatchObject({
      relationshipId: emily,
      role: 'leader',
      question: 'satisfaction',
      position: 1,
    })
  })
})

describe('answering the satisfaction question', () => {
  it('stores A as outstanding, B as good and C as concern', () => {
    const stored = (token: string) =>
      answers(reply(token, open('satisfaction')).effects)[0]?.satisfaction
    expect(stored('A')).toBe('outstanding')
    expect(stored('B')).toBe('good')
    expect(stored('C')).toBe('concern')
  })

  it('asks what the Concern was, and only after a concern', () => {
    expect(bodies(reply('C', open('satisfaction')).effects)).toEqual([
      'ABC Church: Please tell us more about the concern.',
    ])
    expect(bodies(reply('B', open('satisfaction')).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })
})

describe('answering the Concern detail request', () => {
  it('records the Leader’s own words and moves on', () => {
    const { effects } = reply('He has lost his job.', open('concern_detail'))
    expect(answers(effects)[0]?.detail).toBe('He has lost his job.')
    expect(bodies(effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })
})

describe('finishing the conversation', () => {
  it('sends the thank-you only after the final relationship', () => {
    // Second of two. Where a thank-you would have fallen after Emily's turn, the
    // group's opening question went instead.
    expect(bodies(reply('2', open('met', 2)).effects)).toEqual([
      'ABC Church: Thank you. We’ll check in with you next week.',
    ])
  })

  it('closes the sequence when it is finished', () => {
    const closures = reply('2', open('met', 2)).effects.flatMap((effect) =>
      effect.kind === 'checkin.close' ? [effect.closure] : [],
    )
    expect(closures).toEqual([
      { ministryId: ministry, sequenceId: sequence, closedAt: repliedAt, outcome: 'completed' },
    ])
  })

  it('sends no thank-you while relationships remain', () => {
    expect(bodies(reply('2', open('met', 1)).effects)).not.toContain(
      'ABC Church: Thank you. We’ll check in with you next week.',
    )
  })
})

describe('a reply that cannot be read', () => {
  it('advances nothing, so the question stays open for a valid reply', () => {
    // Strict tokens in this ticket. Clarifying re-prompts and generous matching
    // are ticket 09's; until then an unreadable reply leaves the conversation
    // exactly where it was rather than guessing at what was meant.
    expect(reply('yes we did!', open('met')).effects).toEqual([])
  })
})

describe('a reply with no conversation open', () => {
  it('changes nothing', () => {
    const { effects } = handleCommand(
      { type: 'sms.inbound', ministryId: ministry, personId: james, body: '1' },
      {
        ministryId: ministry,
        clock: createTestClock(repliedAt),
        ids: createSequentialIds(),
        ministryName: 'ABC Church',
        appBaseUrl: 'https://discipler.example',
        checkIn: {
          personId: james,
          phone: '+15550100001',
          leads: [emilysTurn],
          openSequence: null,
          lastCheckInAt: null,
        },
      } satisfies CommandContext,
    )
    expect(effects).toEqual([])
  })
})
