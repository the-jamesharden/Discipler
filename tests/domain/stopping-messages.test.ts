import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { checkInPromptId, checkInSequenceId, type OpenSequence } from '~/domain/check-in'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'

/**
 * `STOP` is the carrier opt-out, and it is the Person's rather than any one
 * relationship's -- a carrier stops messaging a number, and Discipler records
 * that at the level it was meant. Keywords are read before a reply is
 * interpreted as a check-in answer, so a `STOP` arriving mid-conversation is a
 * keyword and never a satisfaction rating.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const james = personId('00000000-0000-4000-8000-0000000000d0')
const emily = relationshipId('00000000-0000-4000-8000-0000000000b1')
const at = new Date('2026-10-05T09:30:00Z')

const openSequence: OpenSequence = {
  sequenceId: checkInSequenceId('00000000-0000-4000-8000-0000000000f0'),
  startedAt: new Date('2026-10-05T09:00:00Z'),
  covering: [
    {
      relationshipId: emily,
      role: 'leader',
      startedAt: new Date('2026-03-02T09:00:00Z'),
      participantNames: ['Emily'],
      acceptedAt: new Date('2026-03-02T09:00:00Z'),
      paused: false,
    },
  ],
  awaiting: {
    promptId: checkInPromptId('00000000-0000-4000-8000-0000000000f1'),
    relationshipId: emily,
    position: 1,
    question: 'met',
  },
}

const send = (body: string, sequence: OpenSequence | null = openSequence) =>
  handleCommand({ type: 'sms.inbound', ministryId: ministry, personId: james, body }, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'ABC Church',
    appBaseUrl: 'https://discipler.example',
    checkIn: {
      personId: james,
      phone: '+15550100001',
      leads: sequence?.covering ?? [],
      openSequence: sequence,
      lastAskedAt: new Date('2026-10-05T09:00:00Z'),
    },
  } satisfies CommandContext)

const optOuts = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'person.opt_out' ? [effect.optOut] : []))

describe('STOP', () => {
  it('opts the Person out, not one of their relationships', () => {
    expect(optOuts(send('STOP').effects)).toEqual([
      { ministryId: ministry, personId: james, startedAt: at },
    ])
  })

  it('is read as a keyword even while a question is awaiting a reply', () => {
    const { effects } = send('STOP')
    expect(effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
  })

  it('is read from a Person with no conversation open at all', () => {
    expect(optOuts(send('STOP', null).effects)).toHaveLength(1)
  })

  it('is recognised however the Leader capitalised it', () => {
    expect(optOuts(send('stop').effects)).toHaveLength(1)
    expect(optOuts(send(' Stop ').effects)).toHaveLength(1)
  })

  it('is a bare keyword and never a word inside a sentence', () => {
    // Whole-message matching. Prose mentioning the word is prose, and reading it
    // as an opt-out would stop a Ministry texting someone who asked for nothing.
    expect(optOuts(send('please stop asking me this').effects)).toEqual([])
  })
})
