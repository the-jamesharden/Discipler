import { describe, expect, it } from 'vitest'
import { FOLLOW_UP_KINDS, type FollowUpPayload } from '~/domain/follow-up'
import {
  careOutcomeMessage,
  careRefusalMessage,
  concernLine,
  followUpLine,
  followUpTag,
  stalledLine,
} from '../../app/follow-up/copy'
import { shortFollowUp, shortReason } from '../../app/overview/copy'

/**
 * Care Needed's wording. The reader deals in seven kinds, two reasons and a
 * count; every one of them has to reach an Admin as a sentence they can act on,
 * and a kind added to the domain and left unworded must fail here rather than
 * render as a blank card.
 */

const payloadOf = (kind: FollowUpPayload['kind']): FollowUpPayload => {
  switch (kind) {
    case 'pause_expired':
      return { kind, periodWeeks: 2 }
    case 'swap_requested':
      return { kind, requestedBy: 'leader' }
    case 'participant_keyword':
      return { kind, keyword: 'HELP' }
    default:
      return { kind }
  }
}

describe('what Care Needed says', () => {
  it('has a tag, a sentence and a short form for every Follow-Up kind', () => {
    for (const kind of FOLLOW_UP_KINDS) {
      expect(followUpTag[kind], kind).toBeTruthy()
      expect(followUpLine(payloadOf(kind), 'Emily Johnson', 5), kind).toBeTruthy()
      expect(shortFollowUp[kind](5), kind).toBeTruthy()
    }
  })

  it('names the Person on every kind that is about one', () => {
    // A pause running out is about the relationship and names nobody; every other
    // kind is raised by or about a Person, and the sentence says who.
    for (const kind of FOLLOW_UP_KINDS.filter((each) => each !== 'pause_expired')) {
      expect(followUpLine(payloadOf(kind), 'Emily Johnson', 5), kind).toContain('Emily Johnson')
    }
  })

  it('says how long an unaccepted relationship has waited, as of now', () => {
    expect(followUpLine({ kind: 'relationship_unaccepted' }, 'David Ellis', 20)).toContain('20 days')
    expect(followUpLine({ kind: 'relationship_unaccepted' }, 'David Ellis', 1)).toContain('1 day')
    expect(shortFollowUp.relationship_unaccepted(20)).toBe('Unaccepted · 20d')
  })

  it('tells the two Stalled conditions apart, with their own units', () => {
    expect(stalledLine({ kind: 'gone_silent', days: 23 })).toContain('23 days')
    expect(stalledLine({ kind: 'not_meeting', weeks: 3 })).toContain('3 weeks')
    expect(shortReason({ kind: 'gone_silent', days: 23 })).toBe('Silent · 23d')
    expect(shortReason({ kind: 'not_meeting', weeks: 3 })).toBe('Not meeting · 3 wks')
  })

  it('counts Concerns without ever carrying their words', () => {
    expect(concernLine(1)).toBe('A concern was raised and has not been resolved.')
    expect(concernLine(3)).toContain('3 concerns')
  })

  it('words every refusal the five actions can raise, and reflects no code back', () => {
    for (const code of [
      'follow_up.already_resolved',
      'concern.not_found',
      'relationship.already_accepted',
      'ending.reason_is_required',
      'pause.not_paused',
    ]) {
      const said = careRefusalMessage(code)
      expect(said, code).toBeTruthy()
      expect(said, code).not.toContain(code)
    }
    expect(careRefusalMessage(undefined)).toBeNull()
    expect(careRefusalMessage('__proto__')).toBe('That could not be done.')
  })

  it('says what each action did, and nothing for a code it does not know', () => {
    expect(careOutcomeMessage('resolved')).toBeTruthy()
    expect(careOutcomeMessage('ended')).toContain('Ready to Pair')
    expect(careOutcomeMessage('resumed')).toContain('never sets Healthy')
    expect(careOutcomeMessage('constructor')).toBeNull()
  })
})
