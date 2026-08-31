import { describe, expect, it } from 'vitest'
import {
  opensAnOutstandingReply,
  outstandingReplyCutoffs,
  SCHEDULED_QUESTION_TIMES_OUT_AFTER_HOURS,
  waitsForAnOpenReply,
  type OutboundMessageKind,
} from '~/domain/outstanding-reply'

describe('Which messages a phone number holds a conversation for', () => {
  it('takes the number for a message that expects a reply, and for nothing else', () => {
    expect(opensAnOutstandingReply('scheduled_question')).toBe(true)
    expect(opensAnOutstandingReply('keyword_question')).toBe(true)

    // The case the rule was settled against: a Starter Message that took the
    // number would block its own relationship's first check-in.
    expect(opensAnOutstandingReply('no_reply')).toBe(false)
  })

  it('waits only for a scheduled question, so a keyword command is never held behind one', () => {
    expect(waitsForAnOpenReply('scheduled_question')).toBe(true)

    // A Leader who texts PAUSE gets the menu now, not after answering the check-in
    // they are trying to pause.
    expect(waitsForAnOpenReply('keyword_question')).toBe(false)

    // And a next-day reminder re-sends the question that holds the number. Held
    // behind it, only the timeout that makes it pointless could ever release it.
    expect(waitsForAnOpenReply('no_reply')).toBe(false)
  })

  it('never both takes the number and refuses to wait for anything else', () => {
    const kinds: readonly OutboundMessageKind[] = [
      'scheduled_question',
      'keyword_question',
      'no_reply',
    ]
    // Every kind that waits must also be one that takes the number: a message
    // nobody answers has no conversation to be waiting its turn in.
    for (const kind of kinds) {
      if (waitsForAnOpenReply(kind)) expect(opensAnOutstandingReply(kind)).toBe(true)
    }
  })
})

describe('When an outstanding reply stops being worth waiting for', () => {
  const now = new Date('2026-03-04T09:00:00Z')

  it('gives a scheduled question forty-eight hours -- the reminder, then one more day', () => {
    expect(SCHEDULED_QUESTION_TIMES_OUT_AFTER_HOURS).toBe(48)

    expect(outstandingReplyCutoffs(now)).toContainEqual({
      kind: 'scheduled_question',
      openedNoLaterThan: new Date('2026-03-02T09:00:00Z'),
    })
  })

  it('gives a Keyword Exchange twenty-four hours, the same span it expires in', () => {
    expect(outstandingReplyCutoffs(now)).toContainEqual({
      kind: 'keyword_question',
      openedNoLaterThan: new Date('2026-03-03T09:00:00Z'),
    })
  })

  it('has a window for every kind that can be open, and for no other', () => {
    // A `no_reply` message is never open, so no clock could run out on it, and its
    // absence here is the type saying so rather than an omission. A fourth kind
    // added with no window would be a conversation nothing could ever close.
    const swept = outstandingReplyCutoffs(now).map((cutoff) => cutoff.kind)
    const everyKind: readonly OutboundMessageKind[] = [
      'scheduled_question',
      'keyword_question',
      'no_reply',
    ]

    expect([...swept].sort()).toEqual([...everyKind.filter(opensAnOutstandingReply)].sort())
  })
})
