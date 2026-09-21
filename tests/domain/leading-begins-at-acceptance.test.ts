import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import { eligibleFor, type KeywordRelationship } from '~/domain/keywords'
import { countsAsLeading } from '~/domain/relationships'
import { membersFrom, type HistoryInputs } from '~/platform/supabase/relationship-history'

/**
 * Manual pairing, ticket 22; decided by James on 2026-09-20. A leader membership
 * gives its holder nothing until they have accepted it themselves. An Admin can
 * add a Discipler to a group that is already running, which is the first
 * relationship that is accepted with a leader on it who is not.
 *
 * The rules are tested here with no database; that the reads feed them the right
 * facts is `tests/integration/leading-begins-at-acceptance.test.ts`.
 */

const accepted = '2026-03-02T09:00:00+00:00'

describe('who a relationship is said to be led by', () => {
  it('is everybody it waits on, while nobody has activated it', () => {
    expect(countsAsLeading(null, null)).toBe(true)
    expect(countsAsLeading(null, accepted)).toBe(true)
  })

  it('is only the leaders who have accepted, once it is running', () => {
    expect(countsAsLeading(accepted, accepted)).toBe(true)
    expect(countsAsLeading(accepted, null)).toBe(false)
  })
})

describe('the leaders an Admin’s tabs name', () => {
  const group = '00000000-0000-4000-8000-0000000000b1'
  const history = (relationshipAcceptedAt: string | null): HistoryInputs => ({
    timeZone: 'America/New_York',
    relationships: [{ id: group, accepted_at: relationshipAcceptedAt }],
    members: [
      { relationship_id: group, person_id: 'ruth', role: 'leader', accepted_at: relationshipAcceptedAt },
      { relationship_id: group, person_id: 'claire', role: 'leader', accepted_at: null },
      { relationship_id: group, person_id: 'emily', role: 'participant', accepted_at: null },
    ],
    people: [
      { id: 'ruth', full_name: 'Ruth Adeyemi' },
      { id: 'claire', full_name: 'Claire Martinez' },
      { id: 'emily', full_name: 'Emily Johnson' },
    ],
    weeks: [],
    concerns: [],
    pauses: [],
    answers: [],
    followUps: [],
  })

  it('leave out a leader added to a running group who has not accepted', () => {
    const members = membersFrom(history(accepted)).get(group)

    expect(members?.leaders).toEqual(['Ruth Adeyemi'])
    expect(members?.participants).toEqual(['Emily Johnson'])
    expect(members?.people.map((person) => person.personId)).toEqual(['ruth', 'emily'])
  })

  it('go on naming everybody an unactivated relationship is waiting for', () => {
    expect(membersFrom(history(null)).get(group)?.leaders).toEqual(['Claire Martinez', 'Ruth Adeyemi'])
  })

  it('refuse a document that says nothing about a leader’s own acceptance', () => {
    const drifted = history(accepted)
    const members = drifted.members.map(({ accepted_at: _dropped, ...row }) => row)

    expect(() => membersFrom({ ...drifted, members })).toThrow(/without its own acceptance/)
  })
})

/**
 * For whoever holds it, a relationship they lead and have not accepted reads as
 * awaiting acceptance, which is what the store hands the domain as a null
 * `acceptedAt`. The rules that already refuse a keyword there do the rest.
 */
describe('what a leader who has not accepted may do by text', () => {
  const held = (over: Partial<KeywordRelationship>): KeywordRelationship => ({
    relationshipId: relationshipId('00000000-0000-4000-8000-0000000000b1'),
    role: 'leader',
    startedAt: new Date('2026-03-01T09:00:00Z'),
    acceptedAt: null,
    endedAt: null,
    paused: false,
    members: [
      {
        personId: personId('00000000-0000-4000-8000-0000000000e1'),
        role: 'participant',
        fullName: 'Emily Johnson',
        phone: '+15550200001',
        reachable: true,
      },
    ],
    ...over,
  })

  it('not PAUSE a group they have not agreed to lead', () => {
    expect(eligibleFor('PAUSE', [held({})])).toEqual([])
  })

  it('not RESUME one either, though it is paused', () => {
    expect(eligibleFor('RESUME', [held({ paused: true })])).toEqual([])
    // A leader who has accepted still can.
    expect(
      eligibleFor('RESUME', [held({ paused: true, acceptedAt: new Date('2026-03-02T09:00:00Z') })]),
    ).toHaveLength(1)
  })

  it('SWAP, which from there is how a leader says no', () => {
    expect(eligibleFor('SWAP', [held({})])).toHaveLength(1)
  })
})
