import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type CommandContext,
  type RelationshipMember,
  type RelationshipSnapshot,
} from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { GroupJoinRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { roleNoun } from '~/domain/ministry-settings'
import {
  groupJoinedMessage,
  invitationLink,
  invitationMessage,
  leaderDashboardLink,
} from '~/domain/outbound-copy'

/**
 * Manual pairing, ticket 22: an Admin putting somebody into a group that already
 * exists. Stage 1, below, is a Disciple; stage 2, at the end, is a Discipler added
 * as another leader.
 *
 * Stage 1: an Admin putting a Disciple into a group
 * that already exists. The same act as an admission with no request behind it.
 *
 * What is decided here is what the command can see in what it read. Intake
 * completed, not opted out and the group's declared gender are the database's, as
 * they are at formation, and are covered where a database is
 * (`tests/integration/an-admin-puts-somebody-into-a-group.test.ts`).
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const group = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const mark = personId('00000000-0000-4000-8000-0000000000d2')
const emily = personId('00000000-0000-4000-8000-0000000000e1')
const fiona = personId('00000000-0000-4000-8000-0000000000e2')
const sam = personId('00000000-0000-4000-8000-0000000000e3')

const now = new Date('2026-03-09T09:00:00Z')
const accepted = new Date('2026-03-02T09:00:00Z')

const leading = (
  id: typeof david,
  fullName: string,
  acceptedAt: Date | null,
  phone: string | null = '+15550101',
): RelationshipMember => ({ personId: id, role: 'leader', fullName, phone, acceptedAt })

const discipledIn = (id: typeof david, fullName: string): RelationshipMember => ({
  personId: id,
  role: 'participant',
  fullName,
  phone: '+15550200',
  acceptedAt: null,
})

const thursdayTable = (over: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
  relationshipId: group,
  createdAt: new Date('2026-03-01T09:00:00Z'),
  acceptedAt: accepted,
  endedAt: null,
  name: 'Thursday Table',
  joinRequiresApproval: false,
  declaredGender: null,
  pause: null,
  members: [
    leading(david, 'David Chen', accepted),
    discipledIn(emily, 'Emily Johnson'),
    discipledIn(fiona, 'Fiona Grant'),
  ],
  ...over,
})

const add = (over: Partial<CommandContext> = {}, who = sam) =>
  handleCommand(
    {
      type: 'group.add_participant',
      ministryId: ministry,
      relationshipId: group,
      personId: who,
      addedBy: 'admin-user-1',
    },
    {
      ministryId: ministry,
      clock: createTestClock(now),
      ids: createSequentialIds(),
      ministryName: 'Riverside Chapel',
      appBaseUrl: 'https://discipler.test',
      groupToJoin: thursdayTable(),
      contacts: { people: new Map([[sam, { fullName: 'Sam Lee', phone: '+15550400' }]]) },
      ...over,
    },
  )

const messages = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

const events = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

describe('an Admin putting a Disciple into a group', () => {
  it('makes them a participant of it straight away', () => {
    const { effects } = add()

    const join = effects.find((effect) => effect.kind === 'relationship.join')
    expect(join?.kind === 'relationship.join' && join.membership).toEqual({
      ministryId: ministry,
      relationshipId: group,
      personId: sam,
      startedAt: now,
    })
  })

  it('sends the Disciple nothing: they accept nothing and are told nothing', () => {
    expect(messages(add().effects).some((message) => message.personId === sam)).toBe(false)
  })

  it('texts the Leader what a self-join texts them', () => {
    const [toDavid, ...others] = messages(add().effects)

    expect(others).toEqual([])
    expect(toDavid).toMatchObject({ personId: david, toPhone: '+15550101', kind: 'no_reply' })
    expect(toDavid?.body).toBe(
      groupJoinedMessage({
        ministryName: 'Riverside Chapel',
        joinerFullName: 'Sam Lee',
        groupName: 'Thursday Table',
        dashboardLink: leaderDashboardLink('https://discipler.test'),
      }),
    )
  })

  it('records an event of its own type, naming the Admin, the Person and the group', () => {
    expect(events(add().effects)).toEqual([
      expect.objectContaining({
        type: 'relationship.participant_added',
        subjectType: 'relationship',
        subjectId: group,
        occurredAt: now,
        payload: { personId: sam, addedBy: 'admin-user-1' },
      }),
    ])
  })

  /**
   * The group keeps its Material, its name, its declaration and its state: the
   * command writes a membership, an event and a text, and nothing that touches
   * the relationship's own row or anybody else's membership.
   */
  it('writes nothing but the membership, the event and the text', () => {
    expect(add().effects.map((effect) => effect.kind).sort()).toEqual([
      'history.append',
      'message.enqueue',
      'relationship.join',
    ])
  })
})

describe('which groups can be joined', () => {
  it('a paused one, whose Leader is still told', () => {
    const { effects } = add({
      groupToJoin: thursdayTable({ pause: { pausedAt: accepted, periodWeeks: 4 } }),
    })

    expect(effects.some((effect) => effect.kind === 'relationship.join')).toBe(true)
    expect(messages(effects).map((message) => message.personId)).toEqual([david])
  })

  it('one still awaiting its Leader, who is sent nothing', () => {
    const { effects } = add({
      groupToJoin: thursdayTable({
        acceptedAt: null,
        members: [
          leading(david, 'David Chen', null),
          discipledIn(emily, 'Emily Johnson'),
          discipledIn(fiona, 'Fiona Grant'),
        ],
      }),
    })

    expect(effects.some((effect) => effect.kind === 'relationship.join')).toBe(true)
    expect(messages(effects)).toEqual([])
  })

  it('tells the Leader who has accepted and not the one who has not', () => {
    const { effects } = add({
      groupToJoin: thursdayTable({
        acceptedAt: null,
        members: [
          leading(david, 'David Chen', accepted),
          leading(mark, 'Mark Owens', null, '+15550102'),
          discipledIn(emily, 'Emily Johnson'),
          discipledIn(fiona, 'Fiona Grant'),
        ],
      }),
    })

    expect(messages(effects).map((message) => message.personId)).toEqual([david])
  })

  it('one nobody has named, which its Leader is told about as theirs', () => {
    const [toDavid] = messages(add({ groupToJoin: thursdayTable({ name: null }) }).effects)

    expect(toDavid?.body).toContain('Sam just joined your group.')
  })

  it('skips a Leader with no number, as the queue would', () => {
    const { effects } = add({
      groupToJoin: thursdayTable({
        members: [leading(david, 'David Chen', accepted, null), discipledIn(emily, 'Emily Johnson')],
      }),
    })

    expect(effects.some((effect) => effect.kind === 'relationship.join')).toBe(true)
    expect(messages(effects)).toEqual([])
  })
})

describe('what it refuses, each with a code of its own', () => {
  it('a group that has ended', () => {
    expect(() => add({ groupToJoin: thursdayTable({ endedAt: now }) })).toThrow(
      new GroupJoinRefused('joining.group_has_ended'),
    )
  })

  it('a Person already being discipled in it', () => {
    expect(() =>
      add({ contacts: { people: new Map([[emily, { fullName: 'Emily Johnson', phone: null }]]) } }, emily),
    ).toThrow(new GroupJoinRefused('joining.already_in_the_group'))
  })

  it('a Person already leading it', () => {
    expect(() =>
      add({ contacts: { people: new Map([[david, { fullName: 'David Chen', phone: null }]]) } }, david),
    ).toThrow(new GroupJoinRefused('joining.already_in_the_group'))
  })

  it('a Person this Ministry does not hold', () => {
    expect(() => add({ contacts: { people: new Map() } })).toThrow(
      new GroupJoinRefused('joining.person_not_found'),
    )
  })

  /**
   * No group at all is the service's to refuse, because only it can tell an id
   * that names nothing from one that names a one-to-one. Reaching the domain
   * without one is a defect and says so.
   */
  it('fails loudly when handed no group, which the service refuses first', () => {
    expect(() => add({ groupToJoin: null })).toThrow(/handed no group/)
  })
})

/**
 * Stage 2: a Discipler added to the same group as another leader. They are
 * invited, the same way a leader is when first paired, and nothing about the
 * group moves while they decide.
 */
describe('an Admin adding a Discipler to a group as another leader', () => {
  const claire = personId('00000000-0000-4000-8000-0000000000d3')

  const addLeader = (over: Partial<CommandContext> = {}, who = claire) =>
    handleCommand(
      {
        type: 'group.add_leader',
        ministryId: ministry,
        relationshipId: group,
        personId: who,
        addedBy: 'admin-user-1',
      },
      {
        ministryId: ministry,
        clock: createTestClock(now),
        ids: createSequentialIds(),
        ministryName: 'Riverside Chapel',
        language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
        appBaseUrl: 'https://discipler.test',
        groupToJoin: thursdayTable(),
        contacts: { people: new Map([[claire, { fullName: 'Claire Martinez', phone: '+15550500' }]]) },
        ...over,
      },
    )

  it('opens a leader membership for them, with no Acceptance recorded', () => {
    const added = addLeader().effects.find((effect) => effect.kind === 'relationship.add_leader')

    // The membership carries no acceptance to record: it opens without one.
    expect(added?.kind === 'relationship.add_leader' && added.membership).toEqual({
      ministryId: ministry,
      relationshipId: group,
      personId: claire,
      startedAt: now,
    })
  })

  it('issues them an Invitation Link and texts it, as a leader is invited when first paired', () => {
    const { effects } = addLeader()

    const issued = effects.find((effect) => effect.kind === 'invitation.issue')
    if (issued?.kind !== 'invitation.issue') throw new Error('no invitation was issued')
    expect(issued.invitation).toMatchObject({ relationshipId: group, personId: claire })

    expect(messages(effects)).toEqual([
      expect.objectContaining({
        personId: claire,
        toPhone: '+15550500',
        kind: 'no_reply',
        body: invitationMessage({
          ministryName: 'Riverside Chapel',
          fullName: 'Claire Martinez',
          leaderNoun: roleNoun('mentor'),
          link: invitationLink('https://discipler.test', issued.invitation.token),
        }),
      }),
    ])
  })

  it('sends nothing to the group’s Disciples and nothing to the leaders it already has', () => {
    const told = messages(addLeader().effects).map((message) => message.personId)

    expect(told).toEqual([claire])
  })

  it('records an event of its own type, naming the Admin, the Person and the group', () => {
    expect(events(addLeader().effects)).toEqual([
      expect.objectContaining({
        type: 'relationship.leader_added',
        subjectType: 'relationship',
        subjectId: group,
        occurredAt: now,
        payload: { personId: claire, addedBy: 'admin-user-1' },
      }),
    ])
  })

  /**
   * The group keeps running: the command writes a membership, an invitation, an
   * event and a text, and nothing that touches the relationship's own row. There
   * is no effect here that could move a group back to awaiting acceptance.
   */
  it('writes nothing but the membership, the invitation, the event and the text', () => {
    for (const groupToJoin of [
      thursdayTable(),
      thursdayTable({ pause: { pausedAt: accepted, periodWeeks: 4 } }),
      thursdayTable({ acceptedAt: null }),
    ]) {
      expect(addLeader({ groupToJoin }).effects.map((effect) => effect.kind).sort()).toEqual([
        'history.append',
        'invitation.issue',
        'message.enqueue',
        'relationship.add_leader',
      ])
    }
  })

  it('refuses a group that has ended', () => {
    expect(() => addLeader({ groupToJoin: thursdayTable({ endedAt: now }) })).toThrow(
      new GroupJoinRefused('joining.group_has_ended'),
    )
  })

  it('refuses a Person already in the group, leading it or being discipled in it', () => {
    const known = (id: typeof david) => ({
      contacts: { people: new Map([[id, { fullName: 'Somebody Here', phone: null }]]) },
    })

    expect(() => addLeader(known(david), david)).toThrow(
      new GroupJoinRefused('joining.already_in_the_group'),
    )
    expect(() => addLeader(known(emily), emily)).toThrow(
      new GroupJoinRefused('joining.already_in_the_group'),
    )
  })

  it('refuses a Person this Ministry does not hold', () => {
    expect(() => addLeader({ contacts: { people: new Map() } })).toThrow(
      new GroupJoinRefused('joining.person_not_found'),
    )
  })
})
