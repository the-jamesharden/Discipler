import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { declaredByAOneToOne, greyedAgainst, greyedForADisciple } from '../../app/roster/greying'

/**
 * Who is greyed in the Pair popup, and why (Manual pairing, ticket 23). The rule
 * takes the declaration a shape implies and a candidate, and answers greyed with a
 * reason or open. Pure, so it is driven here with no database anywhere near it.
 */

let counter = 0
const person = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  personId: personId(`person-${++counter}`),
  fullName: `Person ${counter}`,
  participationStatus: 'ready_to_pair',
  relationships: [],
  declaredSide: null,
  firstTime: null,
  holdsAnAccount: false,
  phone: null,
  email: null,
  gender: null,
  intendedPairings: [],
  ...over,
})

const pairing = (
  role: RosterRelationship['role'],
  over: Partial<RosterRelationship> = {},
): RosterRelationship => ({
  relationshipId: relationshipId(`relationship-${++counter}`),
  role,
  withNames: [],
  leaderNames: [],
  participantNames: [],
  participantCount: 1,
  awaitingAcceptance: false,
  ...over,
})

describe('a candidate against a declaration', () => {
  it('is greyed for gender when the declaration is a gender they are not', () => {
    expect(greyedAgainst('female', person({ gender: 'male' }))).toEqual({
      why: 'gender',
      declared: 'female',
    })
  })

  it('is open when they are of the declared gender', () => {
    expect(greyedAgainst('female', person({ gender: 'female' }))).toBeNull()
  })

  it('is never greyed with no gender on file, whatever is declared', () => {
    expect(greyedAgainst('female', person({ gender: null }))).toBeNull()
    expect(greyedAgainst('male', person({ gender: null }))).toBeNull()
  })

  it('is open for gender where the declaration is mixed or nothing was asked', () => {
    expect(greyedAgainst('mixed', person({ gender: 'male' }))).toBeNull()
    expect(greyedAgainst('none', person({ gender: 'male' }))).toBeNull()
  })

  it('is greyed for not having completed Intake, and for having opted out, whatever is declared', () => {
    expect(greyedAgainst('none', person({ participationStatus: 'no_intake_submitted' }))).toEqual({
      why: 'not_pairable',
      reason: 'awaiting_intake',
    })
    expect(greyedAgainst('mixed', person({ participationStatus: 'opted_out' }))).toEqual({
      why: 'not_pairable',
      reason: 'opted_out',
    })
  })

  it('says why they cannot be paired in place of a gender reason where both hold', () => {
    const candidate = person({ gender: 'male', participationStatus: 'opted_out' })
    expect(greyedAgainst('female', candidate)).toEqual({ why: 'not_pairable', reason: 'opted_out' })
  })
})

describe('what a one-to-one declares', () => {
  it('is the gender of the person it was opened from, while the Ministry enforces the match', () => {
    expect(declaredByAOneToOne({ enforced: true, openedFrom: person({ gender: 'female' }) })).toBe('female')
  })

  it('is nothing where the Ministry does not enforce the match', () => {
    expect(declaredByAOneToOne({ enforced: false, openedFrom: person({ gender: 'female' }) })).toBe('none')
  })

  it('is nothing where the person it was opened from has no gender on file', () => {
    expect(declaredByAOneToOne({ enforced: true, openedFrom: person({ gender: null }) })).toBe('none')
  })
})

describe('a Discipler in the popup opened from a Disciple', () => {
  const sam = person({ fullName: 'Sam Lee', gender: 'male' })

  it('is greyed for gender in a Ministry that enforces the match, and open in one that does not', () => {
    const claire = person({ gender: 'female' })
    expect(greyedForADisciple({ enforced: true, disciple: sam, discipler: claire })).toEqual({
      why: 'gender',
      declared: 'male',
    })
    expect(greyedForADisciple({ enforced: false, disciple: sam, discipler: claire })).toBeNull()
  })

  it('is open with no gender on file', () => {
    expect(greyedForADisciple({ enforced: true, disciple: sam, discipler: person() })).toBeNull()
  })

  it('is greyed, every one of them, when the Disciple is already in a one-to-one', () => {
    const paired = person({
      gender: 'male',
      relationships: [pairing('participant', { leaderNames: ['David Chen'], participantCount: 1 })],
    })
    const already = { why: 'already_in_a_one_to_one', withName: 'David Chen' }
    expect(greyedForADisciple({ enforced: true, disciple: paired, discipler: person({ gender: 'male' }) })).toEqual(already)
    expect(greyedForADisciple({ enforced: false, disciple: paired, discipler: person({ gender: 'female' }) })).toEqual(already)
  })

  it('is not greyed because the Disciple is in a group, or leads a one-to-one of their own', () => {
    const inAGroup = person({
      gender: 'male',
      relationships: [
        pairing('participant', { leaderNames: ['David Chen'], participantCount: 3 }),
        pairing('leader', { participantNames: ['Noah Kim'], participantCount: 1 }),
      ],
    })
    expect(greyedForADisciple({ enforced: true, disciple: inAGroup, discipler: person({ gender: 'male' }) })).toBeNull()
  })
})
