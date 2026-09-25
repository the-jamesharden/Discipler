import { describe, expect, it } from 'vitest'
import { intendedPairingId, personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import { PAIR_POPUP } from '../../app/roster/copy'
import { leftOutForADiscipler } from '../../app/roster/greying'
import {
  askedToBeDiscipled,
  candidatesFor,
  isPairSide,
  listedFirst,
  opensAs,
  pairPopupHref,
  popupOnSide,
  sideOfThePopup,
} from '../../app/roster/lists'

/**
 * Roles per pairing, ticket 01: nobody is a Discipler or a Disciple, and the Pair
 * popup asks which side this person is on in this pairing. Anybody who has
 * completed Intake can be picked on either side; each side lists the usual people
 * first and everybody else folded. The rules are pure and driven here with no
 * database anywhere near them.
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
  isAdmin: false,
  intendedPairings: [],
  ...over,
})

const pairing = (role: RosterRelationship['role'], over: Partial<RosterRelationship> = {}): RosterRelationship => ({
  relationshipId: relationshipId(`relationship-${++counter}`),
  role,
  withNames: [],
  leaderNames: [],
  participantNames: [],
  participantCount: 1,
  countsAsAGroup: false,
  name: null,
  awaitingAcceptance: false,
  ...over,
})

const plan = (role: RosterIntendedPairing['role']): RosterIntendedPairing => ({
  id: intendedPairingId(`plan-${++counter}`),
  role,
  withPersonId: personId(`person-with-${counter}`),
  withName: `Somebody ${counter}`,
  state: 'awaiting_intake',
  refusal: null,
})

describe('which side the popup opens on', () => {
  it('is Disciples somebody for whoever leads, offered to on the Intake form, or was planned as the discipler', () => {
    expect(opensAs(person({ relationships: [pairing('leader')] }))).toBe('discipler')
    expect(opensAs(person({ declaredSide: 'mentor' }))).toBe('discipler')
    expect(opensAs(person({ intendedPairings: [plan('leader')] }))).toBe('discipler')
    // On both sides at once: leading is what presets it.
    expect(opensAs(person({ relationships: [pairing('participant'), pairing('leader')] }))).toBe('discipler')
  })

  it('is Is discipled for everybody else', () => {
    expect(opensAs(person())).toBe('disciple')
    expect(opensAs(person({ declaredSide: 'mentee' }))).toBe('disciple')
    expect(opensAs(person({ relationships: [pairing('participant')] }))).toBe('disciple')
    expect(opensAs(person({ intendedPairings: [plan('participant')] }))).toBe('disciple')
  })

  it('is what the address says, on its own, and the preset where it says nothing it knows', () => {
    const emily = person({ relationships: [pairing('participant')] })
    expect(sideOfThePopup('discipler', emily)).toBe('discipler')
    expect(sideOfThePopup('disciple', emily)).toBe('disciple')
    expect(sideOfThePopup(undefined, emily)).toBe('disciple')
    expect(sideOfThePopup('disciples', emily)).toBe('disciple')
    expect(sideOfThePopup('leader', person({ declaredSide: 'mentor' }))).toBe('discipler')
    expect(isPairSide('discipler')).toBe(true)
    expect(isPairSide('disciple')).toBe(true)
    expect(isPairSide('all')).toBe(false)
    expect(isPairSide(null)).toBe(false)
  })
})

describe('the address of the popup on a side', () => {
  it('names the side on its own, where a way in says one', () => {
    expect(pairPopupHref('p-1')).toBe('/roster?pair=p-1')
    expect(pairPopupHref('p-1', 'disciple')).toBe('/roster?pair=p-1&side=disciple')
  })

  it('switches the side and keeps everything else in the address', () => {
    // What the Roster's menu has ticked behind the popup included (Roles per
    // pairing, ticket 02).
    const address = new URLSearchParams([
      ['pairings', 'being-discipled'],
      ['gender', 'women'],
      ['pair', 'p-1'],
      ['with', 'p-2'],
      ['with', 'p-3'],
      ['mode', 'separate'],
      ['materialId.p-2', 'm-1'],
    ])
    const switched = new URL(popupOnSide(address, 'discipler'), 'http://x')
    expect(switched.pathname).toBe('/roster')
    expect([...switched.searchParams]).toEqual([...address, ['side', 'discipler']])
  })

  it('replaces a side the address already says, where it said it', () => {
    const address = new URLSearchParams([
      ['access', 'admins'],
      ['side', 'discipler'],
      ['pair', 'p-1'],
    ])
    expect(popupOnSide(address, 'disciple')).toBe('/roster?access=admins&side=disciple&pair=p-1')
  })

  it('leaves a refusal behind: it was about what was posted from the other side', () => {
    const address = new URLSearchParams([
      ['pair', 'p-1'],
      ['side', 'discipler'],
      ['error', 'relationship.gender_must_match'],
      ['about', 'p-2'],
      ['with', 'p-2'],
    ])
    expect(popupOnSide(address, 'disciple')).toBe('/roster?pair=p-1&side=disciple&with=p-2')
  })
})

describe('who each side lists', () => {
  it('is everybody on the Roster but the person themselves, in the Roster’s order', () => {
    const emily = person()
    const waiting = person({ participationStatus: 'no_intake_submitted' })
    const left = person({ participationStatus: 'opted_out' })
    const grace = person({ relationships: [pairing('leader')] })
    const roster = [grace, emily, waiting, left]
    expect(candidatesFor(roster, emily)).toEqual([grace, waiting, left])
  })

  it('opens Disciples somebody on those who asked to be discipled: Intake done, not opted out, discipled by nobody, and not presetting to disciple', () => {
    const sarah = person({ declaredSide: 'mentee' })
    const said = person()
    expect(askedToBeDiscipled(sarah)).toBe(true)
    expect(askedToBeDiscipled(said)).toBe(true)
    expect(askedToBeDiscipled(person({ participationStatus: 'no_intake_submitted' }))).toBe(false)
    expect(askedToBeDiscipled(person({ participationStatus: 'opted_out' }))).toBe(false)
    // Discipled already, one to one or in a group.
    expect(askedToBeDiscipled(person({ relationships: [pairing('participant')] }))).toBe(false)
    expect(askedToBeDiscipled(person({ relationships: [pairing('participant', { participantCount: 3 })] }))).toBe(false)
    // Would open as Disciples somebody themselves.
    expect(askedToBeDiscipled(person({ declaredSide: 'mentor' }))).toBe(false)
    expect(askedToBeDiscipled(person({ relationships: [pairing('leader')] }))).toBe(false)
    expect(askedToBeDiscipled(person({ intendedPairings: [plan('leader')] }))).toBe(false)

    expect(listedFirst('discipler', sarah)).toBe(true)
    expect(listedFirst('discipler', person({ declaredSide: 'mentor' }))).toBe(false)
  })

  it('opens Is discipled on whoever disciples somebody already, or offered to', () => {
    expect(listedFirst('disciple', person({ relationships: [pairing('leader')] }))).toBe(true)
    expect(listedFirst('disciple', person({ declaredSide: 'mentor' }))).toBe(true)
    expect(listedFirst('disciple', person({ intendedPairings: [plan('leader')] }))).toBe(true)
    // Greyed ones included: the section says who they are, the row says whether they can be chosen.
    expect(listedFirst('disciple', person({ declaredSide: 'mentor', participationStatus: 'opted_out' }))).toBe(true)
    expect(listedFirst('disciple', person())).toBe(false)
    expect(listedFirst('disciple', person({ relationships: [pairing('participant')] }))).toBe(false)
  })
})

describe('whom gender leaves off Disciples somebody', () => {
  const emily = person({ gender: 'female' })

  it('is whoever the declaration of what is being made rules out, and nothing else', () => {
    const noah = person({ gender: 'male' })
    expect(leftOutForADiscipler({ genderMatchEnforced: true, discipler: emily, disciple: noah })).toEqual([
      'a_one_to_one',
      'a_one_to_two',
      'a_womens_group',
    ])
    expect(leftOutForADiscipler({ genderMatchEnforced: false, discipler: emily, disciple: noah })).toEqual([
      'a_one_to_two',
      'a_womens_group',
    ])
    expect(leftOutForADiscipler({ genderMatchEnforced: true, discipler: emily, disciple: person({ gender: 'female' }) })).toEqual([
      'a_mens_group',
    ])
  })

  it('leaves out somebody of another gender whatever else is true of them, as from the other side', () => {
    for (const noah of [
      person({ gender: 'male', participationStatus: 'no_intake_submitted' }),
      person({ gender: 'male', participationStatus: 'opted_out' }),
      person({ gender: 'male', relationships: [pairing('participant', { leaderNames: ['Rachel Adams'] })] }),
    ]) {
      expect(leftOutForADiscipler({ genderMatchEnforced: true, discipler: emily, disciple: noah })).toContain('a_one_to_one')
    }
  })

  it('never leaves out somebody with no gender on file, nor anybody for a Discipler with none', () => {
    expect(leftOutForADiscipler({ genderMatchEnforced: true, discipler: emily, disciple: person() })).toEqual([])
    expect(leftOutForADiscipler({ genderMatchEnforced: true, discipler: person(), disciple: person({ gender: 'male' }) })).toEqual([
      'a_womens_group',
    ])
  })
})

describe('what the side chooser and the two sides say', () => {
  it('asks which side, by first name, in James’s words', () => {
    expect(PAIR_POPUP.inThisPairing('Emily Davis')).toBe('In this pairing, Emily')
    expect(PAIR_POPUP.side.discipler).toBe('Disciples somebody')
    expect(PAIR_POPUP.side.disciple).toBe('Is discipled')
  })

  it('heads each side’s usual people, and folds everybody else', () => {
    expect(PAIR_POPUP.listedFirst.discipler).toBe('Asked to be discipled')
    // *Disciples*, not *Disciple* (James, 2026-09-24).
    expect(PAIR_POPUP.listedFirst.disciple).toBe('Disciples somebody already, or offered to')
    expect(PAIR_POPUP.everyoneElse).toBe('Everyone else')
  })

  it('counts both sections in the toolbar, as the mock-ups do', () => {
    expect(PAIR_POPUP.listed('discipler', 2, 5)).toBe('2 asked · 5 more')
    expect(PAIR_POPUP.listed('disciple', 3, 4)).toBe('3 lead or offered · 4 more')
    expect(PAIR_POPUP.listed('disciple', 3, 0)).toBe('3 lead or offered')
    expect(PAIR_POPUP.listed('discipler', 0, 5)).toBe('0 asked · 5 more')
  })
})

describe('what a row says somebody does now', () => {
  // As the row reads it: each item wrapping whole, with a dot between.
  const said = (...args: Parameters<typeof PAIR_POPUP.doingNow>): string | null => {
    const items = PAIR_POPUP.doingNow(...args)
    return items.length === 0 ? null : items.join(' · ')
  }

  const oneToOne = (role: RosterRelationship['role'], other: string) =>
    pairing(role, role === 'leader' ? { participantNames: [other], leaderNames: ['Me'] } : { leaderNames: [other], participantNames: ['Me'] })
  const tuesday = (role: RosterRelationship['role']) =>
    pairing(role, { name: 'Tuesday Women’s', leaderNames: ['Grace Lee'], participantNames: ['Hannah Brooks', 'Lily Evans'], participantCount: 2, countsAsAGroup: true })

  it('says each pairing with its direction, leading first', () => {
    expect(said([oneToOne('participant', 'Rachel Adams')], { leading: true })).toBe('Discipled by Rachel Adams')
    expect(said([tuesday('participant')], { leading: true })).toBe('In Tuesday Women’s')
    expect(said([oneToOne('leader', 'Hannah Brooks')], { leading: true })).toBe('Disciples Hannah Brooks')
    expect(said([tuesday('leader')], { leading: true })).toBe('Leads Tuesday Women’s')
    expect(
      said([oneToOne('participant', 'Rachel Adams'), tuesday('participant'), oneToOne('leader', 'Chloe Park')], { leading: true }),
    ).toBe('Disciples Chloe Park · Discipled by Rachel Adams · In Tuesday Women’s')
    // Within a side, a one-to-one before a group, whatever order they arrive in.
    expect(said([tuesday('participant'), oneToOne('participant', 'Rachel Adams')], { leading: true })).toBe(
      'Discipled by Rachel Adams · In Tuesday Women’s',
    )
    expect(said([tuesday('leader'), oneToOne('leader', 'Emily Davis')], { leading: true })).toBe(
      'Disciples Emily Davis · Leads Tuesday Women’s',
    )
  })

  it('names a group nobody named by who leads it', () => {
    const unnamed = pairing('participant', { leaderNames: ['Grace Lee'], participantCount: 3 })
    expect(said([unnamed], { leading: true })).toBe('In Grace Lee’s group')
  })

  it('leaves leading to *leads N* where the row already counts it', () => {
    expect(said([oneToOne('leader', 'Chloe Park'), oneToOne('participant', 'Grace Lee')], { leading: false })).toBe(
      'Discipled by Grace Lee',
    )
    expect(said([oneToOne('leader', 'Chloe Park')], { leading: false })).toBeNull()
  })

  it('says nothing for somebody who does nothing yet', () => {
    expect(said([], { leading: true })).toBeNull()
  })
})

describe('the summary sentence', () => {
  it('names both sides of a one-to-one, and what the picked Discipler goes on doing', () => {
    expect(PAIR_POPUP.oneToOne('Emily Davis', 'Chloe Park')).toBe('Emily Davis will disciple Chloe Park, one to one.')
    expect(PAIR_POPUP.willDisciple('Emily Davis', ['Chloe Park'])).toBe('Emily Davis will disciple Chloe Park')
    expect(
      PAIR_POPUP.invited('Emily Davis', [pairing('participant', { leaderNames: ['Grace Lee'], participantNames: ['Emily Davis'] })]),
    ).toBe('Emily is sent an invitation to accept, and goes on being discipled by Grace Lee.')
  })

  it('says every pairing they go on being discipled in, and nothing they lead', () => {
    const rachel = pairing('participant', { leaderNames: ['Rachel Adams'] })
    const tuesday = pairing('participant', { name: 'Tuesday Women’s', leaderNames: ['Grace Lee'], participantCount: 2, countsAsAGroup: true })
    expect(PAIR_POPUP.invited('Hannah Brooks', [rachel, tuesday])).toBe(
      'Hannah is sent an invitation to accept, and goes on being discipled by Rachel Adams and in Tuesday Women’s.',
    )
    expect(PAIR_POPUP.invited('Lily Evans', [tuesday])).toBe(
      'Lily is sent an invitation to accept, and goes on being discipled in Tuesday Women’s.',
    )
    expect(PAIR_POPUP.invited('Grace Lee', [pairing('leader', { participantNames: ['Emily Davis'] })])).toBe(
      'Grace is sent an invitation to accept.',
    )
    expect(PAIR_POPUP.invited('Sarah Kim', [])).toBe('Sarah is sent an invitation to accept.')
  })

  it('says Discipler and Disciple words, never the model’s', () => {
    const said = [
      PAIR_POPUP.inThisPairing('A B'),
      ...Object.values(PAIR_POPUP.side),
      ...Object.values(PAIR_POPUP.listedFirst),
      PAIR_POPUP.everyoneElse,
      PAIR_POPUP.listed('discipler', 1, 1),
      PAIR_POPUP.listed('disciple', 1, 1),
      PAIR_POPUP.oneToOne('A', 'B'),
      PAIR_POPUP.invited('A B', [pairing('participant', { leaderNames: ['C'] })]),
      ...PAIR_POPUP.doingNow([pairing('leader', { participantCount: 2, name: 'G' })], { leading: true }),
    ]
    for (const sentence of said) expect(sentence).not.toMatch(/\bleaders?\b|participant|mentor|mentee/i)
  })
})
