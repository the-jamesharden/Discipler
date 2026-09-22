import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import type { CheckInRelationship, CheckInSnapshot } from '~/domain/check-in'
import { createTestClock } from '~/domain/clock'
import type { Effect, OutboundMessageDraft } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, relationshipId, type PersonId } from '~/domain/ids'
import {
  groupJoinedMessage,
  helpMessage,
  invitationMessage,
  starterMessageToLeader,
  starterMessageToParticipant,
  welcomeMessage,
} from '~/domain/outbound-copy'
import {
  ratesLineIsDue,
  settleRatesLine,
  whoseRatesLineIsAsked,
  type RatesLineOccasion,
  type SettledMessage,
} from '~/domain/rates-line'

/**
 * Text wording, ticket 01. *Msg & data rates may apply. Reply STOP to opt out, HELP
 * for help.* reaches a Person at most once a calendar month, on the first text of
 * that month that would carry it.
 *
 * Driven as the queue sees it: each command's texts settled together against
 * what earlier commands queued, the way `applyEffects` settles them.
 */

const LINE = 'Msg & data rates may apply. Reply STOP to opt out, HELP for help.'

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const emily = personId('00000000-0000-4000-8000-0000000000e1')
const james = personId('00000000-0000-4000-8000-0000000000d0')
const ministryName = 'ABC Church'
const dashboardLink = 'https://discipler.example/relationships'

const text = (
  to: PersonId | null,
  body: string,
  ratesLine: RatesLineOccasion,
  at: Date,
): OutboundMessageDraft => ({
  ministryId: ministry,
  personId: to,
  toPhone: '+15550100001',
  body,
  enqueuedAt: at,
  scheduledFor: null,
  disclosesPersonId: null,
  kind: 'no_reply',
  ratesLine,
})

const welcome = (to: PersonId, at: Date) =>
  text(to, welcomeMessage({ ministryName, fullName: 'Emily Hart', promises: 'a_match' }), 'always', at)

const starterToParticipant = (to: PersonId, at: Date) =>
  text(to, starterMessageToParticipant({ ministryName, leaderNames: ['James'] }), 'once_a_month', at)

const starterToLeader = (to: PersonId, at: Date) =>
  text(to, starterMessageToLeader({ ministryName, dashboardLink }), 'once_a_month', at)

const invitation = (to: PersonId, at: Date) =>
  text(
    to,
    invitationMessage({ ministryName, fullName: 'James Ellis', leaderNoun: 'mentor', link: 'x' }),
    'never',
    at,
  )

/**
 * The outbound queue, remembered between commands. `send` is one command: its
 * texts are settled together, against every text already queued.
 */
const aQueue = (timeZone = 'UTC') => {
  const queued: SettledMessage[] = []
  return {
    send(...drafts: OutboundMessageDraft[]): readonly SettledMessage[] {
      const asked = whoseRatesLineIsAsked(drafts)
      const lastCarriedAt = new Map<PersonId, Date>()
      for (const row of queued) {
        if (!row.carriesRatesLine || !row.personId || !asked.includes(row.personId)) continue
        const before = lastCarriedAt.get(row.personId)
        if (!before || before < row.enqueuedAt) lastCarriedAt.set(row.personId, row.enqueuedAt)
      }
      const settled = settleRatesLine(drafts, { timeZone, lastCarriedAt })
      queued.push(...settled)
      return settled
    },
  }
}

const carried = (settled: readonly SettledMessage[]) =>
  settled.map((message) => message.carriesRatesLine)

describe('the rates line, once a month', () => {
  it('rides on first contact', () => {
    const [sent] = aQueue().send(welcome(emily, new Date('2026-10-02T15:00:00Z')))
    expect(sent!.carriesRatesLine).toBe(true)
    expect(sent!.body).toBe(
      'Discipler: ABC Church: Thanks, Emily — you’re all set. We’ll text you once '
        + `you’ve been paired with someone to meet with. ${LINE}`,
    )
  })

  it('is left off a Starter Message in the same month as the Welcome', () => {
    const queue = aQueue()
    queue.send(welcome(emily, new Date('2026-10-02T15:00:00Z')))

    const [starter] = queue.send(starterToParticipant(emily, new Date('2026-10-06T18:00:00Z')))

    expect(starter!.carriesRatesLine).toBe(false)
    expect(starter!.body).toBe('ABC Church: You have been paired for discipleship with James.')
  })

  it('rides on a Starter Message in a later month than the Welcome', () => {
    const queue = aQueue()
    queue.send(welcome(emily, new Date('2026-10-28T15:00:00Z')))

    const [starter] = queue.send(starterToParticipant(emily, new Date('2026-11-03T18:00:00Z')))

    expect(starter!.carriesRatesLine).toBe(true)
    expect(starter!.body).toBe(
      `ABC Church: You have been paired for discipleship with James. ${LINE}`,
    )
  })

  it('leaves the words of a text alone apart from the line', () => {
    const queue = aQueue()
    const at = new Date('2026-10-06T18:00:00Z')
    const [first] = queue.send(starterToLeader(james, at))
    const [second] = queue.send(starterToLeader(james, at))

    expect(first!.body).toBe(`${second!.body} ${LINE}`)
  })

  it('is never left off first contact or HELP, and each counts as having had it', () => {
    const queue = aQueue()
    const at = new Date('2026-10-06T18:00:00Z')
    queue.send(starterToParticipant(emily, at))

    const [help] = queue.send(
      text(emily, helpMessage({ ministryName }), 'always', new Date('2026-10-07T18:00:00Z')),
    )
    expect(help!.carriesRatesLine).toBe(true)
    expect(help!.body.endsWith(LINE)).toBe(true)
  })

  it('never adds the line to a text composed without it', () => {
    const [sent] = aQueue().send(invitation(james, new Date('2026-10-06T18:00:00Z')))
    expect(sent!.carriesRatesLine).toBe(false)
    expect(sent!.body.includes(LINE)).toBe(false)
  })

  it('carries it once between two texts queued to one Person in one command', () => {
    // An invitation composes no line, so the pair to show is two that both
    // would: a Starter Message and a group-joined text to the same Leader.
    const at = new Date('2026-10-06T18:00:00Z')
    const joined = text(
      james,
      groupJoinedMessage({ ministryName, joinerFullName: 'Ade Obi', groupName: 'Tuesday men', dashboardLink }),
      'once_a_month',
      at,
    )

    const settled = aQueue().send(invitation(james, at), starterToLeader(james, at), joined)

    expect(carried(settled)).toEqual([false, true, false])
  })

  it('counts a Welcome in the same command before any other text to that Person', () => {
    // Whichever order the command produced them in, the Person reads the line once.
    const at = new Date('2026-10-06T18:00:00Z')
    expect(carried(aQueue().send(starterToParticipant(emily, at), welcome(emily, at)))).toEqual([
      false,
      true,
    ])
  })

  it('is decided per Person: a Leader of three relationships is sent it once', () => {
    const queue = aQueue()
    const monday = new Date('2026-10-05T18:00:00Z')
    const tuesday = new Date('2026-10-06T18:00:00Z')

    expect(carried(queue.send(starterToLeader(james, monday)))).toEqual([true])
    expect(carried(queue.send(starterToLeader(james, tuesday)))).toEqual([false])
    // A third relationship, the same day, with its Participant: she has never had it.
    expect(
      carried(queue.send(starterToLeader(james, tuesday), starterToParticipant(emily, tuesday))),
    ).toEqual([false, true])
  })

  it('keeps it on a text to nobody on the Roster, since there is nobody to have had it', () => {
    const at = new Date('2026-10-06T18:00:00Z')
    expect(
      carried(aQueue().send(text(null, starterMessageToLeader({ ministryName, dashboardLink }), 'once_a_month', at))),
    ).toEqual([true])
  })

  it('refuses a text whose words disagree with what it says about the line', () => {
    const at = new Date('2026-10-06T18:00:00Z')
    const composedWithIt = starterMessageToLeader({ ministryName, dashboardLink })
    expect(() => aQueue().send(text(james, composedWithIt, 'never', at))).toThrow(/rates line/)
    expect(() =>
      aQueue().send(text(james, 'ABC Church: hello.', 'once_a_month', at)),
    ).toThrow(/rates line/)
  })
})

describe('the month is the Ministry’s', () => {
  it('turns at local midnight, not UTC’s', () => {
    // 9am on 1 November in Sydney is 22:00 UTC on 31 October.
    const sydney = 'Australia/Sydney'
    const lastOfOctober = new Date('2026-10-30T22:00:00Z') // 9am 31 October, local
    const firstOfNovember = new Date('2026-10-31T22:00:00Z') // 9am 1 November, local

    expect(ratesLineIsDue(lastOfOctober, firstOfNovember, sydney)).toBe(true)
    expect(ratesLineIsDue(lastOfOctober, firstOfNovember, 'UTC')).toBe(false)
  })

  it('is due for somebody who has never had it', () => {
    expect(ratesLineIsDue(null, new Date('2026-10-06T18:00:00Z'), 'UTC')).toBe(true)
  })
})

/**
 * The Leader's monthly check-in rule, which this replaces: the opening question
 * of a conversation is one more text that may carry the line, and it does only
 * where nothing else carried it to that Leader this month.
 */
describe('a check-in’s opening question', () => {
  const leads = (id: string, participant: string): CheckInRelationship => ({
    relationshipId: relationshipId(`00000000-0000-4000-8000-0000000000${id}`),
    role: 'leader',
    startedAt: new Date('2026-09-01T09:00:00Z'),
    participantNames: [participant],
    name: null,
    acceptedAt: new Date('2026-09-01T09:00:00Z'),
    paused: false,
    stillLed: true,
    cadence: { day: 1, hour: 9 },
  })

  const opening = (at: Date, over: Partial<CheckInSnapshot> = {}): OutboundMessageDraft[] => {
    const checkIn: CheckInSnapshot = {
      personId: james,
      phone: '+15550100001',
      timeZone: 'UTC',
      leads: [leads('b1', 'Emily'), leads('b2', 'Marcus'), leads('b3', 'Ade')],
      openSequence: null,
      lastCheckInAt: null,
      ...over,
    }
    const { effects } = handleCommand({ type: 'checkin.start', ministryId: ministry, personId: james }, {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      ministryName,
      appBaseUrl: 'https://discipler.example',
      checkIn,
    } satisfies CommandContext)
    return effects.flatMap((effect: Effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))
  }

  it('is left off after a Starter Message that month', () => {
    const queue = aQueue()
    queue.send(starterToLeader(james, new Date('2026-10-01T18:00:00Z')))

    const [question] = queue.send(...opening(new Date('2026-10-05T09:00:00Z')))

    expect(question!.carriesRatesLine).toBe(false)
    expect(question!.body).toBe(
      'ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no.',
    )
  })

  it('rides on the first text of a new month, once for a Leader of three relationships', () => {
    const queue = aQueue()
    queue.send(starterToLeader(james, new Date('2026-09-28T18:00:00Z')))

    const [october] = queue.send(...opening(new Date('2026-10-05T09:00:00Z')))
    const [nextWeek] = queue.send(...opening(new Date('2026-10-12T09:00:00Z')))

    expect(october!.body).toBe(
      `ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no. ${LINE}`,
    )
    expect(nextWeek!.carriesRatesLine).toBe(false)
  })

  it('does not identify the delivery brand, because a Leader is not first contact', () => {
    const [question] = aQueue().send(...opening(new Date('2026-10-05T09:00:00Z')))
    expect(question!.body.startsWith('Discipler:')).toBe(false)
  })
})
