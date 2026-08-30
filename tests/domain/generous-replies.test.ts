import { describe, expect, it } from 'vitest'
import { readCheckInReply, type CheckInQuestion, type CheckInReply } from '~/domain/check-in'

/**
 * The whole of `docs/adr/0003-whole-message-reply-matching.md`, as a table.
 *
 * Two properties are being bought here and they pull against each other: a
 * Leader who types `Yes we did!` is understood, and a Leader who types
 * `it wasn't great` is *not* silently recorded as having had an outstanding
 * week. The second is the one the ADR exists for -- a misread negation converts
 * a relationship that needs care into a healthy one and tells nobody -- so every
 * row below that expects `unreadable` is load-bearing, not a gap.
 */

const reads = (question: CheckInQuestion, body: string): CheckInReply =>
  readCheckInReply(question, body)

const met = (value: boolean): CheckInReply => ({ kind: 'met', met: value })

describe('reading a reply to *did you meet*', () => {
  const readable: ReadonlyArray<readonly [string, boolean]> = [
    ['1', true],
    ['yes', true],
    ['Yes', true],
    ['YES', true],
    ['yes!', true],
    ['Yes we did!', true],
    ['we did', true],
    ['y', true],
    ['yeah', true],
    ['yes 👍', true],
    ['  yes  ', true],
    ['ok yes', true],
    ['yes thanks', true],
    ['Hi, yes please', true],
    ['2', false],
    ['no', false],
    ['No.', false],
    ['n', false],
    ['nope', false],
    ['we didn’t', false],
    ["no we didn't", false],
    ['no sorry', false],
  ]

  for (const [body, value] of readable) {
    it(`reads ${JSON.stringify(body)} as a meeting that ${value ? 'happened' : 'did not'}`, () => {
      expect(reads('met', body)).toEqual(met(value))
    })
  }

  /**
   * The four the ADR is written about, and the reason substring matching was
   * rejected. Under it, `no concerns` contains both `no` and `concern`,
   * `we didn't meet` contains `meet`, and `1 and it was great` advances two steps
   * on one message -- recording a rating for a meeting nobody confirmed happened.
   */
  const unreadable = [
    "it wasn't great",
    'no concerns',
    "we didn't meet",
    '1 and it was great',
    'yes and no',
    // Sentiment is never inferred from free text, and an emoji on its own is
    // free text with the words taken out. It strips to nothing and stays
    // nothing, rather than being read as the yes it probably means.
    '👍',
    '',
    '   ',
    // A token belonging to a different question. `A` answers *how did it go*,
    // and reading it here would record a rating against the wrong question.
    'A',
    'great',
    // Almost a token. The enumerated list is extended from typos that actually
    // happened, never from ones a regex could reach.
    'yess',
    'yes we didn’t',
  ]

  for (const body of unreadable) {
    it(`refuses ${JSON.stringify(body)}`, () => {
      expect(reads('met', body)).toEqual({ kind: 'unreadable' })
    })
  }
})

describe('reading a reply to *how did it go*', () => {
  const readable: ReadonlyArray<readonly [string, string]> = [
    ['A', 'outstanding'],
    ['a', 'outstanding'],
    ['great', 'outstanding'],
    ['Great!', 'outstanding'],
    // A typo that actually happened. This is the whole reason the list is
    // enumerated rather than computed: `gret` is one edit from `great` and also
    // one edit from `greet`, and only a human knows which one a Leader meant.
    ['gret', 'outstanding'],
    ['B', 'good'],
    ['good', 'good'],
    ['good thanks', 'good'],
    ['C', 'concern'],
    ['concern', 'concern'],
    ['oncern', 'concern'],
  ]

  for (const [body, satisfaction] of readable) {
    it(`reads ${JSON.stringify(body)} as ${satisfaction}`, () => {
      expect(reads('satisfaction', body)).toEqual({ kind: 'satisfaction', satisfaction })
    })
  }

  it('refuses a reply carrying two answers', () => {
    expect(reads('satisfaction', 'B or C')).toEqual({ kind: 'unreadable' })
  })

  it('refuses a negation of a token rather than reading the token inside it', () => {
    for (const body of ["it wasn't great", 'not good', 'no concerns']) {
      expect(reads('satisfaction', body)).toEqual({ kind: 'unreadable' })
    }
  })

  it('refuses the meeting question’s tokens', () => {
    expect(reads('satisfaction', '1')).toEqual({ kind: 'unreadable' })
    expect(reads('satisfaction', 'yes')).toEqual({ kind: 'unreadable' })
  })
})

describe('reading a reply to *tell us more about the concern*', () => {
  it('takes anything at all, because prose is the point', () => {
    for (const body of ["it wasn't great", 'no', 'A', "he's lost his job 😔"]) {
      expect(reads('concern_detail', body)).toEqual({ kind: 'concern_detail', detail: body })
    }
  })

  it('keeps the Leader’s own words exactly, punctuation and all', () => {
    expect(reads('concern_detail', '  He has lost his job.  ')).toEqual({
      kind: 'concern_detail',
      detail: 'He has lost his job.',
    })
  })

  it('has nothing to record when nothing was said', () => {
    expect(reads('concern_detail', '   ')).toEqual({ kind: 'unreadable' })
  })
})

/**
 * The property the closed strippable list rests on. A fragment that carries
 * polarity of its own cannot be a wrapper -- stripping it changes what was said
 * -- so the list holds only pleasantries, and every phrase that means yes or no
 * is a token instead.
 */
describe('the closed list of strippable pleasantries', () => {
  it('never strips a phrase into the opposite of what was said', () => {
    // Were `we did` strippable rather than a token, this would read as *no*
    // while the Leader said they met.
    expect(reads('met', 'no we did')).toEqual({ kind: 'unreadable' })
    expect(reads('met', "yes we didn't")).toEqual({ kind: 'unreadable' })
  })

  it('leaves a message that is nothing but a pleasantry unreadable', () => {
    for (const body of ['thanks', 'hi', 'ok', 'sorry']) {
      expect(reads('met', body)).toEqual({ kind: 'unreadable' })
    }
  })
})
