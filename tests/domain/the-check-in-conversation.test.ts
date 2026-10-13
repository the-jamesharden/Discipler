import { describe, expect, it } from 'vitest'
import {
  readCheckInReply,
  type CheckInQuestion,
  type CheckInReply,
  type CheckInWording,
} from '~/domain/check-in'

/**
 * The tokens a check-in answer is read from, as the message advertises them:
 * `1`, `2`, `A`, `B`, `C`, `D`. The synonyms, the known typos, the case folding
 * and the closed strippable list live in `generous-replies.test.ts` alongside the
 * negations they must never be read backwards as.
 */

const reads = (
  question: CheckInQuestion,
  body: string,
  wording: CheckInWording = 'a_to_d',
): CheckInReply => readCheckInReply({ question, wording }, body)

describe('reading a check-in reply', () => {
  it('reads 1 as a meeting that happened and 2 as one that did not', () => {
    expect(reads('met', '1')).toEqual({ kind: 'met', met: true })
    expect(reads('met', '2')).toEqual({ kind: 'met', met: false })
  })

  it('stores A as outstanding, B as good, C as okay and D as concern', () => {
    expect(reads('satisfaction', 'A')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'outstanding',
    })
    expect(reads('satisfaction', 'B')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'good',
    })
    expect(reads('satisfaction', 'C')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'okay',
    })
    expect(reads('satisfaction', 'D')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'concern',
    })
  })

  /**
   * A reply is read against the wording its question was sent with. A Leader
   * sent the three-answer question before the change who answers `C` after it
   * meant concern.
   */
  it('reads a three-answer question’s C as the concern it offered', () => {
    expect(reads('satisfaction', 'A', 'a_to_c')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'outstanding',
    })
    expect(reads('satisfaction', 'B', 'a_to_c')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'good',
    })
    expect(reads('satisfaction', 'C', 'a_to_c')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'concern',
    })
  })

  it('refuses an answer the question it replies to never offered', () => {
    // `D` and `okay` were not answers to the three-answer question, and reading
    // either would be a guess at which of its three the Leader meant.
    expect(reads('satisfaction', 'D', 'a_to_c')).toEqual({ kind: 'unreadable' })
    expect(reads('satisfaction', 'okay', 'a_to_c')).toEqual({ kind: 'unreadable' })
  })

  it('reads the meeting question the same under either wording', () => {
    for (const wording of ['a_to_c', 'a_to_d'] as const) {
      expect(reads('met', '1', wording)).toEqual({ kind: 'met', met: true })
      expect(reads('met', '2', wording)).toEqual({ kind: 'met', met: false })
    }
  })

  it('refuses a token belonging to a different question', () => {
    expect(reads('met', 'A')).toEqual({ kind: 'unreadable' })
    expect(reads('satisfaction', '1')).toEqual({ kind: 'unreadable' })
  })

  it('takes anything at all as Concern detail, because prose is the point', () => {
    expect(reads('concern_detail', 'He has lost his job.')).toEqual({
      kind: 'concern_detail',
      detail: 'He has lost his job.',
    })
  })

  it('reads the words a Leader is as likely to type as the tokens', () => {
    expect(reads('met', 'yes')).toEqual({ kind: 'met', met: true })
    expect(reads('satisfaction', 'gret')).toEqual({
      kind: 'satisfaction',
      satisfaction: 'outstanding',
    })
  })
})
