import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import { phoneNumber } from '~/domain/roster'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { displayPhone } from '../../app/roster/copy'
import { isDiscipler, isDisciple, onList, rosterStats } from '../../app/roster/lists'

/**
 * Who is on which list, and the four numbers over each. Pure over the reader's
 * own type, so the rule is driven with no database anywhere near it.
 *
 * A Discipler is a fact, never a mark (ticket 36): leads somebody, or offered to
 * on the Intake form. Everyone else is a Disciple, and a person may be both.
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
})

describe('the four numbers over a list', () => {
  it('counts paired as an open pairing in that role, and unpaired as the rest', () => {
    const people = [
      person({ relationships: [pairing('leader')] }),
      person({ declaredSide: 'mentor' }),
      person({ declaredSide: 'mentor', relationships: [pairing('leader', { participantCount: 3 })] }),
    ]
    expect(rosterStats('disciplers', people)).toEqual({ total: 3, paired: 2, unpaired: 1, inGroups: 1 })
  })

  it('counts in groups from the live number of disciples, never from a kind', () => {
    const people = [
      person({ relationships: [pairing('participant', { participantCount: 1 })] }),
      person({ relationships: [pairing('participant', { participantCount: 4 })] }),
      person(),
    ]
    expect(rosterStats('disciples', people)).toEqual({ total: 3, paired: 2, unpaired: 1, inGroups: 1 })
  })

  it('counts a person once however many pairings they hold', () => {
    const busy = person({
      relationships: [pairing('leader'), pairing('leader', { participantCount: 2 }), pairing('leader', { participantCount: 5 })],
    })
    expect(rosterStats('disciplers', [busy])).toEqual({ total: 1, paired: 1, unpaired: 0, inGroups: 1 })
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
