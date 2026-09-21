import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext, type RelationshipSnapshot } from '~/domain/boundary'
import { createTestClock, days } from '~/domain/clock'
import { DepartureRefused, EndingRefused } from '~/domain/errors'
import {
  createSequentialIds,
  ministryId,
  personId,
  relationshipId,
  type PersonId,
} from '~/domain/ids'
import type { RelationshipOutcome } from '~/domain/relationships'

/**
 * Ending a relationship, and one Participant leaving one that continues without
 * them. Two acts on the same relationship, and the difference between them is the
 * whole ticket: an ending is a recorded outcome that closes every membership, and
 * a departure closes exactly one and leaves the relationship running.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const emily = personId('00000000-0000-4000-8000-0000000000e1')
const fiona = personId('00000000-0000-4000-8000-0000000000f1')

const createdAt = new Date('2026-03-02T09:00:00Z')
const acceptedAt = new Date(createdAt.getTime() + days(1))
const now = new Date(createdAt.getTime() + days(150))

const snapshot = (over: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
  relationshipId: relationship,
  createdAt,
  acceptedAt,
  endedAt: null,
  name: null,
  joinRequiresApproval: false,
  declaredGender: null,
  pause: null,
  members: [
    { personId: david, role: 'leader', fullName: 'David Ellis', phone: '+15550101', acceptedAt },
    { personId: emily, role: 'participant', fullName: 'Emily Johnson', phone: '+15550200', acceptedAt: null },
  ],
  ...over,
})

const context = (over: Partial<CommandContext> = {}): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(now),
  ids: createSequentialIds(),
  ...over,
})

const end = (
  over: {
    readonly relationship?: RelationshipSnapshot
    readonly reason?: string
    readonly outcome?: RelationshipOutcome
  } = {},
) =>
  handleCommand(
    {
      type: 'relationship.end',
      ministryId: ministry,
      relationshipId: relationship,
      reason: over.reason ?? 'They finished the material and both wanted to stop here.',
      outcome: over.outcome ?? 'completed',
      endedBy: 'admin-user-1',
    },
    context({ relationship: over.relationship ?? snapshot() }),
  )

const depart = (person: PersonId, relationshipSnapshot = snapshot()) =>
  handleCommand(
    {
      type: 'relationship.depart',
      ministryId: ministry,
      relationshipId: relationship,
      personId: person,
      departedBy: 'admin-user-1',
    },
    context({ relationship: relationshipSnapshot }),
  )

const grace = personId('00000000-0000-4000-8000-0000000000a1')

/** A group two Leaders lead, the second added since and, unless said otherwise, accepted. */
const coLed = ({ graceAcceptedAt = acceptedAt }: { readonly graceAcceptedAt?: Date | null } = {}) =>
  snapshot({
    members: [
      { personId: david, role: 'leader', fullName: 'David Ellis', phone: '+15550101', acceptedAt },
      { personId: grace, role: 'leader', fullName: 'Grace Lee', phone: '+15550102', acceptedAt: graceAcceptedAt },
      { personId: emily, role: 'participant', fullName: 'Emily Johnson', phone: '+15550200', acceptedAt: null },
      { personId: fiona, role: 'participant', fullName: 'Fiona Grant', phone: '+15550300', acceptedAt: null },
    ],
  })

/** A group: one Leader and three Participants, which two departures reduce to one. */
const group = () =>
  snapshot({
    members: [
      { personId: david, role: 'leader', fullName: 'David Ellis', phone: '+15550101', acceptedAt },
      { personId: emily, role: 'participant', fullName: 'Emily Johnson', phone: '+15550200', acceptedAt: null },
      { personId: fiona, role: 'participant', fullName: 'Fiona Grant', phone: '+15550300', acceptedAt: null },
    ],
  })

describe('ending a relationship', () => {
  it('closes every open membership on it, in one act', () => {
    const [effect] = end().effects
    if (effect?.kind !== 'relationship.end') throw new Error('nothing was ended')

    // One effect and not a membership close per Person: the relationship and
    // everyone in it leave together or not at all. Closing them is also the whole
    // of returning the Participants to the pool, because `participation_status`
    // reads open participant memberships.
    expect(effect.ending.memberIds).toEqual([david, emily])
    expect(effect.ending.endedAt).toEqual(now)
    expect(effect.ending.endedBy).toBe('admin-user-1')
  })

  it('records the outcome as well as the reason', () => {
    const [effect] = end({
      reason: 'The Participant moved away.',
      outcome: 'discontinued',
    }).effects
    if (effect?.kind !== 'relationship.end') throw new Error('nothing was ended')

    // Whether it completed or broke down is asked in counts, and free text cannot
    // be counted. Both are recorded; neither substitutes for the other.
    expect(effect.ending.outcome).toBe('discontinued')
    expect(effect.ending.reason).toBe('The Participant moved away.')
  })

  it('is recorded against the acting Admin, in history that outlives them', () => {
    const [, event] = end().effects
    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')

    expect(event.event.type).toBe('relationship.ended')
    expect(event.event.subjectId).toBe(relationship)
    expect(event.event.payload).toEqual({
      memberIds: [david, emily],
      reason: 'They finished the material and both wanted to stop here.',
      outcome: 'completed',
      endedBy: 'admin-user-1',
    })
  })

  it('tells nobody', () => {
    // No Admin action sends a message. An Admin who wants to say something to the
    // people in a relationship they have just ended picks up the phone.
    expect(end().effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
  })

  it('refuses a second ending, because Ended is terminal', () => {
    const ended = () => end({ relationship: snapshot({ endedAt: now }) })

    expect(ended).toThrow(EndingRefused)
    expect(ended).toThrow(expect.objectContaining({ refusal: 'ending.already_ended' }))
  })

  it('refuses one nobody has accepted, which is a cancellation', () => {
    // A relationship that never started cannot have completed, and withdrawing one
    // is `relationship.cancel` -- a different act, with no outcome to record.
    expect(() => end({ relationship: snapshot({ acceptedAt: null }) })).toThrow(
      expect.objectContaining({ refusal: 'ending.relationship_not_accepted' }),
    )
  })

  it('refuses a blank reason', () => {
    // The database refuses it too. Checked here as well because a command is built
    // from a request body, and a refusal is cheaper than a constraint violation.
    expect(() => end({ reason: '   ' })).toThrow(
      expect.objectContaining({ refusal: 'ending.reason_is_required' }),
    )
  })

  it('refuses an outcome that is not one of the two', () => {
    // `RelationshipOutcome` is a compile-time union and this command is built from
    // a request body, so nothing between the two has actually looked at the word.
    expect(() =>
      end({ outcome: 'went well' as unknown as RelationshipOutcome }),
    ).toThrow(expect.objectContaining({ refusal: 'ending.outcome_not_recognised' }))
  })

  it('ends a paused relationship without being asked to resume it first', () => {
    // Ending is the decision a Pause exists to defer, and a Ministry that has made
    // it should not have to restart somebody's check-ins for a moment to record it.
    const paused = snapshot({ pause: { pausedAt: acceptedAt, periodWeeks: 2 } })

    expect(end({ relationship: paused }).effects[0]?.kind).toBe('relationship.end')
  })
})

describe('one Participant leaving a relationship', () => {
  it('closes their membership and nobody else\'s', () => {
    const [effect] = depart(emily, group()).effects
    if (effect?.kind !== 'relationship.depart') throw new Error('nobody left')

    expect(effect.departure.personId).toBe(emily)
    expect(effect.departure.departedAt).toEqual(now)
    // Carried to the store as well as to history: a departure names its actor
    // against `ministry_member`, the way every other Admin act does.
    expect(effect.departure.departedBy).toBe('admin-user-1')
  })

  it('does not end the relationship for the others', () => {
    const effects = depart(emily, group()).effects

    // Nothing here ends anything. A relationship dropping from three Participants
    // to two changes nothing structurally -- it is the same relationship, with one
    // fewer Person in it.
    expect(effects.filter((effect) => effect.kind === 'relationship.end')).toEqual([])
    expect(effects.filter((effect) => effect.kind === 'relationship.cancel')).toEqual([])
  })

  it('records the departure as a dated fact against the relationship', () => {
    const [, event] = depart(emily, group()).effects
    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')

    expect(event.event.type).toBe('relationship.participant_departed')
    expect(event.event.subjectId).toBe(relationship)
    expect(event.event.payload).toEqual({
      personId: emily,
      departedBy: 'admin-user-1',
    })
  })

  it('tells nobody', () => {
    expect(
      depart(emily, group()).effects.filter((effect) => effect.kind === 'message.enqueue'),
    ).toEqual([])
  })

  it('refuses somebody who is not in the relationship', () => {
    expect(() => depart(fiona)).toThrow(
      expect.objectContaining({ refusal: 'departure.person_is_not_in_this_relationship' }),
    )
  })

  it('refuses the only Leader who has accepted, because a relationship without one is over', () => {
    // Removing the Leader does not leave a relationship that continues with
    // whoever remains. It is an ending, and an ending records an outcome.
    expect(() => depart(david, group())).toThrow(
      expect.objectContaining({ refusal: 'departure.would_leave_no_leader' }),
    )
    // A Leader invited since, who has not answered, leads nothing yet: she is not
    // somebody the group can be left with.
    expect(() => depart(david, coLed({ graceAcceptedAt: null }))).toThrow(
      expect.objectContaining({ refusal: 'departure.would_leave_no_leader' }),
    )
  })

  it('lets a Leader leave a relationship another Leader who has accepted goes on leading (James, 2026-09-21)', () => {
    const [effect, event] = depart(david, coLed()).effects
    if (effect?.kind !== 'relationship.depart') throw new Error('nobody left')
    if (event?.kind !== 'history.append') throw new Error('nothing was recorded')

    expect(effect.departure.personId).toBe(david)
    expect(effect.departure.departedBy).toBe('admin-user-1')
    // A fact of its own: a Leader leaving is not a Participant leaving, and history
    // is append-only, so the difference is said when it happens.
    expect(event.event.type).toBe('relationship.leader_departed')
    expect(event.event.payload).toEqual({ personId: david, departedBy: 'admin-user-1' })
    // Nothing ends, and nobody is told.
    expect(depart(david, coLed()).effects.map((each) => each.kind)).toEqual(['relationship.depart', 'history.append'])
  })

  it('refuses a Leader who has not accepted, whose way out is their invitation being withdrawn', () => {
    expect(() => depart(grace, coLed({ graceAcceptedAt: null }))).toThrow(
      expect.objectContaining({ refusal: 'departure.leader_has_not_accepted' }),
    )
  })

  it('refuses the last Participant, because that is an ending', () => {
    // A relationship with nobody being discipled is finished, and finishing one
    // is the act that records whether it completed or broke down.
    expect(() => depart(emily)).toThrow(
      expect.objectContaining({ refusal: 'departure.would_leave_no_participants' }),
    )
  })

  it('refuses a departure from a relationship that has ended', () => {
    expect(() => depart(emily, { ...group(), endedAt: now })).toThrow(
      DepartureRefused,
    )
  })

  it('lets a Participant out of a group nobody has accepted, which waits on with the rest (James, 2026-09-21)', () => {
    // Nothing has reached anybody, so there is nothing to take back: the Starter
    // Message is written from whoever is in it when it starts. Withdrawing the
    // whole of it is still a cancellation.
    const waiting = { ...group(), acceptedAt: null }
    const [effect] = depart(emily, waiting).effects
    if (effect?.kind !== 'relationship.depart') throw new Error('nobody left')
    expect(effect.departure.personId).toBe(emily)

    // And its last Participant still cannot leave it: that is the cancellation.
    expect(() => depart(emily, { ...snapshot(), acceptedAt: null })).toThrow(
      expect.objectContaining({ refusal: 'departure.would_leave_no_participants' }),
    )
  })
})
