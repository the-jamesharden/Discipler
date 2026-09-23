import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { REMOVE } from '../../app/roster/copy'
import { whatARemovalLetsGo } from '../../app/roster/removal'

/**
 * What removing a Person does to each pairing they hold, and what the question
 * says about each group (Remove from the Roster, ticket 01; James, 2026-09-22:
 * "include groups"). One rule for the question the page asks and the acts the
 * route takes.
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
  isAdmin: false,
  intendedPairings: [],
})

const held = (id: string, role: RosterRelationship['role'], over: Partial<RosterRelationship> = {}): RosterRelationship => ({
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

const group = { countsAsAGroup: true, participantCount: 2 }

describe('what a removal does to each pairing', () => {
  it('ends a group they lead alone, for everybody in it', () => {
    const ruth = person('Ruth Adeyemi', [
      held('table', 'leader', {
        ...group,
        name: 'Thursday Table',
        participantNames: ['Mia Chen', 'Zoe Park'],
        withNames: ['Mia Chen', 'Zoe Park'],
      }),
    ])
    const [only] = whatARemovalLetsGo([ruth], ruth)

    expect(only).toMatchObject({ act: 'end', isAGroup: true, endsFor: ['Mia Chen', 'Zoe Park'] })
    expect(REMOVE.whatHappensToAGroup(only!)).toBe('Thursday Table ends, and Mia Chen and Zoe Park go back to unpaired.')
  })

  it('takes a Disciple out of a group that goes on', () => {
    const mia = person('Mia Chen', [
      held('table', 'participant', {
        ...group,
        name: 'Thursday Table',
        leaderNames: ['Ruth Adeyemi'],
        participantNames: ['Zoe Park'],
        withNames: ['Ruth Adeyemi', 'Zoe Park'],
      }),
    ])
    const [only] = whatARemovalLetsGo([mia], mia)

    expect(only).toMatchObject({ act: 'leave', endsFor: [] })
    expect(REMOVE.whatHappensToAGroup(only!)).toBe('Thursday Table goes on without them.')
  })

  it('names a group nobody named by who else is in it', () => {
    const mia = person('Mia Chen', [
      held('table', 'participant', {
        ...group,
        leaderNames: ['Ruth Adeyemi'],
        participantNames: ['Zoe Park'],
        withNames: ['Ruth Adeyemi', 'Zoe Park'],
      }),
    ])
    expect(REMOVE.whatHappensToAGroup(whatARemovalLetsGo([mia], mia)[0]!)).toBe(
      'Their group with Ruth Adeyemi and Zoe Park goes on without them.',
    )
  })

  it('ends a group they are the last Disciple of, and its Discipler goes back to unpaired', () => {
    const zoe = person('Zoe Park', [
      held('table', 'participant', { countsAsAGroup: true, name: 'Thursday Table', leaderNames: ['Ruth Adeyemi'] }),
    ])
    expect(REMOVE.whatHappensToAGroup(whatARemovalLetsGo([zoe], zoe)[0]!)).toBe(
      'Thursday Table ends, and Ruth Adeyemi goes back to unpaired.',
    )
  })

  it('does not send a Discipler who leads another group back to unpaired', () => {
    const zoe = person('Zoe Park', [
      held('table', 'participant', { countsAsAGroup: true, name: 'Thursday Table', leaderNames: ['Ruth Adeyemi'] }),
    ])
    const ruth = person('Ruth Adeyemi', [
      held('table', 'leader', { countsAsAGroup: true, name: 'Thursday Table', participantNames: ['Zoe Park'] }),
      held('sunday', 'leader', { ...group, name: 'Sunday Circle', participantNames: ['Ana Ruiz', 'Ben Cole'] }),
    ])
    const [only] = whatARemovalLetsGo([zoe, ruth], zoe)

    expect(only).toMatchObject({ act: 'end', ends: true, endsFor: [] })
    expect(REMOVE.whatHappensToAGroup(only!)).toBe('Thursday Table ends.')
  })

  it('names only the Disciples a group leaves with no other pairing', () => {
    const ruth = person('Ruth Adeyemi', [
      held('table', 'leader', {
        ...group,
        name: 'Thursday Table',
        participantNames: ['Mia Chen', 'Zoe Park'],
        withNames: ['Mia Chen', 'Zoe Park'],
      }),
    ])
    const mia = person('Mia Chen', [
      held('table', 'participant', { ...group, name: 'Thursday Table', leaderNames: ['Ruth Adeyemi'] }),
      held('one', 'participant', { leaderNames: ['Grace Lee'] }),
    ])
    const zoe = person('Zoe Park', [
      held('table', 'participant', { ...group, name: 'Thursday Table', leaderNames: ['Ruth Adeyemi'] }),
      // Leading is another role: it does not keep her paired as a Disciple.
      held('lunch', 'leader', { leaderNames: [], participantNames: ['Ben Cole'] }),
    ])
    expect(REMOVE.whatHappensToAGroup(whatARemovalLetsGo([ruth, mia, zoe], ruth)[0]!)).toBe(
      'Thursday Table ends, and Zoe Park goes back to unpaired.',
    )
  })

  it('counts a pairing the same removal ends as gone', () => {
    const ruth = person('Ruth Adeyemi', [
      held('table', 'leader', { countsAsAGroup: true, name: 'Thursday Table', participantNames: ['Mia Chen'] }),
      held('one', 'leader', { participantNames: ['Mia Chen'] }),
    ])
    const mia = person('Mia Chen', [
      held('table', 'participant', { countsAsAGroup: true, name: 'Thursday Table', leaderNames: ['Ruth Adeyemi'] }),
      held('one', 'participant', { leaderNames: ['Ruth Adeyemi'] }),
    ])
    expect(REMOVE.whatHappensToAGroup(whatARemovalLetsGo([ruth, mia], ruth)[0]!)).toBe(
      'Thursday Table ends, and Mia Chen goes back to unpaired.',
    )
  })

  it('withdraws a group nobody has accepted that they are the last Disciple of, the line Unpair offers nothing on', () => {
    const zoe = person('Zoe Park', [
      held('table', 'participant', {
        countsAsAGroup: true,
        name: 'Thursday Table',
        leaderNames: ['Ruth Adeyemi'],
        awaitingAcceptance: true,
      }),
    ])
    expect(whatARemovalLetsGo([zoe], zoe)).toMatchObject([{ act: 'cancel', endsFor: ['Ruth Adeyemi'] }])
  })

  it('does not count a one-to-one as a group', () => {
    const emily = person('Emily Davis', [held('one', 'participant', { leaderNames: ['Grace Lee'] })])
    expect(whatARemovalLetsGo([emily], emily)).toMatchObject([{ act: 'end', isAGroup: false, endsFor: ['Grace Lee'] }])
  })
})
