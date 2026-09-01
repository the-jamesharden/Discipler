import { describe, expect, it } from 'vitest'
import { roleNoun } from '~/domain/ministry-settings'
import {
  handleCommand,
  type InvitationSnapshot,
  type InvitedMember,
  type RelationshipMember,
  type RelationshipSnapshot,
} from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { MaterialAssignmentRefused } from '~/domain/errors'
import {
  createSequentialIds,
  materialId,
  ministryId,
  personId,
  relationshipId,
} from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import {
  materialForWeek,
  materialInUseAt,
  type MaterialPeriod,
} from '~/domain/materials'

/**
 * The attribution rule, driven directly as the pure function it is. Which Material
 * a week belongs to is arithmetic over dated periods, and every case below --
 * including a Material changed in the middle of a week -- is decided here with no
 * database anywhere near it.
 */

const romans = materialId('00000000-0000-4000-8000-00000000ma01')
const johnsGospel = materialId('00000000-0000-4000-8000-00000000ma02')

const acceptedAt = new Date('2026-03-02T09:00:00Z')

/** The period acceptance opens: a real period, with no Material in it. */
const opening = (endedAt: Date | null = null): MaterialPeriod => ({
  materialId: null,
  title: null,
  startedAt: acceptedAt,
  endedAt,
})

const period = (
  material: typeof romans,
  title: string,
  startedAt: Date,
  endedAt: Date | null = null,
): MaterialPeriod => ({ materialId: material, title, startedAt, endedAt })

describe('which Material was in use at an instant', () => {
  it('is the one whose period contains it', () => {
    const changedAt = new Date('2026-04-06T09:00:00Z')
    const periods = [
      opening(changedAt),
      period(romans, 'Romans', changedAt),
    ]

    expect(materialInUseAt(periods, new Date('2026-03-16T09:00:00Z'))?.materialId).toBeNull()
    expect(materialInUseAt(periods, new Date('2026-04-20T09:00:00Z'))?.materialId).toBe(romans)
  })

  it('is the period that has begun and not the one that has ended, at the instant they meet', () => {
    const changedAt = new Date('2026-04-06T09:00:00Z')
    const periods = [opening(changedAt), period(romans, 'Romans', changedAt)]

    // Half-open: a period runs up to the instant the next one starts and not
    // through it, which is what makes an instant belong to exactly one period.
    expect(materialInUseAt(periods, changedAt)?.materialId).toBe(romans)
  })

  it('is nothing before the first period begins, because no week exists then', () => {
    expect(materialInUseAt([opening()], new Date('2026-03-01T09:00:00Z'))).toBeNull()
  })

  it('reads a period with an open end as running from its start onwards', () => {
    expect(materialInUseAt([opening()], new Date('2030-01-01T09:00:00Z'))?.title).toBeNull()
  })

  it('never answers with a zero-length period', () => {
    // A Material assigned at the instant of acceptance closes the opening period
    // at its own start. It covers no instant at all, which is the whole reason it
    // is permitted rather than refused.
    const periods = [opening(acceptedAt), period(romans, 'Romans', acceptedAt)]

    expect(materialInUseAt(periods, acceptedAt)?.materialId).toBe(romans)
  })

  it('reads periods in whatever order they arrive', () => {
    const changedAt = new Date('2026-04-06T09:00:00Z')
    const periods = [period(romans, 'Romans', changedAt), opening(changedAt)]

    expect(materialInUseAt(periods, new Date('2026-03-16T09:00:00Z'))?.materialId).toBeNull()
  })
})

describe('which Material a week belongs to', () => {
  const openedAt = new Date('2026-04-06T09:00:00Z')

  it('is the one assigned when the check-in was answered', () => {
    const changedAt = new Date('2026-04-07T14:00:00Z')
    const periods = [opening(changedAt), period(romans, 'Romans', changedAt)]

    // Asked Monday, answered Tuesday afternoon, and the Material changed Tuesday
    // lunchtime. The meeting being reported on is the one under Romans.
    expect(
      materialForWeek(periods, {
        openedAt,
        firstAnsweredAt: new Date('2026-04-07T18:00:00Z'),
      })?.materialId,
    ).toBe(romans)
  })

  it('never splits a week across two Materials', () => {
    const changedAt = new Date('2026-04-07T14:00:00Z')
    const periods = [opening(changedAt), period(romans, 'Romans', changedAt)]

    // The same week, answered before the change rather than after it. One
    // Material, whichever it is -- the week is never divided between them.
    const answered = materialForWeek(periods, {
      openedAt,
      firstAnsweredAt: new Date('2026-04-07T09:00:00Z'),
    })

    expect(answered?.materialId).toBeNull()
  })

  it('is the Material in use when the reporting began, not when it finished', () => {
    // A check-in is several messages -- did you meet, how was it -- and a Material
    // changed between two of them must not move the week. The meeting being
    // reported on is the one the Leader started reporting.
    const changedAt = new Date('2026-04-07T12:00:00Z')
    const periods = [opening(changedAt), period(romans, 'Romans', changedAt)]

    expect(
      materialForWeek(periods, {
        openedAt,
        firstAnsweredAt: new Date('2026-04-07T11:00:00Z'),
      })?.materialId,
    ).toBeNull()
  })

  it('attributes a week nobody answered to the Material in use when it was asked', () => {
    const changedAt = new Date('2026-04-08T09:00:00Z')
    const periods = [opening(changedAt), period(romans, 'Romans', changedAt)]

    expect(
      materialForWeek(periods, { openedAt, firstAnsweredAt: null })?.materialId,
    ).toBeNull()
  })

  it('answers "none" for a week before anything was assigned, rather than answering nothing', () => {
    // The distinction the opening period exists for: *no Material was in use* is a
    // fact, and no row at all is indistinguishable from a defect.
    const week = materialForWeek([opening()], { openedAt, firstAnsweredAt: null })

    expect(week).not.toBeNull()
    expect(week?.materialId).toBeNull()
    expect(week?.title).toBeNull()
  })

  it('follows the Material through a second change', () => {
    const first = new Date('2026-03-16T09:00:00Z')
    const second = new Date('2026-05-04T09:00:00Z')
    const periods = [
      opening(first),
      period(romans, 'Romans', first, second),
      period(johnsGospel, "John's Gospel", second),
    ]

    expect(
      materialForWeek(periods, {
        openedAt: second,
        firstAnsweredAt: new Date('2026-05-05T09:00:00Z'),
      })?.title,
    ).toBe("John's Gospel")
  })
})

describe('a relationship identifier is not a material identifier', () => {
  it('brands them apart', () => {
    // The brand exists at compile time only; this is here so the ids module keeps
    // a runtime constructor for Materials alongside the others.
    expect(materialId('00000000-0000-4000-8000-00000000ma01')).not.toBe(
      relationshipId('00000000-0000-4000-8000-0000000000bb'),
    )
  })
})

/**
 * The two acts that write a period: a relationship activating, which opens the
 * one with no Material in it, and an Admin assigning, which closes it.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const sarah = personId('00000000-0000-4000-8000-0000000000d2')
const emily = personId('00000000-0000-4000-8000-0000000000e1')

const token = invitationToken('a-token')
const now = new Date('2026-04-06T09:00:00Z')

const invitedLeader = (
  id: typeof david,
  fullName: string,
  agreed: Date | null = null,
): InvitedMember => ({
  personId: id,
  role: 'leader',
  fullName,
  phone: `+1555010${id.slice(-1)}`,
  acceptedAt: agreed,
})

const invitation = (over: Partial<InvitationSnapshot> = {}): InvitationSnapshot => ({
  relationshipId: relationship,
  personId: david,
  expiresAt: new Date('2026-03-16T09:00:00Z'),
  consumedAt: null,
  members: [
    invitedLeader(david, 'David Ellis'),
    {
      personId: emily,
      role: 'participant',
      fullName: 'Emily Johnson',
      phone: '+15550200',
      acceptedAt: null,
    },
  ],
  ...over,
})

const accept = (snapshot = invitation(), at = acceptedAt) =>
  handleCommand(
    {
      type: 'relationship.accept',
      ministryId: ministry,
      token,
      fullName: 'David Ellis',
      userId: 'user-1',
    },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      ministryName: 'Riverside Chapel',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
      appBaseUrl: 'https://discipler.example',
      invitation: snapshot,
    },
  )

const member = (id: typeof david, role: 'leader' | 'participant'): RelationshipMember => ({
  personId: id,
  role,
  fullName: 'A Person',
  phone: '+15550101',
})

const relationshipSnapshot = (
  over: Partial<RelationshipSnapshot> = {},
): RelationshipSnapshot => ({
  relationshipId: relationship,
  createdAt: new Date('2026-03-01T09:00:00Z'),
  acceptedAt,
  endedAt: null,
  name: null,
  joinRequiresApproval: false,
  declaredGender: null,
  pause: null,
  members: [member(david, 'leader'), member(emily, 'participant')],
  ...over,
})

const assign = (
  over: Partial<RelationshipSnapshot> = {},
  material = romans,
  at = now,
) =>
  handleCommand(
    {
      type: 'relationship.assign_material',
      ministryId: ministry,
      relationshipId: relationship,
      materialId: material,
      assignedBy: 'admin-user-1',
    },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      relationship: relationshipSnapshot(over),
    },
  )

type Result = ReturnType<typeof assign>

const assignments = (result: Result) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'material.assign' ? [effect.assignment] : [],
  )

const events = (result: Result) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'history.append' ? [effect.event] : [],
  )

describe('the period a relationship opens with', () => {
  it('is opened by acceptance, with no Material in it', () => {
    expect(assignments(accept())).toEqual([
      {
        ministryId: ministry,
        relationshipId: relationship,
        materialId: null,
        assignedAt: acceptedAt,
        assignedBy: null,
      },
    ])
  })

  it('starts when the relationship was accepted, not when it was created', () => {
    // No check-in week exists before acceptance, so a period covering time no
    // meeting could be reported in would be noise in every report.
    expect(assignments(accept())[0]?.assignedAt).toEqual(acceptedAt)
  })

  it('is not opened by a Leader whose co-leader has not agreed yet', () => {
    // The relationship has not activated, so nothing has started -- and a second
    // period opened by the second acceptance would overlap the first.
    const waiting = invitation({
      members: [
        invitedLeader(david, 'David Ellis'),
        invitedLeader(sarah, 'Sarah Clark'),
        {
          personId: emily,
          role: 'participant',
          fullName: 'Emily Johnson',
          phone: '+15550200',
          acceptedAt: null,
        },
      ],
    })

    expect(assignments(accept(waiting))).toEqual([])
  })

  it('is opened once, by the acceptance that activates the relationship', () => {
    const last = invitation({
      members: [
        invitedLeader(david, 'David Ellis'),
        invitedLeader(sarah, 'Sarah Clark', new Date('2026-03-01T09:00:00Z')),
        {
          personId: emily,
          role: 'participant',
          fullName: 'Emily Johnson',
          phone: '+15550200',
          acceptedAt: null,
        },
      ],
    })

    expect(assignments(accept(last))).toHaveLength(1)
  })
})

describe('an Admin assigning a Material', () => {
  it('records the assignment against the relationship and names the Admin', () => {
    expect(assignments(assign())).toEqual([
      {
        ministryId: ministry,
        relationshipId: relationship,
        materialId: romans,
        assignedAt: now,
        assignedBy: 'admin-user-1',
      },
    ])
  })

  it('appends it to history, which outlives the Admin who did it', () => {
    expect(events(assign())).toEqual([
      {
        ministryId: ministry,
        occurredAt: now,
        type: 'relationship.material_assigned',
        subjectType: 'relationship',
        subjectId: relationship,
        payload: { materialId: romans, assignedBy: 'admin-user-1' },
      },
    ])
  })

  it('sends nobody anything', () => {
    // No Admin action sends a message. An Admin who wants to tell a Leader what
    // they are working through next picks up the phone.
    expect(assign().effects.filter((effect) => effect.kind === 'message.enqueue')).toEqual([])
  })

  it('is refused on a relationship nobody has accepted', () => {
    // There is no opening period to close, because no week exists yet -- and an
    // assignment before acceptance would leave the gap the opening period exists
    // to prevent.
    expect(() => assign({ acceptedAt: null })).toThrow(
      new MaterialAssignmentRefused('material.relationship_not_accepted'),
    )
  })

  it('is refused on a relationship that has ended', () => {
    expect(() => assign({ endedAt: new Date('2026-04-01T09:00:00Z') })).toThrow(
      new MaterialAssignmentRefused('material.relationship_ended'),
    )
  })

  it('is not refused on a paused relationship', () => {
    // A Pause suspends check-ins and nothing else. Deciding what a relationship
    // will work through when it comes back is exactly the kind of thing an Admin
    // does during one.
    expect(
      assignments(assign({ pause: { pausedAt: new Date('2026-04-01T09:00:00Z'), periodWeeks: 2 } })),
    ).toHaveLength(1)
  })
})
