import { describe, expect, it } from 'vitest'
import { intendedPairingId, personId, relationshipId } from '~/domain/ids'
import { phoneNumber } from '~/domain/roster'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import { displayPhone, whoTheyAre } from '../../app/roster/copy'
import { isDiscipler, isDisciple, onList, rosterStats } from '../../app/roster/lists'

/**
 * Who is on which list, and the four numbers over each. Pure over the reader's
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

  it('is somebody an import paired as one, before either has completed Intake', () => {
    const planned = person({ participationStatus: 'no_intake_submitted', intendedPairings: [plan('leader')] })
    expect(isDiscipler(planned)).toBe(true)
    expect(isDisciple(planned)).toBe(false)
    expect(whoTheyAre(planned)).toBe('A Discipler - an import paired them as one, and disciples nobody yet')
  })
})

describe('the sentence on the person page', () => {
  // The page behind a name on the Disciplers list must say Discipler, whichever
  // of the three facts put them there, and the same for the Disciples list. So the
  // sentence is checked against the rule over every shape the rule reads, rather
  // than against a list of wordings.
  const shapes = [[], ['leader'], ['participant'], ['leader', 'participant']] as const

  it('agrees with the list the Person is on, over every shape of the facts', () => {
    for (const declaredSide of [null, 'mentor', 'mentee'] as const) {
      for (const held of shapes) {
        for (const planned of shapes) {
          const entry = person({
            declaredSide,
            relationships: held.map((role) => pairing(role)),
            intendedPairings: planned.map((role) => plan(role)),
          })
          const said = whoTheyAre(entry)
          const shape = `${declaredSide} holds ${held.join('+')} planned ${planned.join('+')}`
          expect(said.startsWith('A Discipler'), shape).toBe(isDiscipler(entry))
          expect(/\ba Disciple\b/i.test(said), shape).toBe(isDisciple(entry))
        }
      }
    }
  })

  it('lists every fact the word rests on', () => {
    const everything = person({
      declaredSide: 'mentor',
      relationships: [pairing('leader'), pairing('participant')],
      intendedPairings: [plan('leader'), plan('participant')],
    })
    expect(whoTheyAre(everything)).toBe(
      'A Discipler - disciples somebody, offered to on their Intake form, and an import paired them as one. '
        + 'Also a Disciple - being discipled, and an import paired them to be discipled.',
    )
    expect(whoTheyAre(person())).toBe('A Disciple - not yet paired')
    expect(whoTheyAre(person({ relationships: [pairing('participant')] }))).toBe('A Disciple - being discipled')
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
