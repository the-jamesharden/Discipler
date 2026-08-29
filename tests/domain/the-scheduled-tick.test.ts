import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type AwaitingLeader,
  type CommandContext,
  type UnacceptedRelationship,
} from '~/domain/boundary'
import { createTestClock, days } from '~/domain/clock'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { INVITATION_LIFETIME_DAYS, invitationToken } from '~/domain/invitations'

/**
 * The tick is a command like any other. Everything below advances a test clock
 * rather than waiting, which is the only reason five days of a Leader not
 * answering can be asserted in a few milliseconds -- and the reason the tick must
 * never reach for system time.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const sarah = personId('00000000-0000-4000-8000-0000000000d2')

const createdAt = new Date('2026-03-02T09:00:00Z')

const awaiting = (
  id: typeof david,
  fullName: string,
  over: Partial<AwaitingLeader> = {},
): AwaitingLeader => ({
  personId: id,
  fullName,
  phone: `+1555010${id.slice(-1)}`,
  token: invitationToken(`token-${id.slice(-2)}`),
  linkExpiresAt: new Date(createdAt.getTime() + days(INVITATION_LIFETIME_DAYS)),
  remindedAt: null,
  ...over,
})

const unaccepted = (over: Partial<UnacceptedRelationship> = {}): UnacceptedRelationship => ({
  relationshipId: relationship,
  createdAt,
  awaiting: [awaiting(david, 'David Ellis')],
  itemStandsOpen: false,
  ...over,
})

const tick = (
  at: Date,
  outstanding: readonly UnacceptedRelationship[] = [unaccepted()],
) =>
  handleCommand({ type: 'scheduled.tick', ministryId: ministry }, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'Riverside Chapel',
    appBaseUrl: 'https://discipler.example',
    unaccepted: outstanding,
    // Nobody due. These tests are about the Acceptance thresholds; the cadence
    // has its own suite, and an absent snapshot here would be a Ministry whose
    // check-ins were never loaded rather than one with nobody to ask.
    checkInsDue: [],
  } satisfies CommandContext)

const after = (elapsed: number) => new Date(createdAt.getTime() + elapsed)

type Result = ReturnType<typeof tick>

const messages = (result: Result) =>
  result.effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

const raised = (result: Result) =>
  result.effects.flatMap((effect) => (effect.kind === 'followUp.raise' ? [effect.item] : []))

const historyOfType = (result: Result, type: string) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'history.append' && effect.event.type === type ? [effect.event] : [],
  )

describe('the scheduled tick', () => {
  it('reads the clock it was handed and nothing else', () => {
    // The same snapshot, two instants, two different answers. A tick that read
    // system time would give the same answer to both.
    expect(messages(tick(after(days(1))))).toHaveLength(0)
    expect(messages(tick(after(days(2))))).toHaveLength(1)
  })

  it('changes nothing when a Ministry has nothing outstanding', () => {
    expect(tick(after(days(30)), []).effects).toEqual([])
  })

  it('refuses to run against a snapshot it was not handed', () => {
    expect(() =>
      handleCommand({ type: 'scheduled.tick', ministryId: ministry }, {
        ministryId: ministry,
        clock: createTestClock(createdAt),
        ids: createSequentialIds(),
        ministryName: 'Riverside Chapel',
        appBaseUrl: 'https://discipler.example',
      }),
    ).toThrow(/no state to evaluate/)
  })
})

describe('a relationship nobody has accepted', () => {
  it('reminds its Leader at two days, with their link', () => {
    const result = tick(after(days(2)))
    const [message] = messages(result)

    expect(message?.personId).toBe(david)
    expect(message?.body).toContain('https://discipler.example/invitation/token-d1')
    // The reveal is on the page, after the Leader chooses to open it. A name in
    // the reminder would say what the invitation deliberately did not.
    expect(message?.body).not.toContain('Sarah')
    expect(message?.disclosesPersonId).toBeNull()
    expect(historyOfType(result, 'relationship.acceptance_reminded')).toHaveLength(1)
  })

  it('does not remind before two days have passed', () => {
    expect(messages(tick(after(days(2) - 1)))).toHaveLength(0)
    expect(raised(tick(after(days(2) - 1)))).toHaveLength(0)
  })

  it('reminds each Leader once and no more, however often the tick runs', () => {
    const alreadyReminded = unaccepted({
      awaiting: [awaiting(david, 'David Ellis', { remindedAt: after(days(2)) })],
    })

    expect(messages(tick(after(days(3)), [alreadyReminded]))).toHaveLength(0)
    expect(messages(tick(after(days(9)), [alreadyReminded]))).toHaveLength(0)
  })

  it('chases only the Leaders who have not agreed', () => {
    // A co-leader who accepted on day one is not chased for somebody else. Their
    // acceptance closed their own membership's question and nothing more.
    const result = tick(after(days(2)), [
      unaccepted({ awaiting: [awaiting(sarah, 'Sarah Chen')] }),
    ])

    expect(messages(result).map((message) => message.personId)).toEqual([sarah])
  })

  it('raises a follow-up item at five days, saying how long it waited', () => {
    const result = tick(after(days(5)))
    const [item] = raised(result)

    expect(item?.kind).toBe('relationship_unaccepted')
    expect(item?.relationshipId).toBe(relationship)
    // The condition is the relationship's, not any one Leader's.
    expect(item?.personId).toBeNull()
    expect(historyOfType(result, 'follow_up.relationship_unaccepted')[0]?.payload).toEqual({
      waitedDays: 5,
    })
  })

  it('raises nothing at four days', () => {
    expect(raised(tick(after(days(4))))).toHaveLength(0)
  })

  it('raises exactly one item however often the tick runs', () => {
    const standing = unaccepted({ itemStandsOpen: true })

    const result = tick(after(days(6)), [standing])

    expect(raised(result)).toHaveLength(0)
    // And no history event either. A condition nobody has acted on yet must not
    // become a row a day in the Ministry's record.
    expect(historyOfType(result, 'follow_up.relationship_unaccepted')).toHaveLength(0)
  })

  it('raises again once an Admin has resolved the first and nobody has accepted', () => {
    // Deduping is *while the item stands open*, which is the rule the partial
    // unique index holds too. Resolving records that an Admin acted; it does not
    // make a Leader agree, and a relationship that could never be raised again is
    // one nobody is ever told about -- the invisibility this whole ticket exists
    // to end.
    const result = tick(after(days(20)), [unaccepted({ itemStandsOpen: false })])

    expect(raised(result)).toHaveLength(1)
    expect(historyOfType(result, 'follow_up.relationship_unaccepted')[0]?.payload).toEqual({
      waitedDays: 20,
    })
  })

  it('does not remind a Leader whose link has run out', () => {
    // A reminder pointing at an expired token sends them to a page telling them to
    // find an Admin, which is worse than the text they never got. The five-day item
    // surfaces them regardless.
    const expired = unaccepted({
      awaiting: [awaiting(david, 'David Ellis', { linkExpiresAt: after(days(3)) })],
    })

    expect(messages(tick(after(days(2)), [expired]))).toHaveLength(1)
    expect(messages(tick(after(days(4)), [expired]))).toHaveLength(0)
    expect(raised(tick(after(days(5)), [expired]))).toHaveLength(1)
  })

  it('does not clear the item it raised', () => {
    // Nothing the tick returns closes anything. An item persists until an Admin
    // acts on it, which is the property that makes Care Needed trustworthy.
    const result = tick(after(days(20)), [unaccepted({ itemStandsOpen: true })])

    expect(result.effects.filter((effect) => effect.kind === 'followUp.resolve')).toEqual([])
  })
})

describe('a relationship accepted before the thresholds', () => {
  it('is not in the snapshot at all, so nothing is sent and nothing is raised', () => {
    // Acceptance stamps the relationship, which is what takes it out of the read
    // the tick evaluates. There is no second rule here to keep in step with it.
    expect(tick(after(days(30)), []).effects).toEqual([])
  })
})
