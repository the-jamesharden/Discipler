import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import {
  declaredByAOneToOne,
  disciplersShownTo,
  greyedAgainst,
  greyedForADisciple,
  greyedForADiscipler,
  greyedInAOneToTwo,
  groupLeftOut,
  groupsShownTo,
  leadsAGroup,
  leftOutForADisciple,
} from '../../app/roster/greying'

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
  countsAsAGroup: false,
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
    expect(declaredByAOneToOne({ genderMatchEnforced: true, openedFrom: person({ gender: 'female' }) })).toBe('female')
  })

  it('is nothing where the Ministry does not enforce the match', () => {
    expect(declaredByAOneToOne({ genderMatchEnforced: false, openedFrom: person({ gender: 'female' }) })).toBe('none')
  })

  it('is nothing where the person it was opened from has no gender on file', () => {
    expect(declaredByAOneToOne({ genderMatchEnforced: true, openedFrom: person({ gender: null }) })).toBe('none')
  })
})

describe('a Discipler in the popup opened from a Disciple', () => {
  const sam = person({ fullName: 'Sam Lee', gender: 'male' })

  it('is greyed for gender in a Ministry that enforces the match, and open in one that does not', () => {
    const claire = person({ gender: 'female' })
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: claire })).toEqual({
      why: 'gender',
      declared: 'male',
    })
    expect(greyedForADisciple({ genderMatchEnforced: false, disciple: sam, discipler: claire })).toBeNull()
  })

  it('is open with no gender on file', () => {
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: person() })).toBeNull()
  })

  it('is greyed, every one of them, when the Disciple is already in a one-to-one', () => {
    const paired = person({
      gender: 'male',
      relationships: [pairing('participant', { leaderNames: ['David Chen'], participantCount: 1 })],
    })
    const already = { why: 'already_in_a_one_to_one', withName: 'David Chen' }
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: paired, discipler: person({ gender: 'male' }) })).toEqual(already)
    expect(greyedForADisciple({ genderMatchEnforced: false, disciple: paired, discipler: person({ gender: 'female' }) })).toEqual(already)
  })

  it('is greyed all the same when the one-to-one names nobody leading it', () => {
    // The database counts the one-to-one whoever leads it, so a row left open for
    // want of a name would be offered and then refused.
    const paired = person({ relationships: [pairing('participant', { leaderNames: [], participantCount: 1 })] })
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: paired, discipler: person() })).toEqual({
      why: 'already_in_a_one_to_one',
      withName: null,
    })
  })

  it('is not greyed because the Disciple is in a group, or leads a one-to-one of their own', () => {
    const inAGroup = person({
      gender: 'male',
      relationships: [
        pairing('participant', { leaderNames: ['David Chen'], participantCount: 3, countsAsAGroup: true }),
        pairing('leader', { participantNames: ['Noah Kim'], participantCount: 1 }),
      ],
    })
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: inAGroup, discipler: person({ gender: 'male' }) })).toBeNull()
  })
})

describe('a Disciple in the popup opened from a Discipler', () => {
  const claire = person({ fullName: 'Claire Martinez', gender: 'female' })

  it('is greyed when already in a one-to-one, which is what one tick would make', () => {
    const brianna = person({
      gender: 'female',
      relationships: [pairing('participant', { leaderNames: ['David Chen'], participantCount: 1 })],
    })
    expect(greyedForADiscipler({ genderMatchEnforced: true, discipler: claire, disciple: brianna })).toEqual({
      why: 'already_in_a_one_to_one',
      withName: 'David Chen',
    })
  })

  it('is open when in a group, however many', () => {
    const rosa = person({
      gender: 'female',
      relationships: [pairing('participant', { leaderNames: ['Grace Lee'], participantCount: 3, countsAsAGroup: true })],
    })
    expect(greyedForADiscipler({ genderMatchEnforced: true, discipler: claire, disciple: rosa })).toBeNull()
  })

  it('is greyed for gender against what the one-to-one declares, the Discipler’s gender', () => {
    const tom = person({ gender: 'male' })
    expect(greyedForADiscipler({ genderMatchEnforced: true, discipler: claire, disciple: tom })).toEqual({
      why: 'gender',
      declared: 'female',
    })
    expect(greyedForADiscipler({ genderMatchEnforced: false, discipler: claire, disciple: tom })).toBeNull()
  })

  it('is never greyed with no gender on file, and nobody is when the Discipler has none', () => {
    expect(greyedForADiscipler({ genderMatchEnforced: true, discipler: claire, disciple: person() })).toBeNull()
    expect(
      greyedForADiscipler({ genderMatchEnforced: true, discipler: person(), disciple: person({ gender: 'male' }) }),
    ).toBeNull()
  })
})

/**
 * Manual pairing, recut ticket 02. A 1:2 pair takes the Discipler's gender as its
 * declaration and asks nothing, and it is a group for every rule.
 */
describe('a Disciple while what is ticked would make a 1:2 pair', () => {
  const claire = person({ fullName: 'Claire Martinez', gender: 'female' })
  const tom = person({ gender: 'male' })

  it('is greyed for gender against the Discipler’s, whether or not the Ministry enforces the match', () => {
    // The declaration binds its members whatever the Ministry's setting says of a
    // one-to-one, so this is not read off `suggest_gender_match`.
    expect(greyedInAOneToTwo({ discipler: claire, disciple: tom })).toEqual({ why: 'gender', declared: 'female' })
    expect(greyedInAOneToTwo({ discipler: claire, disciple: person({ gender: 'female' }) })).toBeNull()
  })

  it('is open when already in a one-to-one: one open one-to-one, and any number of groups', () => {
    const brianna = person({
      gender: 'female',
      relationships: [pairing('participant', { leaderNames: ['David Chen'], participantCount: 1 })],
    })
    expect(greyedInAOneToTwo({ discipler: claire, disciple: brianna })).toBeNull()
  })

  it('is never greyed with no gender on file, and nobody is when the Discipler has none to declare', () => {
    expect(greyedInAOneToTwo({ discipler: claire, disciple: person() })).toBeNull()
    expect(greyedInAOneToTwo({ discipler: person(), disciple: tom })).toBeNull()
  })
})

/**
 * A group that has fallen to one Disciple is still a group (James, 2026-09-20), as
 * the database's two caps have always had it (ADR-0004). So both rules read which
 * cap a pairing counts against, and never how many Disciples it has left.
 */
describe('a group that has fallen to one Disciple', () => {
  const shrunk = { participantCount: 1, countsAsAGroup: true }

  it('does not grey its last Disciple as already in a one-to-one, from either side', () => {
    const last = person({
      gender: 'female',
      relationships: [pairing('participant', { leaderNames: ['Grace Lee'], ...shrunk })],
    })
    const claire = person({ gender: 'female' })
    expect(greyedForADiscipler({ genderMatchEnforced: true, discipler: claire, disciple: last })).toBeNull()
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: last, discipler: claire })).toBeNull()
  })

  it('still counts as the one group its Discipler leads', () => {
    expect(leadsAGroup(person({ relationships: [pairing('leader', shrunk)] }))).toBe(true)
    expect(leadsAGroup(person({ relationships: [pairing('leader', { participantCount: 0, countsAsAGroup: true })] }))).toBe(true)
  })
})

describe('a Discipler who already leads a group', () => {
  it('is one who leads an open pairing of two or more Disciples, accepted yet or not', () => {
    expect(leadsAGroup(person({ relationships: [pairing('leader', { participantCount: 2, countsAsAGroup: true })] }))).toBe(true)
    expect(
      leadsAGroup(person({ relationships: [pairing('leader', { participantCount: 4, countsAsAGroup: true, awaitingAcceptance: true })] })),
    ).toBe(true)
  })

  it('is not one who leads one-to-ones, however many, or who is only in a group', () => {
    expect(leadsAGroup(person())).toBe(false)
    expect(
      leadsAGroup(
        person({
          relationships: [
            pairing('leader', { participantCount: 1 }),
            pairing('leader', { participantCount: 1 }),
            pairing('participant', { participantCount: 3, countsAsAGroup: true }),
          ],
        }),
      ),
    ).toBe(false)
  })
})

/**
 * Decided by James on 2026-09-21, reviewing recut ticket 03: in the popup opened
 * from a Disciple, somebody or some group that gender rules out is not shown at
 * all, in place of a greyed row with a reason. Where the Ministry lets a one-to-one
 * cross genders, everybody shows. Every other reason is still a greyed row.
 */
describe('who is left out of the popup opened from a Disciple', () => {
  const sam = person({ gender: 'female' })

  it('leaves out a Discipler of another gender while the Ministry enforces the match', () => {
    expect(leftOutForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: person({ gender: 'male' }) })).toBe(true)
    expect(leftOutForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: person({ gender: 'female' }) })).toBe(false)
  })

  it('shows everybody where the Ministry lets a one-to-one cross genders', () => {
    expect(leftOutForADisciple({ genderMatchEnforced: false, disciple: sam, discipler: person({ gender: 'male' }) })).toBe(false)
  })

  it('never leaves anybody out for having no gender on file, on either side', () => {
    expect(leftOutForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: person({ gender: null }) })).toBe(false)
    expect(
      leftOutForADisciple({ genderMatchEnforced: true, disciple: person({ gender: null }), discipler: person({ gender: 'male' }) }),
    ).toBe(false)
  })

  it('leaves out a Discipler of another gender whatever else is true of them or of the Disciple', () => {
    const optedOut = person({ gender: 'male', participationStatus: 'opted_out' })
    expect(leftOutForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: optedOut })).toBe(true)
    const paired = person({ gender: 'female', relationships: [pairing('participant', { leaderNames: ['Grace Lee'] })] })
    expect(leftOutForADisciple({ genderMatchEnforced: true, disciple: paired, discipler: person({ gender: 'male' }) })).toBe(true)
  })

  it('still shows, greyed, a Discipler who cannot be chosen for any other reason', () => {
    const waiting = person({ gender: null, participationStatus: 'no_intake_submitted' })
    expect(leftOutForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: waiting })).toBe(false)
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: waiting })).toEqual({
      why: 'not_pairable',
      reason: 'awaiting_intake',
    })
  })

  it('leaves out a group whose declaration rules the Disciple out, whatever the Ministry says of a one-to-one', () => {
    expect(groupLeftOut({ group: { declaredGender: 'male' }, person: sam })).toBe(true)
    expect(groupLeftOut({ group: { declaredGender: 'female' }, person: sam })).toBe(false)
  })

  it('shows a Coed group to everybody, and every group to somebody with no gender on file', () => {
    expect(groupLeftOut({ group: { declaredGender: null }, person: sam })).toBe(false)
    expect(groupLeftOut({ group: { declaredGender: null }, person: person({ gender: 'male' }) })).toBe(false)
    expect(groupLeftOut({ group: { declaredGender: 'male' }, person: person({ gender: null }) })).toBe(false)
  })

  it('stays open to a Disciple already in a one-to-one, who may be in any number of groups', () => {
    const paired = person({ gender: 'male', relationships: [pairing('participant', { leaderNames: ['David Chen'] })] })
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: paired, discipler: person({ gender: 'male' }) })).toEqual({
      why: 'already_in_a_one_to_one',
      withName: 'David Chen',
    })
    expect(groupLeftOut({ group: { declaredGender: 'male' }, person: paired })).toBe(false)
  })
})

/**
 * The two lists the popup opened from a Disciple is handed, composed: who the
 * Roster makes a Discipler and which groups the Pair document lists, less what
 * gender rules out.
 */
describe('what the popup opened from a Disciple lists', () => {
  const offers = (over: Partial<RosterEntry>) => person({ declaredSide: 'mentor', ...over })
  const aGroup = (declaredGender: 'male' | 'female' | null, memberIds: readonly RosterEntry['personId'][] = []) => ({
    relationshipId: relationshipId(`group-${++counter}`),
    name: 'Thursday Table',
    leaders: [{ personId: personId('david'), fullName: 'David Chen' }],
    discipleCount: 3,
    declaredGender,
    state: null,
    memberIds,
  })

  it('is every Discipler gender does not rule out, in the Roster’s order, greyed ones included', () => {
    const sam = person({ gender: 'female' })
    const grace = offers({ gender: 'female' })
    const david = offers({ gender: 'male' })
    const left = offers({ gender: 'female', participationStatus: 'opted_out' })
    const waiting = offers({ gender: null, participationStatus: 'no_intake_submitted' })
    const roster = [sam, grace, david, left, waiting]

    expect(disciplersShownTo({ roster, disciple: sam, genderMatchEnforced: true })).toEqual([grace, left, waiting])
    // Shown, and greyed with what their Roster row says: only gender leaves anybody out.
    expect(greyedForADisciple({ genderMatchEnforced: true, disciple: sam, discipler: left })).toEqual({
      why: 'not_pairable',
      reason: 'opted_out',
    })
    expect(disciplersShownTo({ roster, disciple: sam, genderMatchEnforced: false })).toEqual([grace, david, left, waiting])
  })

  it('is every group they are not already in and whose declaration does not rule them out', () => {
    const sam = person({ gender: 'female' })
    const coed = aGroup(null)
    const womens = aGroup('female')
    const mens = aGroup('male')
    const hers = aGroup(null, [sam.personId])

    expect(groupsShownTo(sam, [coed, mens, womens, hers])).toEqual([coed, womens])
    expect(groupsShownTo(person({ gender: null }), [coed, mens, womens])).toEqual([coed, mens, womens])
  })
})
