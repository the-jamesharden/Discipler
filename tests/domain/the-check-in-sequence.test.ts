import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import {
  relationshipsToAskAbout,
  type CheckInRelationship,
  type CheckInSnapshot,
} from '~/domain/check-in'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { readAfterTheLineThisMonth } from '../support/effects'

/**
 * One Leader, one conversation, however many relationships they lead. Everything
 * below drives the boundary and reads the messages it enqueued, because that is
 * what the Leader actually experiences -- the rows underneath are how it is
 * remembered, not what it is.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const james = personId('00000000-0000-4000-8000-0000000000d0')

const march = new Date('2026-03-02T09:00:00Z')
const june = new Date('2026-06-01T09:00:00Z')
const september = new Date('2026-09-07T09:00:00Z')

const startedAt = new Date('2026-10-05T09:00:00Z')

const leads = (
  id: string,
  startedOn: Date,
  participantNames: readonly string[],
  over: Partial<CheckInRelationship> = {},
): CheckInRelationship => ({
  relationshipId: relationshipId(`00000000-0000-4000-8000-0000000000${id}`),
  role: 'leader',
  startedAt: startedOn,
  participantNames,
  name: null,
  acceptedAt: startedOn,
  paused: false,
  stillLed: true,
  cadence: { day: 1, hour: 9 },
  ...over,
})

const snapshot = (over: Partial<CheckInSnapshot> = {}): CheckInSnapshot => ({
  personId: james,
  phone: '+15550100001',
  timeZone: 'UTC',
  leads: [
    leads('b2', june, ['Marcus', 'Dan']),
    leads('b1', march, ['Emily']),
    leads('b3', september, ['Ade']),
  ],
  openSequence: null,
  lastCheckInAt: new Date('2026-10-01T09:00:00Z'),
  ...over,
})

const start = (checkIn: CheckInSnapshot = snapshot(), at: Date = startedAt) =>
  handleCommand({ type: 'checkin.start', ministryId: ministry, personId: james }, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'ABC Church',
    appBaseUrl: 'https://discipler.example',
    checkIn,
  } satisfies CommandContext)

// As a Leader reads them who has had the rates line already this month, which is
// what these tests were written for. The line has its own tests below and in
// `the-rates-line-once-a-month.test.ts`.
const bodies = (effects: readonly Effect[]): string[] =>
  readAfterTheLineThisMonth(effects).map((message) => message.body)

const drafts = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

const asked = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'checkin.ask' ? [effect.prompt] : []))

describe('opening a check-in sequence', () => {
  it('opens exactly one sequence however many relationships the Leader leads', () => {
    const opened = start().effects.filter((effect) => effect.kind === 'checkin.open')
    expect(opened).toHaveLength(1)
  })

  it('asks the earliest relationship first, and asks nothing else yet', () => {
    // Three relationships, one question. The sequence advances only in response to
    // a reply, so the June and September relationships are not asked about until
    // March's turn is over.
    expect(bodies(start().effects)).toEqual([
      'ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('records the relationship and the role the prompt was sent for', () => {
    const [prompt] = asked(start().effects)
    expect(prompt).toMatchObject({
      relationshipId: relationshipId('00000000-0000-4000-8000-0000000000b1'),
      role: 'leader',
      question: 'met',
      position: 1,
    })
  })

  it('names everyone in a group rather than picking one of them', () => {
    const onlyTheGroup = snapshot({ leads: [leads('b2', june, ['Marcus', 'Dan'])] })
    expect(bodies(start(onlyTheGroup).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('skips a relationship still Awaiting Leader Acceptance', () => {
    const unaccepted = snapshot({
      leads: [
        leads('b1', march, ['Emily'], { acceptedAt: null }),
        leads('b2', june, ['Marcus', 'Dan']),
      ],
    })
    expect(bodies(start(unaccepted).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('skips a Paused relationship', () => {
    const paused = snapshot({
      leads: [
        leads('b1', march, ['Emily'], { paused: true }),
        leads('b2', june, ['Marcus', 'Dan']),
      ],
    })
    expect(bodies(start(paused).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('opens nothing at all for a Person with nothing to be asked about', () => {
    // A Participant, or a Leader whose every relationship is paused. Opening an
    // empty sequence would leave a conversation nobody can finish, and its
    // relationship-weeks would read as unanswered in ticket 10.
    const nothing = snapshot({ leads: [] })
    expect(start(nothing).effects).toEqual([])
  })
})

/**
 * The rates line on the opening question. Whether it goes out is the once-a-month
 * rule's, decided against every text the Leader has been queued this month and
 * not only their check-ins (Text wording, ticket 01) -- so the boundary composes
 * the question as it reads when it carries the line, and says it may.
 */
describe('the rates line on a check-in', () => {
  const opening = (checkIn: CheckInSnapshot) => drafts(start(checkIn).effects)[0]!

  it('may ride on the question that opens a conversation', () => {
    const question = opening(snapshot())
    expect(question.ratesLine).toBe('once_a_month')
    expect(question.body).toContain('Reply STOP to opt out')
  })

  it('is decided the same way whenever the Leader was last asked', () => {
    // The month of the last conversation no longer decides anything: a Starter
    // Message this month takes the line off as surely as a check-in does.
    expect(opening(snapshot({ lastCheckInAt: null }))).toEqual(opening(snapshot()))
  })

  it('does not identify the delivery brand, because a Leader is not first contact', () => {
    expect(opening(snapshot({ lastCheckInAt: null })).body).not.toContain('Discipler:')
  })

  it('asks about relationships formed in the same instant in a reproducible order', () => {
    // An Admin pairing one Leader with three people does it in one sitting, so an
    // identical `startedAt` across several relationships is ordinary rather than
    // contrived. `sort` is stable, so a tie fell through to whatever order the rows
    // arrived in -- which is the order of a database scan and not a fact about the
    // Ministry. `covering` is fixed when the conversation opens and every later
    // reply is matched by position in it, so an order that is not a function of the
    // data is a conversation that cannot be reproduced.
    const together = new Date('2026-10-05T09:00:00Z')
    const one = leads('c1', together, ['Ada Rowe'])
    const two = leads('c2', together, ['Ben Okafor'])
    const three = leads('c3', together, ['Cara Mensah'])

    const forwards = relationshipsToAskAbout([one, two, three])
    const backwards = relationshipsToAskAbout([three, two, one])

    expect(forwards.map((each) => each.relationshipId)).toEqual(
      backwards.map((each) => each.relationshipId),
    )
    expect(forwards.map((each) => each.participantNames[0])).toEqual([
      'Ada Rowe',
      'Ben Okafor',
      'Cara Mensah',
    ])
  })

  it('still puts an older relationship first, whatever its identifier is', () => {
    const older = leads('f9', new Date('2026-01-05T09:00:00Z'), ['Ada Rowe'])
    const newer = leads('a1', new Date('2026-10-05T09:00:00Z'), ['Ben Okafor'])

    expect(
      relationshipsToAskAbout([newer, older]).map((each) => each.participantNames[0]),
    ).toEqual(['Ada Rowe', 'Ben Okafor'])
  })
})
