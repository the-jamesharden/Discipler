import { describe, expect, it } from 'vitest'
import { readCheckInReply } from '~/domain/check-in'

/**
 * The tokens a check-in answer is read from, as the message advertises them:
 * `1`, `2`, `A`, `B`, `C`. The synonyms, the known typos, the case folding and
 * the closed strippable list live in `generous-replies.test.ts` alongside the
 * negations they must never be read backwards as.
 */

describe('reading a check-in reply', () => {
  it('reads 1 as a meeting that happened and 2 as one that did not', () => {
    expect(readCheckInReply('met', '1')).toEqual({ kind: 'met', met: true })
    expect(readCheckInReply('met', '2')).toEqual({ kind: 'met', met: false })
  })

  it('stores A as outstanding, B as good and C as concern', () => {
    expect(readCheckInReply('satisfaction', 'A')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'outstanding',
    })
    expect(readCheckInReply('satisfaction', 'B')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'good',
    })
    expect(readCheckInReply('satisfaction', 'C')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'concern',
    })
  })

  it('refuses a token belonging to a different question', () => {
    expect(readCheckInReply('met', 'A')).toEqual({ kind: 'unreadable' })
    expect(readCheckInReply('satisfaction', '1')).toEqual({ kind: 'unreadable' })
  })

  it('takes anything at all as Concern detail, because prose is the point', () => {
    expect(readCheckInReply('concern_detail', 'He has lost his job.')).toEqual({
      kind: 'concern_detail',
      detail: 'He has lost his job.',
    })
  })

  it('reads the words a Leader is as likely to type as the tokens', () => {
    expect(readCheckInReply('met', 'yes')).toEqual({ kind: 'met', met: true })
    expect(readCheckInReply('satisfaction', 'gret')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'outstanding',
    })
  })
})
