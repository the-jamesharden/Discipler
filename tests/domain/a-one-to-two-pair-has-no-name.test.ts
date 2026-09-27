import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type CommandContext,
  type RelationshipMember,
  type RelationshipSnapshot,
} from '~/domain/boundary'
import type { CheckInSnapshot } from '~/domain/check-in'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { PairingRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId, relationshipId, type PersonId } from '~/domain/ids'
import {
  keywordExchangeId,
  type InboundSnapshot,
  type KeywordRelationship,
  type OpenKeywordExchange,
} from '~/domain/keywords'
import { roleNoun } from '~/domain/ministry-settings'
import { needsAName } from '~/domain/relationships'

/**
 * A 1:2 pair stores no name (Roles per pairing, ticket 05; James, 2026-09-27).
 *
 * The Pair popup used to post one it built, *Claire with Ana & Sam*, which the
 * spec said was never shown and which every text then named the pair by. A 1:2
 * pair is now formed with no name, so every text names it by its people, as it
 * names a one-to-one and an unnamed group. A Group of the same three people is
 * still named, which is why the command is told the shape: the counts alone
 * cannot tell the two apart.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const claire = personId('00000000-0000-4000-8000-0000000000c1')
const ana = personId('00000000-0000-4000-8000-0000000000a1')
const sam = personId('00000000-0000-4000-8000-0000000000a2')
const emily = personId('00000000-0000-4000-8000-0000000000e1')
const rosa = personId('00000000-0000-4000-8000-0000000000a3')

const thePair = relationshipId('00000000-0000-4000-8000-0000000000b1')
const withEmily = relationshipId('00000000-0000-4000-8000-0000000000b2')

const at = new Date('2026-06-01T09:00:00Z')

const PEOPLE: ReadonlyMap<PersonId, { readonly fullName: string; readonly phone: string }> = new Map([
  [claire, { fullName: 'Claire Lee', phone: '+15550100001' }],
  [ana, { fullName: 'Ana Diaz', phone: '+15550200001' }],
  [sam, { fullName: 'Sam Park', phone: '+15550200002' }],
  [emily, { fullName: 'Emily Davis', phone: '+15550200003' }],
  [rosa, { fullName: 'Rosa Vega', phone: '+15550200004' }],
])

const context = (over: Partial<CommandContext> = {}): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'ABC Church',
  appBaseUrl: 'https://discipler.example',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
  contacts: { people: PEOPLE },
  ...over,
})

const bodies = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message.body] : []))

const recipients = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message.personId] : []))

/** Claire, Ana and Sam, as the Pair popup posts each shape of them. */
const form = (over: { readonly shape?: 'one_to_two'; readonly name?: string | null; readonly participantIds?: PersonId[] }) =>
  handleCommand(
    {
      type: 'relationship.create',
      ministryId: ministry,
      leaderIds: [claire],
      participantIds: over.participantIds ?? [ana, sam],
      declaredGender: 'female',
      ...(over.shape === undefined ? {} : { shape: over.shape }),
      ...(over.name === undefined ? {} : { name: over.name }),
    },
    context(),
  )

const formed = (result: ReturnType<typeof form>) => {
  const effect = result.effects.find((e) => e.kind === 'relationship.create')
  if (effect?.kind !== 'relationship.create') throw new Error('no relationship was created')
  return effect.relationship
}

describe('whether forming a relationship asks for a name', () => {
  it('asks a group, and asks neither a one-to-one nor a 1:2 pair', () => {
    expect(needsAName(1, 1)).toBe(false)
    expect(needsAName(1, 2)).toBe(true)
    expect(needsAName(2, 1)).toBe(true)
    expect(needsAName(1, 2, 'one_to_two')).toBe(false)
  })

  it('asks anything that is not one Discipler and two Disciples, whatever it says it is', () => {
    // The popup strikes 1:2 pair out at three ticked, so only a form somebody
    // made by hand says this, and it is asked what a Group is asked.
    expect(needsAName(1, 3, 'one_to_two')).toBe(true)
    expect(needsAName(2, 2, 'one_to_two')).toBe(true)
    expect(needsAName(1, 1, 'one_to_two')).toBe(false)
  })
})

describe('forming a 1:2 pair', () => {
  it('forms it with no name, and with the Discipler’s declaration it was posted', () => {
    const pair = formed(form({ shape: 'one_to_two' }))
    expect(pair.name).toBeNull()
    expect(pair.kind).toBe('group')
    expect(pair.declaredGender).toBe('female')
    expect(pair.joinRequiresApproval).toBe(false)
  })

  it('keeps no name it was given, as a one-to-one keeps none', () => {
    expect(formed(form({ shape: 'one_to_two', name: 'Claire with Ana & Sam' })).name).toBeNull()
  })

  it('records no name in its history', () => {
    const created = form({ shape: 'one_to_two' }).effects.find(
      (effect) => effect.kind === 'history.append' && effect.event.type === 'relationship.created',
    )
    expect(created?.kind === 'history.append' && created.event.payload).toMatchObject({
      leaderIds: [claire],
      participantIds: [ana, sam],
      name: null,
    })
  })

  it('still refuses a Group of the same three people that nobody named', () => {
    expect(() => form({})).toThrow(new PairingRefused('relationship.needs_a_name'))
    expect(formed(form({ name: 'Tuesday Women’s' })).name).toBe('Tuesday Women’s')
  })

  it('refuses a 1:2 pair of three Disciples as the Group it would be', () => {
    expect(() => form({ shape: 'one_to_two', participantIds: [ana, sam, emily] })).toThrow(
      new PairingRefused('relationship.needs_a_name'),
    )
  })
})

/**
 * Every text that names a relationship, for a 1:2 pair formed as the popup forms
 * one: its name is read off what the command formed, so these fail if a name ever
 * comes back.
 */
describe('what the texts call a 1:2 pair', () => {
  const nameFormed = formed(form({ shape: 'one_to_two' })).name

  const member = (id: PersonId, role: 'leader' | 'participant') => {
    const person = PEOPLE.get(id)!
    return { personId: id, role, fullName: person.fullName, phone: person.phone }
  }

  const heldAs = (
    role: 'leader' | 'participant',
    over: Partial<KeywordRelationship> = {},
  ): KeywordRelationship => ({
    relationshipId: thePair,
    role,
    startedAt: new Date('2026-04-01T09:00:00Z'),
    acceptedAt: new Date('2026-04-02T09:00:00Z'),
    endedAt: null,
    paused: false,
    name: nameFormed,
    members: [claire, ana, sam].map((id) => ({
      ...member(id, id === claire ? 'leader' : 'participant'),
      reachable: true,
    })),
    ...over,
  })

  /** Claire also disciples Emily one to one, begun earlier, so her menus have two lines. */
  const withEmilyToo = (over: Partial<KeywordRelationship> = {}): KeywordRelationship => ({
    relationshipId: withEmily,
    role: 'leader',
    startedAt: new Date('2026-02-01T09:00:00Z'),
    acceptedAt: new Date('2026-02-02T09:00:00Z'),
    endedAt: null,
    paused: false,
    name: null,
    members: [claire, emily].map((id) => ({
      ...member(id, id === claire ? 'leader' : 'participant'),
      reachable: true,
    })),
    ...over,
  })

  const quietCheckIn = (person: PersonId): CheckInSnapshot => ({
    personId: person,
    phone: PEOPLE.get(person)!.phone,
    timeZone: 'UTC',
    leads: [],
    openSequence: null,
    lastCheckInAt: null,
  })

  const texting = (person: PersonId, body: string, over: Partial<InboundSnapshot>) =>
    handleCommand(
      { type: 'sms.inbound', ministryId: ministry, personId: person, body },
      context({
        checkIn: quietCheckIn(person),
        inbound: {
          personId: person,
          holds: [],
          exchange: null,
          lastAcknowledgedAt: null,
          optedOut: false,
          mayBeTexted: true,
          ...over,
        },
      }),
    ).effects

  const menuOf = (
    keyword: OpenKeywordExchange['keyword'],
    options: readonly KeywordRelationship[],
    target: KeywordRelationship | null = null,
  ): OpenKeywordExchange => ({
    exchangeId: keywordExchangeId('exchange-1'),
    keyword,
    openedAt: at,
    promptedAt: at,
    options,
    target,
    clarificationsSent: 0,
  })

  const claireHolds = (over: Partial<KeywordRelationship> = {}) => [withEmilyToo(over), heldAs('leader', over)]

  it('asks Claire the weekly question about Ana and Sam by name', () => {
    const { effects } = handleCommand(
      { type: 'checkin.start', ministryId: ministry, personId: claire },
      context({
        checkIn: {
          ...quietCheckIn(claire),
          lastCheckInAt: new Date('2026-05-25T09:00:00Z'),
          leads: [
            {
              relationshipId: thePair,
              role: 'leader',
              startedAt: new Date('2026-04-01T09:00:00Z'),
              participantNames: ['Ana Diaz', 'Sam Park'],
              name: nameFormed,
              acceptedAt: new Date('2026-04-02T09:00:00Z'),
              paused: false,
              stillLed: true,
              cadence: { day: 1, hour: 9 },
            },
          ],
        },
      }),
    )
    expect(bodies(effects)[0]).toMatch(
      /^ABC Church: Did you meet with Ana Diaz and Sam Park this week\? Reply 1 for yes, 2 for no\./,
    )
  })

  it('lists the pair by its Disciples in Claire’s PAUSE and RESUME menus', () => {
    expect(bodies(texting(claire, 'PAUSE', { holds: claireHolds() }))).toEqual([
      'ABC Church: Which check-ins would you like to pause? 1. Emily Davis 2. Ana Diaz and Sam Park',
    ])
    expect(bodies(texting(claire, 'RESUME', { holds: claireHolds({ paused: true }) }))).toEqual([
      'ABC Church: Which check-ins would you like to restart? 1. Emily Davis 2. Ana Diaz and Sam Park',
    ])
  })

  it('asks and confirms Claire’s pause by the pair’s Disciples', () => {
    expect(bodies(texting(claire, '2', { holds: claireHolds(), exchange: menuOf('PAUSE', claireHolds()) }))).toEqual([
      'ABC Church: Pause check-ins with Ana Diaz and Sam Park for 2 weeks? Reply YES to confirm, ' +
        'or reply 1, 4, 8, or 12 for a different number of weeks.',
    ])
    expect(
      bodies(
        texting(claire, 'YES', {
          holds: claireHolds(),
          exchange: menuOf('PAUSE', claireHolds(), heldAs('leader')),
        }),
      ),
    ).toEqual([
      'ABC Church: Done — your check-ins about Ana Diaz and Sam Park are paused for 2 weeks. ' +
        'Reply RESUME any time to start them again sooner.',
    ])
  })

  it('tells each side the other side’s names when Claire resumes it by text', () => {
    const effects = texting(claire, 'RESUME', {
      holds: [withEmilyToo(), heldAs('leader', { paused: true })],
    })
    expect(recipients(effects)).toEqual([claire, ana, sam])
    expect(bodies(effects)).toEqual([
      'ABC Church: Your discipleship with Ana Diaz and Sam Park has been resumed! ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
      'ABC Church: Your discipleship with Claire Lee has been resumed! ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
      'ABC Church: Your discipleship with Claire Lee has been resumed! ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])
  })

  it('thanks Ana for a SWAP by her Discipler’s name', () => {
    expect(bodies(texting(ana, 'SWAP', { holds: [heldAs('participant')] }))).toEqual([
      "ABC Church: Thanks for letting us know about Claire Lee. We've passed this on and " +
        'someone will be in touch. Nothing changes in the meantime.',
    ])
  })

  const running = (over: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
    relationshipId: thePair,
    createdAt: new Date('2026-04-01T09:00:00Z'),
    acceptedAt: new Date('2026-04-02T09:00:00Z'),
    endedAt: null,
    name: nameFormed,
    joinRequiresApproval: false,
    declaredGender: 'female',
    pause: null,
    members: [claire, ana, sam].map(
      (id): RelationshipMember => ({
        ...member(id, id === claire ? 'leader' : 'participant'),
        acceptedAt: id === claire ? new Date('2026-04-02T09:00:00Z') : null,
      }),
    ),
    ...over,
  })

  it('tells each side the other side’s names when an Admin resumes it', () => {
    const { effects } = handleCommand(
      { type: 'relationship.resume', ministryId: ministry, relationshipId: thePair, resumedBy: 'admin-user-1' },
      context({ relationship: running({ pause: { pausedAt: new Date('2026-05-25T09:00:00Z'), periodWeeks: 2 } }) }),
    )
    expect(recipients(effects)).toEqual([claire, ana, sam])
    expect(bodies(effects).map((body) => body.replace(/ Msg & data.*$/, ''))).toEqual([
      'ABC Church: Your discipleship with Ana Diaz and Sam Park has been resumed!',
      'ABC Church: Your discipleship with Claire Lee has been resumed!',
      'ABC Church: Your discipleship with Claire Lee has been resumed!',
    ])
  })

  it('tells Claire somebody joined her group, when an Admin puts a third Disciple in', () => {
    const { effects } = handleCommand(
      { type: 'group.add_participant', ministryId: ministry, relationshipId: thePair, personId: rosa, addedBy: 'admin-user-1' },
      context({ groupToJoin: running(), joinRequest: null, placementWanted: null }),
    )
    expect(recipients(effects)).toEqual([claire])
    expect(bodies(effects)[0]).toMatch(/^ABC Church: Rosa just joined your group\. See full name and contact info at /)
  })
})
