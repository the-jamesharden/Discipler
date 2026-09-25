import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { inPairingOrder } from '../../app/roster/lists'
import { tagsOnAPersonsPage } from '../../app/roster/tags'

/**
 * What a person's page says they do, one tag per open pairing and per group, each
 * with its direction (Roles per pairing, ticket 03). No single word says what a
 * person is: Emily disciples Chloe and is discipled by Grace, and her page says
 * both. Pure over the reader's own type, so it is driven with no database near it.
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

const held = (role: RosterRelationship['role'], over: Partial<RosterRelationship> = {}): RosterRelationship => ({
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

/** A tag as it reads on the page: its direction, then who. */
const read = (entry: RosterEntry): string[] =>
  tagsOnAPersonsPage(entry).map((tag) => (tag.kind === 'pairing' ? `${tag.direction} ${tag.who}` : tag.said))

const disciplesChloe = held('leader', { participantNames: ['Chloe Park'], leaderNames: ['Emily Davis'] })
const discipledByGrace = held('participant', { leaderNames: ['Grace Lee'], participantNames: ['Emily Davis'] })
const leadsTuesday = held('leader', {
  name: 'Tuesday Women’s',
  leaderNames: ['Grace Lee'],
  participantNames: ['Hannah Brooks', 'Lily Evans'],
  participantCount: 2,
  countsAsAGroup: true,
})
const inTuesday = held('participant', {
  name: 'Tuesday Women’s',
  leaderNames: ['Grace Lee'],
  participantNames: ['Hannah Brooks', 'Lily Evans'],
  participantCount: 2,
  countsAsAGroup: true,
})

describe('the tags under a person’s name', () => {
  it('says both directions for somebody on both sides of two pairings', () => {
    expect(read(person({ participationStatus: 'paired', relationships: [disciplesChloe, discipledByGrace] }))).toEqual([
      'disciples Chloe Park',
      'discipled by Grace Lee',
    ])
  })

  it('names a group by its name, led or joined, and draws it apart from a one-to-one', () => {
    const grace = person({ relationships: [disciplesChloe, leadsTuesday] })
    expect(read(grace)).toEqual(['disciples Chloe Park', 'leads Tuesday Women’s'])
    expect(tagsOnAPersonsPage(grace).map((tag) => tag.kind === 'pairing' && tag.isAGroup)).toEqual([false, true])

    const hannah = person({ participationStatus: 'paired', relationships: [discipledByGrace, inTuesday] })
    expect(read(hannah)).toEqual(['discipled by Grace Lee', 'in Tuesday Women’s'])
    expect(tagsOnAPersonsPage(hannah).map((tag) => tag.kind === 'pairing' && tag.isAGroup)).toEqual([false, true])
  })

  it('names a group nobody named by its people when leading it, and by whose group it is when in it', () => {
    const unnamed = { name: null, participantCount: 3, countsAsAGroup: true }
    expect(
      read(person({ relationships: [held('leader', { ...unnamed, participantNames: ['Ana Ruiz', 'Mia Chen', 'Zoe Park'] })] })),
    ).toEqual(['leads Ana Ruiz, Mia Chen and Zoe Park'])
    expect(
      read(person({ relationships: [held('participant', { ...unnamed, leaderNames: ['Grace Lee'] })] })),
    ).toEqual(['in Grace Lee’s group'])
  })

  it('calls a pairing what its live count says, as the size pill does, whatever it was formed as', () => {
    // ADR-0004: a group that has fallen to one Disciple still counts against the
    // group cap, and is still called what the live count says.
    const fallenToOne = held('leader', {
      name: 'Tuesday Women’s',
      participantNames: ['Hannah Brooks'],
      participantCount: 1,
      countsAsAGroup: true,
    })
    const tags = tagsOnAPersonsPage(person({ relationships: [fallenToOne] }))
    expect(read(person({ relationships: [fallenToOne] }))).toEqual(['disciples Hannah Brooks'])
    expect(tags.map((tag) => tag.kind === 'pairing' && tag.isAGroup)).toEqual([false])
  })

  it('tags a pairing still awaiting acceptance, on either side', () => {
    expect(read(person({ relationships: [{ ...disciplesChloe, awaitingAcceptance: true }] }))).toEqual([
      'disciples Chloe Park',
    ])
    expect(read(person({ relationships: [{ ...discipledByGrace, awaitingAcceptance: true }] }))).toEqual([
      'discipled by Grace Lee',
    ])
  })

  it('has no tag at all for somebody holding no pairing', () => {
    expect(tagsOnAPersonsPage(person())).toEqual([])
    // What they said on the form is said under At Intake, never as a tag.
    expect(tagsOnAPersonsPage(person({ declaredSide: 'mentor' }))).toEqual([])
  })

  it('still tags Awaiting Intake and Opted out, as the Roster does, ahead of any pairing', () => {
    expect(read(person({ participationStatus: 'no_intake_submitted' }))).toEqual(['Awaiting Intake'])
    expect(read(person({ participationStatus: 'opted_out', relationships: [discipledByGrace] }))).toEqual([
      'Opted out',
      'discipled by Grace Lee',
    ])
    // Ready to Pair and Paired are no tag: the tags say what they do instead.
    expect(read(person({ participationStatus: 'paired', relationships: [discipledByGrace] }))).toEqual([
      'discipled by Grace Lee',
    ])
  })
})

describe('the order a person’s pairings are said in', () => {
  it('puts what they lead first, and within each side the one-to-ones before the groups', () => {
    // The reader sorts by the other people's names, which puts Hannah's group (Grace
    // Lee, Lily Evans) before Rachel Adams; the page says the one-to-one first, as
    // the mock-ups draw it.
    const byRachel = held('participant', { leaderNames: ['Rachel Adams'], withNames: ['Rachel Adams'] })
    const group = { ...inTuesday, withNames: ['Grace Lee', 'Lily Evans'] }
    expect(inPairingOrder([group, byRachel, discipledByGrace, leadsTuesday, disciplesChloe])).toEqual([
      disciplesChloe,
      leadsTuesday,
      byRachel,
      discipledByGrace,
      group,
    ])
  })
})
