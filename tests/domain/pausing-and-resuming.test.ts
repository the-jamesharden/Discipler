import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type CommandContext,
  type PausedRelationship,
  type RelationshipMember,
  type RelationshipSnapshot,
} from '~/domain/boundary'
import { createTestClock, weeks } from '~/domain/clock'
import { PauseRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import {
  DEFAULT_PAUSE_PERIOD_WEEKS,
  PAUSE_PERIODS,
  pauseExpiresAt,
  type PausePeriodWeeks,
} from '~/domain/pause'

/**
 * Pause and resume, as an Admin performs them. Everything below advances a test
 * clock rather than waiting, which is the only reason a twelve-week pause can be
 * asserted in a millisecond.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const emily = personId('00000000-0000-4000-8000-0000000000e1')

const createdAt = new Date('2026-03-02T09:00:00Z')
const acceptedAt = new Date('2026-03-03T09:00:00Z')
const now = new Date('2026-04-01T09:00:00Z')

const leader: RelationshipMember = {
  personId: david,
  role: 'leader',
  fullName: 'David Ellis',
  phone: '+15550101',
  liveToken: null,
}

const participant: RelationshipMember = {
  personId: emily,
  role: 'participant',
  fullName: 'Emily Johnson',
  phone: '+15550200',
  liveToken: invitationToken('emily-token'),
}

const snapshot = (over: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
  relationshipId: relationship,
  createdAt,
  acceptedAt,
  endedAt: null,
  members: [leader, participant],
  pause: null,
  ...over,
})

const context = (relationshipSnapshot: RelationshipSnapshot, at = now): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  appBaseUrl: 'https://discipler.example',
  relationship: relationshipSnapshot,
})

const pause = (
  over: Partial<RelationshipSnapshot> = {},
  periodWeeks?: PausePeriodWeeks,
  at = now,
) =>
  handleCommand(
    {
      type: 'relationship.pause',
      ministryId: ministry,
      relationshipId: relationship,
      ...(periodWeeks === undefined ? {} : { periodWeeks }),
      pausedBy: 'admin-user-1',
    },
    context(snapshot(over), at),
  )

const resume = (over: Partial<RelationshipSnapshot> = {}, at = now) =>
  handleCommand(
    {
      type: 'relationship.resume',
      ministryId: ministry,
      relationshipId: relationship,
      resumedBy: 'admin-user-1',
    },
    context(snapshot({ pause: { pausedAt: now, periodWeeks: 2 }, ...over }), at),
  )

type Result = ReturnType<typeof pause>

const messages = (result: Result) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'message.enqueue' ? [effect.message] : [],
  )

const events = (result: Result) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'history.append' ? [effect.event] : [],
  )

describe('an Admin pausing a relationship', () => {
  it('records the pause against the relationship, with the period selected', () => {
    const [event, ...rest] = events(pause({}, 8))

    expect(event).toMatchObject({
      type: 'relationship.paused',
      subjectType: 'relationship',
      subjectId: relationship,
      occurredAt: now,
      payload: { periodWeeks: 8, pausedBy: 'admin-user-1' },
    })
    expect(rest).toEqual([])
  })

  it('runs for two weeks when the Admin names no period', () => {
    expect(events(pause())[0]?.payload).toMatchObject({
      periodWeeks: DEFAULT_PAUSE_PERIOD_WEEKS,
    })
    expect(DEFAULT_PAUSE_PERIOD_WEEKS).toBe(2)
  })

  it('accepts each of the five periods and no others', () => {
    for (const period of PAUSE_PERIODS) {
      expect(events(pause({}, period))[0]?.payload).toMatchObject({ periodWeeks: period })
    }
    expect(PAUSE_PERIODS).toEqual([1, 2, 4, 8, 12])
  })

  it('tells nobody', () => {
    // A pause is an Admin acting on something they were told offline. Discipler
    // stops asking; it does not announce that it has stopped.
    expect(messages(pause())).toEqual([])
  })

  it('changes no membership, so nobody returns to the suggestion pool', () => {
    // Membership is what `participation_status` reads, and the participation caps
    // read it too. A pause that closed one would return a Participant to the pool
    // without anybody asking them.
    expect(
      pause().effects.filter(
        (effect) =>
          effect.kind === 'relationship.cancel' || effect.kind === 'relationship.create',
      ),
    ).toEqual([])
  })

  it('refuses a relationship no Leader has accepted yet', () => {
    // It has sent no check-ins and accrued no silence. There is nothing to suspend,
    // and `Awaiting Leader Acceptance` is the state it should still read as.
    expect(() => pause({ acceptedAt: null })).toThrow(
      new PauseRefused('pause.relationship_not_accepted'),
    )
  })

  it('refuses a relationship that has ended', () => {
    expect(() => pause({ endedAt: new Date('2026-03-20T09:00:00Z') })).toThrow(
      new PauseRefused('pause.relationship_ended'),
    )
  })

  it('refuses to pause one that is already paused', () => {
    // The second pause would silently reset the clock on the first, so a fortnight
    // away would become a fortnight from whenever somebody last clicked.
    expect(() => pause({ pause: { pausedAt: createdAt, periodWeeks: 2 } })).toThrow(
      new PauseRefused('pause.already_paused'),
    )
  })
})

describe('when a pause runs out', () => {
  it('is measured from the moment it was taken, in whole weeks', () => {
    expect(pauseExpiresAt({ pausedAt: now, periodWeeks: 1 })).toEqual(
      new Date(now.getTime() + weeks(1)),
    )
    expect(pauseExpiresAt({ pausedAt: now, periodWeeks: 12 })).toEqual(
      new Date(now.getTime() + weeks(12)),
    )
  })
})

describe('an Admin resuming a paused relationship', () => {
  const later = new Date(now.getTime() + weeks(1))

  it('records the resume, with the period it is ending', () => {
    const [event] = events(resume({ pause: { pausedAt: now, periodWeeks: 4 } }, later))

    expect(event).toMatchObject({
      type: 'relationship.resumed',
      subjectType: 'relationship',
      subjectId: relationship,
      occurredAt: later,
      payload: { periodWeeks: 4, resumedBy: 'admin-user-1', expired: false },
    })
  })

  it('says whether the period had already run out when the Admin acted', () => {
    const [event] = events(
      resume({ pause: { pausedAt: now, periodWeeks: 1 } }, new Date(now.getTime() + weeks(3))),
    )

    expect(event?.payload).toMatchObject({ expired: true })
  })

  it('releases the Starter Message to everyone in the relationship', () => {
    const released = messages(resume({}, later))

    expect(released).toMatchObject([
      { personId: david, toPhone: '+15550101', disclosesPersonId: null },
      { personId: emily, toPhone: '+15550200', disclosesPersonId: david },
    ])
    expect(released[0]?.body).toContain('Emily Johnson')
    expect(released[1]?.body).toContain('https://discipler.example/invitation/emily-token')
    expect(released.every((message) => message.enqueuedAt.getTime() === later.getTime())).toBe(true)
  })

  it('reuses the decline link the Participant already holds', () => {
    // A Participant holds at most one live Invitation Link per relationship, and
    // minting a second one on every resume would be refused by the index that
    // says so.
    expect(
      resume({}, later).effects.filter((effect) => effect.kind === 'invitation.issue'),
    ).toEqual([])
  })

  it('issues a decline link for a Participant holding none', () => {
    const withoutOne = resume(
      { members: [leader, { ...participant, liveToken: null }] },
      later,
    )

    const issued = withoutOne.effects.flatMap((effect) =>
      effect.kind === 'invitation.issue' ? [effect.invitation] : [],
    )

    expect(issued).toMatchObject([{ personId: emily, relationshipId: relationship }])
    expect(messages(withoutOne)[1]?.body).toContain(issued[0]!.token)
  })

  it('refuses a relationship that is not paused', () => {
    expect(() => resume({ pause: null })).toThrow(new PauseRefused('pause.not_paused'))
  })

  it('refuses a relationship that has ended', () => {
    expect(() => resume({ endedAt: new Date('2026-03-20T09:00:00Z') })).toThrow(
      new PauseRefused('pause.relationship_ended'),
    )
  })

  it('resolves no Follow-Up Item on its own', () => {
    // An expired pause is a Follow-Up Item, and a Follow-Up Item closes when an
    // Admin resolves it and at no other time -- the same as a relationship being
    // cancelled, which does not close the item that surfaced it either.
    expect(
      resume({}, later).effects.filter((effect) => effect.kind === 'followUp.resolve'),
    ).toEqual([])
  })
})

/**
 * A period running out, seen by the tick. It is the one rule in this ticket that
 * nobody triggers: it happens because a date passed, which is exactly why it is
 * driven against a clock rather than waited for.
 */

const standing = (over: Partial<PausedRelationship> = {}): PausedRelationship => ({
  relationshipId: relationship,
  pausedAt: now,
  periodWeeks: 2,
  itemStandsOpen: false,
  ...over,
})

const tick = (at: Date, pauses: readonly PausedRelationship[] = [standing()]) =>
  handleCommand(
    { type: 'scheduled.tick', ministryId: ministry },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      ministryName: 'Riverside Chapel',
      appBaseUrl: 'https://discipler.example',
      unaccepted: [],
      checkInsDue: [],
      paused: pauses,
    } satisfies CommandContext,
  )

const raised = (result: Result) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'followUp.raise' ? [effect.item] : [],
  )

describe('a pause period running out', () => {
  const almost = new Date(now.getTime() + weeks(2) - 1)
  const elapsed = new Date(now.getTime() + weeks(2))

  it('raises nothing until the period has actually run out', () => {
    expect(raised(tick(almost))).toEqual([])
    expect(raised(tick(elapsed))).toHaveLength(1)
  })

  it('raises an item naming the period that was selected', () => {
    expect(raised(tick(elapsed, [standing({ periodWeeks: 12 })]))).toEqual([])

    const [item] = raised(tick(new Date(now.getTime() + weeks(12)), [standing({ periodWeeks: 12 })]))

    expect(item).toMatchObject({
      kind: 'pause_expired',
      relationshipId: relationship,
      // The relationship's, not any one Leader's: a group whose pause has run out
      // is one thing for an Admin to act on.
      personId: null,
      periodWeeks: 12,
    })
  })

  it('sends nothing', () => {
    // Nobody's check-ins restart on a date they have forgotten, so nobody is
    // texted about one either.
    expect(messages(tick(elapsed))).toEqual([])
  })

  it('changes no state -- the relationship stays paused', () => {
    // The tick's whole output is the item and the event beside it. Nothing here
    // resumes anything, and there is no `relationship.resumed` for it to append.
    expect(events(tick(elapsed)).map((event) => event.type)).toEqual([
      'follow_up.pause_expired',
    ])
  })

  it('records when it ran out, not when the tick noticed', () => {
    // A scheduler that was down for a day raises this late. The date an Admin is
    // reviewing is the pause's, not the outage's.
    const late = new Date(now.getTime() + weeks(3))

    expect(events(tick(late))[0]?.payload).toEqual({
      periodWeeks: 2,
      expiredAt: elapsed.toISOString(),
    })
  })

  it('says nothing further while the Admin already has the item open', () => {
    // Raising it again tomorrow tells them nothing they are not already looking
    // at, and the history event beside it would become a row a day.
    expect(tick(elapsed, [standing({ itemStandsOpen: true })]).effects).toEqual([])
  })

  it('raises nothing for a Ministry with nothing paused', () => {
    expect(tick(elapsed, []).effects).toEqual([])
  })

  it('refuses to run against a Ministry whose pauses were never loaded', () => {
    // Absent and empty are the same value and opposite facts, and one of them
    // silently lets every pause in the Ministry run out unnoticed.
    expect(() =>
      handleCommand(
        { type: 'scheduled.tick', ministryId: ministry },
        {
          ministryId: ministry,
          clock: createTestClock(elapsed),
          ids: createSequentialIds(),
          ministryName: 'Riverside Chapel',
          appBaseUrl: 'https://discipler.example',
          unaccepted: [],
          checkInsDue: [],
        },
      ),
    ).toThrow('no pauses to evaluate')
  })
})
