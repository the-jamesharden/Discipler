import { describe, expect, it } from 'vitest'
import { FOLLOW_UP_KINDS, type FollowUpPayload } from '~/domain/follow-up'
import { intendedPairingId } from '~/domain/ids'
import {
  careOutcomeMessage,
  careRefusalMessage,
  concernLine,
  declinedTitle,
  followUpLine,
  followUpTag,
  READS_AS_A_CONCERN,
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
    case 'intended_pairing_refused':
      return { kind, intendedPairingId: intendedPairingId('plan-1'), refusal: 'relationship.gender_must_match' }
    default:
      return { kind }
  }
}

// Manual pairing, recut ticket 06; every word of it decided by James on 2026-09-21.
describe('what Care Needed says of an invitation that was withdrawn', () => {
  const group = { leadsAGroup: true, running: true, ledByNobody: false }
  const oneToOne = { leadsAGroup: false, running: false, ledByNobody: true }

  it('says the two weeks in James’s sentence, with Group leader before the name', () => {
    expect(followUpLine({ kind: 'invitation_expired' }, 'Claire Martinez', null, null, group)).toBe(
      'Group leader Claire Martinez has not responded in two weeks, their invite has expired.',
    )
    expect(followUpTag.invitation_expired).toBe('Invitation expired')
  })

  it('says Discipler for a one-to-one, which has no group', () => {
    expect(
      followUpLine({ kind: 'invitation_expired' }, 'Claire Martinez', null, null, oneToOne),
    ).toBe('Discipler Claire Martinez has not responded in two weeks, their invite has expired.')
    expect(declinedTitle('Claire Martinez', false)).toBe('Discipler Claire Martinez Declined')
  })

  it('titles a decline Group leader [name] Declined', () => {
    expect(declinedTitle('Claire Martinez', true)).toBe('Group leader Claire Martinez Declined')
  })

  it('says a running group carries on, and says so of nothing that is not running', () => {
    expect(followUpLine({ kind: 'match_declined' }, 'Claire Martinez', null, null, group)).toBe(
      'Invited to help lead this group. The invitation has been withdrawn, and the group carries on.',
    )
    expect(
      followUpLine({ kind: 'match_declined' }, 'Claire Martinez', null, null, {
        ...group,
        running: false,
      }),
    ).toBe('Invited to lead this group. The invitation has been withdrawn.')
  })

  it('says so where declining left it with nobody to lead it', () => {
    expect(followUpLine({ kind: 'match_declined' }, 'Claire Martinez', null, null, oneToOne)).toBe(
      'Invited to lead this pairing. The invitation has been withdrawn, and nobody leads it now.',
    )
  })

  it('draws those two red, and nothing else a Follow-Up Item can say', () => {
    expect([...READS_AS_A_CONCERN].sort()).toEqual(['invitation_expired', 'match_declined'])
  })

  it('says nobody leads a relationship left waiting with no Leader, and still offers no name', () => {
    const line = followUpLine({ kind: 'relationship_unaccepted' }, null, 15, {
      names: [],
      running: false,
    })
    expect(line).toContain('Nobody leads this relationship')
    expect(line).toContain('15 days')
    expect(line).not.toContain('The leader')
  })
})

describe('what Care Needed says of an invitation nobody has answered', () => {
  const unanswered: FollowUpPayload = { kind: 'relationship_unaccepted' }

  it('names who has not answered, where it knows', () => {
    expect(followUpLine(unanswered, null, 6, { names: ['Grace Lee'], running: false })).toBe(
      'Grace Lee has not accepted this relationship; it has waited 6 days. Everyone in it is held out of the suggestion pool until it is accepted or cancelled.',
    )
  })

  it('says a running group carries on, and offers no count it cannot make', () => {
    // Manual pairing, recut ticket 01: a Discipler added to a group already
    // running. Nothing is held anywhere, and there is nothing to cancel.
    expect(followUpLine(unanswered, null, null, { names: ['Claire Martinez'], running: true })).toBe(
      'Claire Martinez was invited to help lead this group and has not answered. The group carries on meanwhile.',
    )
    expect(
      followUpLine(unanswered, null, null, { names: ['Claire Martinez', 'Tom Reyes'], running: true }),
    ).toBe(
      'Claire Martinez and Tom Reyes were invited to help lead this group and have not answered. The group carries on meanwhile.',
    )
  })

  it('still reads where it knows nobody’s name', () => {
    expect(followUpLine(unanswered, null, 5)).toContain('The leader has not accepted this relationship')
  })
})

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
    // kind is raised by or about a Person, and the sentence says who. A Leader who
    // declined is named in the item's title, which is James's, and not again
    // under it.
    for (const kind of FOLLOW_UP_KINDS.filter(
      (each) => each !== 'pause_expired' && each !== 'match_declined',
    )) {
      expect(followUpLine(payloadOf(kind), 'Emily Johnson', 5), kind).toContain('Emily Johnson')
    }
    expect(declinedTitle('Emily Johnson', true)).toContain('Emily Johnson')
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
