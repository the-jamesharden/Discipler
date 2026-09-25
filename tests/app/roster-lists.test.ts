import { describe, expect, it } from 'vitest'
import { intendedPairingId, personId, relationshipId } from '~/domain/ids'
import { phoneNumber } from '~/domain/roster'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import * as copy from '../../app/roster/copy'
import { CANNOT_BE_PAIRED, displayPhone } from '../../app/roster/copy'
import {
  groupsToJoin,
  isDiscipler,
  isDisciple,
  leadsCount,
  onList,
  opensAs,
  pairHref,
  plansOn,
  reasonOnRow,
  relationshipsOn,
  rosterStats,
  tagOnName,
  whoThePopupIsFor,
  whyNotPairable,
} from '../../app/roster/lists'

/**
 * Who is on which list, and the three numbers over each. Pure over the reader's
 * own type, so the rule is driven with no database anywhere near it.
 *
 * A Discipler is a fact, never a mark (ticket 36): leads somebody, offered to on
 * the Intake form, or an import paired them as one. Everyone else is a Disciple,
 * and a person may be both.
 */

let counter = 0
const person = (
  over: Partial<RosterEntry> & { readonly relationships?: readonly RosterRelationship[] } = {},
): RosterEntry => ({
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

const plan = (role: RosterIntendedPairing['role']): RosterIntendedPairing => ({
  id: intendedPairingId(`plan-${++counter}`),
  role,
  withPersonId: personId(`person-with-${counter}`),
  withName: `Somebody ${counter}`,
  state: 'awaiting_intake',
  refusal: null,
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
  name: null,
  awaitingAcceptance: false,
  ...over,
})

describe('who is a Discipler', () => {
  it('is somebody who disciples somebody', () => {
    const leads = person({ relationships: [pairing('leader')] })
    expect(isDiscipler(leads)).toBe(true)
    expect(isDisciple(leads)).toBe(false)
  })

  it('is somebody who signed up as a leader on the Intake form, before any pairing', () => {
    const offered = person({ declaredSide: 'mentor' })
    expect(isDiscipler(offered)).toBe(true)
    expect(isDisciple(offered)).toBe(false)
  })

  it('is not somebody who merely asked to be discipled, or was imported', () => {
    expect(isDiscipler(person({ declaredSide: 'mentee' }))).toBe(false)
    expect(isDiscipler(person({ participationStatus: 'no_intake_submitted' }))).toBe(false)
    expect(isDisciple(person({ participationStatus: 'no_intake_submitted' }))).toBe(true)
  })

  it('may be a Disciple at the same time -- the multiplication case, not a bug', () => {
    const both = person({ relationships: [pairing('leader'), pairing('participant')] })
    expect(isDiscipler(both)).toBe(true)
    expect(isDisciple(both)).toBe(true)
    expect(onList('disciplers', both)).toBe(true)
    expect(onList('disciples', both)).toBe(true)
  })

  it('is a Disciple as well when they asked to be discipled on the Intake form, though they lead (James, 2026-09-22)', () => {
    const asked = person({ declaredSide: 'mentee', relationships: [pairing('leader')] })
    expect(isDiscipler(asked)).toBe(true)
    expect(isDisciple(asked)).toBe(true)
    expect(onList('disciples', asked)).toBe(true)
  })

  it('is somebody an import paired as one, before either has completed Intake', () => {
    const planned = person({ participationStatus: 'no_intake_submitted', intendedPairings: [plan('leader')] })
    expect(isDiscipler(planned)).toBe(true)
    expect(isDisciple(planned)).toBe(false)
  })
})

describe('the three numbers over a list', () => {
  it('counts paired as an open pairing in that role, and unpaired as the rest', () => {
    const people = [
      person({ relationships: [pairing('leader')] }),
      person({ declaredSide: 'mentor' }),
      person({ declaredSide: 'mentor', relationships: [pairing('leader', { participantCount: 3 })] }),
    ]
    expect(rosterStats('disciplers', people)).toEqual({ total: 3, paired: 2, unpaired: 1 })
  })

  it('counts a group like any other pairing', () => {
    const people = [
      person({ relationships: [pairing('participant', { participantCount: 1 })] }),
      person({ relationships: [pairing('participant', { participantCount: 4 })] }),
      person(),
    ]
    expect(rosterStats('disciples', people)).toEqual({ total: 3, paired: 2, unpaired: 1 })
  })

  it('counts a person once however many pairings they hold', () => {
    const busy = person({
      relationships: [pairing('leader'), pairing('leader', { participantCount: 2 }), pairing('leader', { participantCount: 5 })],
    })
    expect(rosterStats('disciplers', [busy])).toEqual({ total: 1, paired: 1, unpaired: 0 })
  })

  it('counts only the role of the list being looked at', () => {
    // Discipled by somebody and disciples nobody: paired on the Disciples list,
    // and not a Discipler at all.
    const discipled = person({ relationships: [pairing('participant')] })
    expect(rosterStats('disciples', [discipled]).paired).toBe(1)
    expect(onList('disciplers', discipled)).toBe(false)
  })
})

describe('a phone number as a person reads it', () => {
  it('formats a North American number the way the spreadsheet had it', () => {
    expect(displayPhone(phoneNumber('+17065550142'))).toBe('(706) 555-0142')
  })

  it('leaves any other number as it is stored', () => {
    expect(displayPhone(phoneNumber('+447700900123'))).toBe('+447700900123')
  })
})

describe('the All list (Manual pairing, ticket 06)', () => {
  const both = person({ relationships: [pairing('participant'), pairing('leader')] })
  const leads = person({ relationships: [pairing('leader')] })
  const discipled = person({ relationships: [pairing('participant')] })
  const offered = person({ declaredSide: 'mentor' })
  const imported = person({ participationStatus: 'no_intake_submitted' })
  const everybody = [both, leads, discipled, offered, imported]

  it('is everybody on the Roster, each once, including somebody on both sides', () => {
    expect(onList('disciplers', both) && onList('disciples', both)).toBe(true)
    const shown = everybody.filter((one) => onList('all', one))
    expect(shown).toEqual(everybody)
    expect(shown.filter((one) => one.personId === both.personId)).toHaveLength(1)
  })

  it('does not change who is on either side', () => {
    expect(everybody.filter((one) => onList('disciplers', one))).toEqual([both, leads, offered])
    expect(everybody.filter((one) => onList('disciples', one))).toEqual([both, discipled, imported])
  })

  it('shows every pairing a person holds, in either role, leading first', () => {
    expect(relationshipsOn('all', both).map(({ role }) => role)).toEqual(['leader', 'participant'])
    // The sides still show only their own role.
    expect(relationshipsOn('disciplers', both).map(({ role }) => role)).toEqual(['leader'])
    expect(relationshipsOn('disciples', both).map(({ role }) => role)).toEqual(['participant'])
  })

  it('shows every plan an import made about a person, on whichever side of it they are', () => {
    const planned = person({ intendedPairings: [plan('participant'), plan('leader')] })
    expect(plansOn('all', planned).map(({ role }) => role)).toEqual(['leader', 'participant'])
    expect(plansOn('disciplers', planned).map(({ role }) => role)).toEqual(['leader'])
    expect(plansOn('disciples', planned).map(({ role }) => role)).toEqual(['participant'])
  })

  it('counts paired as an open pairing in either role, and a plan as none', () => {
    const onlyPlanned = person({ intendedPairings: [plan('leader')] })
    expect(rosterStats('all', [...everybody, onlyPlanned])).toEqual({ total: 6, paired: 3, unpaired: 3 })
  })
})

describe('what a row offers (Manual pairing, ticket 07)', () => {
  it('finds nothing in the way of somebody who has completed Intake and not opted out', () => {
    expect(whyNotPairable(person({ participationStatus: 'ready_to_pair' }))).toBeNull()
    // Being discipled does not stop somebody being paired again: a Disciple may
    // join a group, and a Discipler may lead another.
    expect(whyNotPairable(person({ participationStatus: 'paired' }))).toBeNull()
  })

  it('says why somebody cannot be paired, in the words the row prints', () => {
    const imported = person({ participationStatus: 'no_intake_submitted' })
    const left = person({ participationStatus: 'opted_out' })
    expect(whyNotPairable(imported)).toBe('awaiting_intake')
    expect(whyNotPairable(left)).toBe('opted_out')
    expect(CANNOT_BE_PAIRED[whyNotPairable(imported)!]).toBe('Awaiting Intake')
    expect(CANNOT_BE_PAIRED[whyNotPairable(left)!]).toBe('Opted out')
  })

  it('gives a Discipler the same answer, whoever they already lead (James, 2026-09-19)', () => {
    // A Discipler keeps Pair when they already lead somebody: leading one person
    // does not stop them leading another.
    expect(whyNotPairable(person({ relationships: [pairing('leader')] }))).toBeNull()
    // And the reason wins over the side: the database refuses a pairing led by
    // somebody who has not completed Intake or has opted out, so the row offers
    // nothing to press.
    const plannedToLead = person({ participationStatus: 'no_intake_submitted', intendedPairings: [plan('leader')] })
    const offeredThenLeft = person({ participationStatus: 'opted_out', declaredSide: 'mentor' })
    expect(isDiscipler(plannedToLead) && isDiscipler(offeredThenLeft)).toBe(true)
    expect(whyNotPairable(plannedToLead)).toBe('awaiting_intake')
    expect(whyNotPairable(offeredThenLeft)).toBe('opted_out')
  })

  it('tags the name of somebody who has not completed Intake, and nobody else (James, 2026-09-21)', () => {
    // An import files people who have answered nothing, and an Admin looking down
    // the names has to see which those are.
    expect(tagOnName(person({ participationStatus: 'no_intake_submitted' }))).toBe('awaiting_intake')
    expect(CANNOT_BE_PAIRED[tagOnName(person({ participationStatus: 'no_intake_submitted' }))!]).toBe('Awaiting Intake')
    // Whatever else they hold: planned to lead, or having offered to.
    expect(tagOnName(person({ participationStatus: 'no_intake_submitted', intendedPairings: [plan('leader')] }))).toBe('awaiting_intake')
    expect(tagOnName(person({ participationStatus: 'ready_to_pair' }))).toBeNull()
    expect(tagOnName(person({ participationStatus: 'paired' }))).toBeNull()
    // Opted out is said where Pair would have been, as it was.
    expect(tagOnName(person({ participationStatus: 'opted_out' }))).toBeNull()
  })

  it('does not say Awaiting Intake a second time in the Paired with cell, because the name has (James, 2026-09-21)', () => {
    const refused: RosterIntendedPairing = { ...plan('participant'), state: 'refused', refusal: 'relationship.gender_must_match' }
    const waiting = person({ participationStatus: 'no_intake_submitted', intendedPairings: [plan('participant')] })
    const notMade = person({ participationStatus: 'no_intake_submitted', intendedPairings: [refused] })
    const leftAPlan = person({ participationStatus: 'opted_out', intendedPairings: [plan('participant')] })
    const leftAPairing = person({ participationStatus: 'opted_out', relationships: [pairing('participant')] })

    // The tag beside the name has said it, on every row and whatever the row holds;
    // the row still offers no Pair.
    expect(reasonOnRow(person({ participationStatus: 'no_intake_submitted' }))).toBeNull()
    expect(reasonOnRow(waiting)).toBeNull()
    expect(reasonOnRow(notMade)).toBeNull()
    expect(whyNotPairable(waiting)).toBe('awaiting_intake')
    // Opted out is said nowhere else on the row, so the cell says it.
    expect(reasonOnRow(leftAPlan)).toBe('opted_out')
    expect(reasonOnRow(leftAPairing)).toBe('opted_out')
    expect(reasonOnRow(person())).toBeNull()
  })

})

describe('the Pair popup, from a Disciple (Manual pairing, ticket 12)', () => {
  const disciple = person()
  const discipler = person({ declaredSide: 'mentor' })
  const both = person({ relationships: [pairing('participant'), pairing('leader')] })

  // Roles per pairing, ticket 01: the list no longer decides the side. The popup
  // opens preset by who would be a Discipler, and one press switches it; the rule
  // itself is tests/app/the-pair-popup-picks-a-side.test.ts's.
  it('opens preset by who would be a Discipler, whichever list Pair was pressed on', () => {
    expect(opensAs(both)).toBe('discipler')
    expect(opensAs(discipler)).toBe('discipler')
    expect(opensAs(disciple)).toBe('disciple')
  })

  it('sends Pair on a Disciple row to the popup over the list it was pressed on', () => {
    expect(pairHref('disciples', disciple)).toBe(`/roster?list=disciples&pair=${disciple.personId}`)
    expect(pairHref('all', disciple)).toBe(`/roster?list=all&pair=${disciple.personId}`)
    expect(pairHref('disciples', both)).toBe(`/roster?list=disciples&pair=${both.personId}`)
  })

  it('sends Pair on a Discipler row to the popup over the list it was pressed on, as the old Pair page retires', () => {
    // Manual pairing, recut ticket 05: no row links to `/roster/pair` any more.
    expect(pairHref('disciplers', discipler)).toBe(`/roster?list=disciplers&pair=${discipler.personId}`)
    expect(pairHref('all', discipler)).toBe(`/roster?list=all&pair=${discipler.personId}`)
    expect(pairHref('all', both)).toBe(`/roster?list=all&pair=${both.personId}`)
    expect(pairHref('disciplers', both)).toBe(`/roster?list=disciplers&pair=${both.personId}`)
  })

  it('opens for somebody on the Roster who can be paired, and for nobody else', () => {
    const waiting = person({ participationStatus: 'no_intake_submitted' })
    const left = person({ participationStatus: 'opted_out' })
    const roster = [disciple, discipler, both, waiting, left]
    expect(whoThePopupIsFor(roster, disciple.personId)).toBe(disciple)
    expect(whoThePopupIsFor(roster, both.personId)).toBe(both)
    expect(whoThePopupIsFor(roster, waiting.personId)).toBeNull()
    expect(whoThePopupIsFor(roster, left.personId)).toBeNull()
    expect(whoThePopupIsFor(roster, 'nobody-on-this-roster')).toBeNull()
    expect(whoThePopupIsFor(roster, undefined)).toBeNull()
  })

  it('counts the people somebody leads, across everything they lead', () => {
    expect(leadsCount(disciple)).toBe(0)
    expect(leadsCount(person({ relationships: [pairing('leader')] }))).toBe(1)
    const busy = person({
      relationships: [
        pairing('leader'),
        pairing('leader', { participantCount: 3 }),
        pairing('participant', { participantCount: 4 }),
      ],
    })
    expect(leadsCount(busy)).toBe(4)
  })
})

/**
 * Manual pairing, recut ticket 03: the groups the popup offers somebody are the
 * ones the Pair document lists, less any they are already in, in either role.
 */
describe('the groups the Pair popup offers somebody', () => {
  const group = (name: string, memberIds: readonly RosterEntry['personId'][]) => ({
    relationshipId: relationshipId(`group-${++counter}`),
    name,
    leaders: [{ personId: personId('grace'), fullName: 'Grace Lee' }],
    discipleCount: 3,
    declaredGender: null,
    state: null,
    memberIds,
  })

  it('leaves out a group they are already in, and keeps the order the document gave', () => {
    const sam = person()
    const first = group('Grace’s Group', [personId('grace')])
    const his = group('Thursday Table', [personId('david'), sam.personId])
    const last = group('Men’s Breakfast', [personId('mark')])
    expect(groupsToJoin(sam, [first, his, last])).toEqual([first, last])
  })

  it('leaves out a group they lead, or are invited to lead', () => {
    const grace = person()
    expect(groupsToJoin(grace, [group('Grace’s Group', [grace.personId])])).toEqual([])
  })

  it('is nothing where the Ministry has no groups', () => {
    expect(groupsToJoin(person(), [])).toEqual([])
  })
})

describe('words that left the Roster (Manual pairing, ticket 07)', () => {
  it('keeps no sentence about the status chip, and never says Eligible to lead', () => {
    const said = Object.values(copy).flatMap((value) => (typeof value === 'string' ? [value] : []))
    expect(said.some((sentence) => /Status says whether/.test(sentence))).toBe(false)
    expect(said.some((sentence) => /eligible to lead/i.test(sentence))).toBe(false)
  })
})
