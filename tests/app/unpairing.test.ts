import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { pairingLine, UNPAIR, UNPAIRED_BLANK_REASON } from '../../app/roster/copy'
import { unpairFor } from '../../app/roster/unpair'

/**
 * What Unpair does on one line of a person's Pairings card (James, 2026-09-21). The
 * button is one word and the model has three acts under it, so the rule that picks
 * between them is one pure function over the Roster: the page draws from it and the
 * route acts from it, and the two cannot disagree.
 */

const person = (fullName: string, relationships: readonly RosterRelationship[] = []): RosterEntry => ({
  personId: personId(`id-of-${fullName}`),
  fullName,
  participationStatus: 'paired',
  relationships,
  declaredSide: null,
  firstTime: null,
  holdsAnAccount: false,
  phone: null,
  email: null,
  gender: null,
  intendedPairings: [],
})

const held = (
  id: string,
  role: RosterRelationship['role'],
  over: Partial<RosterRelationship> = {},
): RosterRelationship => ({
  relationshipId: relationshipId(id),
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

describe('what Unpair does on a line', () => {
  it('ends a one-to-one that has started, and asks how it ended, from either person’s page', () => {
    const grace = person('Grace Lee', [held('one', 'leader', { participantNames: ['Emily Davis'] })])
    const emily = person('Emily Davis', [held('one', 'participant', { leaderNames: ['Grace Lee'] })])
    const roster = [grace, emily]

    expect(unpairFor(roster, grace, grace.relationships[0]!)).toEqual({ act: 'end', asks: 'outcome', endsItFor: ['Emily Davis'], ledOnBy: [] })
    expect(unpairFor(roster, emily, emily.relationships[0]!)).toEqual({ act: 'end', asks: 'outcome', endsItFor: ['Grace Lee'], ledOnBy: [] })
  })

  it('cancels a one-to-one nobody has accepted, in one press and asking nothing', () => {
    const grace = person('Grace Lee', [held('one', 'leader', { participantNames: ['Sam Lee'], awaitingAcceptance: true })])
    const sam = person('Sam Lee', [held('one', 'participant', { leaderNames: ['Grace Lee'], awaitingAcceptance: true })])
    const roster = [grace, sam]

    expect(unpairFor(roster, grace, grace.relationships[0]!)).toEqual({ act: 'cancel', asks: 'nothing', endsItFor: ['Sam Lee'], ledOnBy: [] })
    expect(unpairFor(roster, sam, sam.relationships[0]!)).toEqual({ act: 'cancel', asks: 'nothing', endsItFor: ['Grace Lee'], ledOnBy: [] })
  })

  it('takes one Disciple out of a group that goes on, in one press', () => {
    const group = { participantCount: 3, countsAsAGroup: true, leaderNames: ['Grace Lee'] }
    const mia = person('Mia Chen', [held('group', 'participant', { ...group, participantNames: ['Zoe Park', 'Ana Ruiz'] })])

    expect(unpairFor([mia], mia, mia.relationships[0]!)).toEqual({ act: 'leave', asks: 'nothing', endsItFor: [], ledOnBy: [] })
  })

  it('ends the group when the Disciple leaving is the last one in it', () => {
    // A group that has fallen to one Disciple is still a group, and nobody being
    // discipled is a relationship that is over: an ending, with its outcome.
    const mia = person('Mia Chen', [held('group', 'participant', { participantCount: 1, countsAsAGroup: true, leaderNames: ['Grace Lee'] })])

    expect(unpairFor([mia], mia, mia.relationships[0]!)).toEqual({ act: 'end', asks: 'outcome', endsItFor: ['Grace Lee'], ledOnBy: [] })
  })

  it('ends the whole group from the page of the one Discipler who leads it, naming who that is for', () => {
    const disciples = ['Ana Ruiz', 'Mia Chen', 'Zoe Park']
    const grace = person('Grace Lee', [held('group', 'leader', { participantCount: 3, countsAsAGroup: true, participantNames: disciples })])

    expect(unpairFor([grace], grace, grace.relationships[0]!)).toEqual({ act: 'end', asks: 'outcome', endsItFor: disciples, ledOnBy: [] })
  })

  it('confirms before cancelling a group nobody has accepted, because it is everybody’s', () => {
    const disciples = ['Ana Ruiz', 'Mia Chen']
    const grace = person('Grace Lee', [held('group', 'leader', { participantCount: 2, countsAsAGroup: true, participantNames: disciples, awaitingAcceptance: true })])
    const ana = person('Ana Ruiz', [held('group', 'participant', { participantCount: 2, countsAsAGroup: true, leaderNames: ['Grace Lee'], awaitingAcceptance: true })])

    expect(unpairFor([grace, ana], grace, grace.relationships[0]!)).toEqual({ act: 'cancel', asks: 'confirmation', endsItFor: disciples, ledOnBy: [] })
  })

  it('takes a Disciple out of a group nobody has accepted, which waits on with the rest', () => {
    const ana = person('Ana Ruiz', [held('group', 'participant', { participantCount: 2, countsAsAGroup: true, leaderNames: ['Grace Lee'], awaitingAcceptance: true })])
    expect(unpairFor([ana], ana, ana.relationships[0]!)).toEqual({ act: 'leave', asks: 'nothing', endsItFor: [], ledOnBy: [] })

    // Its last Disciple leaving is the whole of it being withdrawn, which is its Discipler's page's to do.
    const last = person('Mia Chen', [held('waiting', 'participant', { participantCount: 1, countsAsAGroup: true, leaderNames: ['Grace Lee'], awaitingAcceptance: true })])
    expect(unpairFor([last], last, last.relationships[0]!)).toBeNull()
  })

  it('takes a Discipler out of a group another who has accepted goes on leading, and says who', () => {
    const group = { participantCount: 2, countsAsAGroup: true, participantNames: ['Ana Ruiz', 'Mia Chen'] }
    const grace = person('Grace Lee', [held('group', 'leader', group)])
    const claire = person('Claire Martinez', [held('group', 'leader', group)])

    expect(unpairFor([grace, claire], grace, grace.relationships[0]!)).toEqual({
      act: 'leave',
      asks: 'confirmation',
      endsItFor: [],
      ledOnBy: ['Claire Martinez'],
    })
  })

  it('withdraws the invitation of a Discipler invited to a group that is already running', () => {
    const claire = person('Claire Martinez', [held('group', 'leader', { participantCount: 2, countsAsAGroup: true, awaitingAcceptance: true })])
    const ana = person('Ana Ruiz', [held('group', 'participant', { participantCount: 2, countsAsAGroup: true })])

    expect(unpairFor([claire, ana], claire, claire.relationships[0]!)).toEqual({ act: 'withdraw', asks: 'nothing', endsItFor: [], ledOnBy: [] })
  })

  it('still ends the group for a Discipler whose co-leader has not accepted, because she leads it alone', () => {
    const group = { participantCount: 2, countsAsAGroup: true, participantNames: ['Ana Ruiz', 'Mia Chen'] }
    const grace = person('Grace Lee', [held('group', 'leader', group)])
    const claire = person('Claire Martinez', [held('group', 'leader', { ...group, awaitingAcceptance: true })])
    const ana = person('Ana Ruiz', [held('group', 'participant', { participantCount: 2, countsAsAGroup: true })])

    expect(unpairFor([grace, claire, ana], grace, grace.relationships[0]!)?.act).toBe('end')
  })
})

describe('the words', () => {
  it('says Unpair, and a reason left blank is recorded in the product’s own sentence', () => {
    expect(UNPAIR.button).toBe('Unpair')
    expect(UNPAIRED_BLANK_REASON).toBe('Unpaired from the Roster.')
  })

  it('asks about a one-to-one by both names, and about a group by its name and who it ends for', () => {
    expect(UNPAIR.question({ person: 'Grace Lee', group: null, endsItFor: ['Emily Davis'], ledOnBy: [] })).toBe('Unpair Grace Lee and Emily Davis?')
    expect(UNPAIR.question({ person: 'Grace Lee', group: { name: 'Thursday Table' }, endsItFor: ['Ana Ruiz', 'Mia Chen', 'Zoe Park'], ledOnBy: [] })).toBe(
      'Unpair Grace Lee from Thursday Table? It ends for Ana Ruiz, Mia Chen and Zoe Park too.',
    )
    // A group nobody has named is this group: the line it sits on says who is in it.
    expect(UNPAIR.question({ person: 'Grace Lee', group: { name: null }, endsItFor: ['Ana Ruiz', 'Mia Chen'], ledOnBy: [] })).toBe(
      'Unpair Grace Lee from this group? It ends for Ana Ruiz and Mia Chen too.',
    )
  })

  it('says who goes on leading a group a Discipler is taken out of', () => {
    expect(UNPAIR.question({ person: 'Grace Lee', group: { name: 'Thursday Table' }, endsItFor: [], ledOnBy: ['Claire Martinez'] })).toBe(
      'Unpair Grace Lee from Thursday Table? Claire Martinez goes on leading it.',
    )
  })

  it('names a group on the line about it, and says a one-to-one as it always did', () => {
    expect(pairingLine({ role: 'leader', names: ['Emily Davis'], groupName: null })).toBe('Discipling Emily Davis')
    expect(pairingLine({ role: 'participant', names: ['Grace Lee'], groupName: null })).toBe('Discipled by Grace Lee')
    expect(pairingLine({ role: 'leader', names: ['Ana Ruiz', 'Mia Chen'], groupName: 'Thursday Table' })).toBe(
      'Discipling Thursday Table: Ana Ruiz, Mia Chen',
    )
    expect(pairingLine({ role: 'participant', names: ['Grace Lee'], groupName: 'Thursday Table' })).toBe(
      'Discipled by Grace Lee in Thursday Table',
    )
  })
})
