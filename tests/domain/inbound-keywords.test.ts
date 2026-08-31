import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import {
  checkInPromptId,
  checkInSequenceId,
  type CheckInRelationship,
  type CheckInSnapshot,
  type OpenSequence,
} from '~/domain/check-in'
import { createTestClock, hours } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import {
  keywordExchangeId,
  type InboundSnapshot,
  type KeywordRelationship,
  type OpenKeywordExchange,
} from '~/domain/keywords'

/**
 * The inbound keyword commands, as a Leader and a Participant reach them: one word
 * texted to a number, and everything Discipler does about it.
 *
 * Everything below advances a test clock rather than waiting, which is the only
 * reason a twenty-four-hour expiry can be asserted in a millisecond.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const james = personId('00000000-0000-4000-8000-0000000000j1')
const emily = personId('00000000-0000-4000-8000-0000000000e1')
const sarah = personId('00000000-0000-4000-8000-0000000000s1')
const david = personId('00000000-0000-4000-8000-0000000000d1')

// Named by the person on the other side of each, which is how the messages name
// them too. `withEmily` sorts first: earliest start date, and the tiebreak below it
// never has to be reached in these tests.
const withEmily = relationshipId('00000000-0000-4000-8000-0000000000b1')
const withSarah = relationshipId('00000000-0000-4000-8000-0000000000b2')
const withDavid = relationshipId('00000000-0000-4000-8000-0000000000b3')

const at = new Date('2026-06-01T09:00:00Z')

const leading = (
  id: typeof withEmily,
  other: { readonly personId: typeof emily; readonly fullName: string },
  startedAt: Date,
  over: Partial<KeywordRelationship> = {},
): KeywordRelationship => ({
  relationshipId: id,
  role: 'leader',
  startedAt,
  acceptedAt: new Date('2026-05-01T09:00:00Z'),
  endedAt: null,
  paused: false,
  members: [
    {
      personId: james,
      role: 'leader',
      fullName: 'James Harden',
      phone: '+15550100001',
      reachable: true,
    },
    { ...other, role: 'participant', phone: '+15550200001', reachable: true },
  ],
  ...over,
})

const emilysRelationship = (over: Partial<KeywordRelationship> = {}) =>
  leading(withEmily, { personId: emily, fullName: 'Emily Johnson' }, new Date('2026-03-01T09:00:00Z'), over)

const sarahsRelationship = (over: Partial<KeywordRelationship> = {}) =>
  leading(withSarah, { personId: sarah, fullName: 'Sarah Reed' }, new Date('2026-04-01T09:00:00Z'), over)

const davidsRelationship = (over: Partial<KeywordRelationship> = {}) =>
  leading(withDavid, { personId: david, fullName: 'David Ellis' }, new Date('2026-05-01T09:00:00Z'), over)

/** The same relationship seen from the other side, which is what a Participant holds. */
const beingDiscipledIn = (over: Partial<KeywordRelationship> = {}): KeywordRelationship => ({
  ...emilysRelationship(),
  role: 'participant',
  ...over,
})

const inbound = (over: Partial<InboundSnapshot> = {}): InboundSnapshot => ({
  personId: james,
  holds: [],
  exchange: null,
  lastAcknowledgedAt: null,
  optedOut: false,
  mayBeTexted: true,
  ...over,
})

const checkIn = (over: Partial<CheckInSnapshot> = {}): CheckInSnapshot => ({
  personId: james,
  phone: '+15550100001',
  timeZone: 'UTC',
  leads: [],
  openSequence: null,
  lastCheckInAt: null,
  ...over,
})

const texting = (
  body: string,
  state: { readonly inbound?: InboundSnapshot; readonly checkIn?: CheckInSnapshot } = {},
  now = at,
) =>
  handleCommand(
    { type: 'sms.inbound', ministryId: ministry, personId: james, body },
    {
      ministryId: ministry,
      clock: createTestClock(now),
      ids: createSequentialIds(),
      ministryName: 'ABC Church',
      appBaseUrl: 'https://discipler.example',
      checkIn: state.checkIn ?? checkIn(),
      inbound: state.inbound ?? inbound(),
    } satisfies CommandContext,
  )

const bodies = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message.body] : []))

const recipients = (effects: readonly Effect[]) =>
  effects.flatMap((effect) =>
    effect.kind === 'message.enqueue' ? [effect.message.personId] : [],
  )

const events = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

const eventTypes = (effects: readonly Effect[]) => events(effects).map((event) => event.type)

const items = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'followUp.raise' ? [effect.item] : []))

const exchangesOpened = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'keyword.open' ? [effect.exchange] : []))

const exchangesClosed = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'keyword.close' ? [effect.closure] : []))

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

describe('resolving which relationship a keyword is about', () => {
  it('applies directly with no menu when exactly one is eligible', () => {
    const { effects } = texting('RESUME', {
      inbound: inbound({ holds: [emilysRelationship({ paused: true })] }),
    })

    expect(exchangesOpened(effects)).toEqual([])
    expect(eventTypes(effects)).toEqual(['relationship.resumed'])
  })

  it('opens a numbered menu when several are eligible, and applies nothing yet', () => {
    const { effects } = texting('SWAP', {
      inbound: inbound({ holds: [sarahsRelationship(), emilysRelationship()] }),
    })

    const [exchange, ...rest] = exchangesOpened(effects)
    expect(rest).toEqual([])
    // Numbered by start date and not by the order the rows arrived in: Emily's
    // relationship started a month earlier, so it is `1` however the snapshot
    // listed them.
    expect(exchange?.options.map((option) => option.relationshipId)).toEqual([
      withEmily,
      withSarah,
    ])
    expect(exchange?.target).toBeNull()

    expect(bodies(effects)).toEqual([
      'ABC Church: Which one would you like us to look at? 1. Emily Johnson 2. Sarah Reed',
    ])

    // Nothing has happened to either relationship.
    expect(items(effects)).toEqual([])
    expect(events(effects)).toEqual([])
  })

  it('replies plainly and changes nothing when none is eligible', () => {
    const { effects } = texting('RESUME', {
      inbound: inbound({ holds: [emilysRelationship()] }),
    })

    expect(bodies(effects)).toEqual([
      'ABC Church: You have no paused check-ins to restart at the moment.',
    ])
    expect(events(effects)).toEqual([])
    expect(items(effects)).toEqual([])
    expect(exchangesOpened(effects)).toEqual([])
  })

  it('is eligible per command, so one paused among three resolves RESUME with no menu', () => {
    // The proof that eligibility is per command rather than *how many do they
    // hold*: three relationships, and no menu at all.
    const held = [
      emilysRelationship(),
      sarahsRelationship({ paused: true }),
      davidsRelationship(),
    ]

    const resume = texting('RESUME', { inbound: inbound({ holds: held }) })
    expect(exchangesOpened(resume.effects)).toEqual([])
    expect(events(resume.effects).map((event) => event.subjectId)).toEqual([withSarah])

    // The same three, and `SWAP` sees all of them -- including the paused one.
    const swap = texting('SWAP', { inbound: inbound({ holds: held }) })
    expect(exchangesOpened(swap.effects)[0]?.options).toHaveLength(3)
  })

  it('never resolves the target from Check-In Sequence position', () => {
    // A conversation is open and its question is about Emily. `RESUME` resolves to
    // Sarah's relationship regardless, because that is the paused one -- the
    // position in the sequence disambiguates an *answer* and is not borrowed here.
    const { effects } = texting('RESUME', {
      inbound: inbound({
        holds: [emilysRelationship(), sarahsRelationship({ paused: true })],
      }),
      checkIn: aConversationAbout(withEmily),
    })

    expect(events(effects).map((event) => event.subjectId)).toEqual([withSarah])
  })

  it('offers SWAP on a relationship nobody has accepted, where it reads as a decline', () => {
    const { effects } = texting('SWAP', {
      inbound: inbound({ holds: [emilysRelationship({ acceptedAt: null })] }),
    })

    expect(items(effects)).toEqual([
      {
        ministryId: ministry,
        kind: 'swap_requested',
        relationshipId: withEmily,
        personId: james,
        raisedAt: at,
        requestedBy: 'leader',
      },
    ])
  })

  it('refuses PAUSE on a relationship nobody has accepted, which has nothing to suspend', () => {
    const { effects } = texting('PAUSE', {
      inbound: inbound({ holds: [emilysRelationship({ acceptedAt: null })] }),
    })

    expect(bodies(effects)).toEqual([
      'ABC Church: There are no check-ins to pause at the moment.',
    ])
  })
})

// ---------------------------------------------------------------------------
// PAUSE
// ---------------------------------------------------------------------------

describe('PAUSE', () => {
  const alone = inbound({ holds: [emilysRelationship()] })

  it('confirms the target and the duration in one exchange', () => {
    const { effects } = texting('PAUSE', { inbound: alone })

    expect(bodies(effects)).toEqual([
      'ABC Church: Pause check-ins with Emily Johnson for 2 weeks? Reply YES to ' +
        'confirm, or reply 1, 4, 8, or 12 for a different number of weeks.',
    ])
    // Confirmed, not applied. Nothing is paused until the Leader says so.
    expect(events(effects)).toEqual([])
    expect(exchangesOpened(effects)[0]?.target?.relationshipId).toEqual(withEmily)
  })

  it('confirms even with only one relationship, because that is the accidental-tap guard', () => {
    // A menu is disambiguation and this is not: a Leader with one relationship has
    // the same pocket as a Leader with three.
    expect(exchangesOpened(texting('PAUSE', { inbound: alone }).effects)).toHaveLength(1)
  })

  it('accepts the written confirmation and the numeric alternatives alike', () => {
    for (const [reply, periodWeeks] of [
      ['YES', 2],
      ['yes', 2],
      ['1', 1],
      ['12', 12],
      ['two weeks', 2],
      ['8 weeks', 8],
    ] as const) {
      const { effects } = texting(reply, {
        inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
      })

      expect(events(effects)[0]).toMatchObject({
        type: 'relationship.paused',
        subjectId: withEmily,
        payload: { periodWeeks, pausedBy: null, route: 'keyword' },
      })
    }
  })

  it('tells the Leader it is done, and tells the Participant nothing', () => {
    const { effects } = texting('YES', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
    })

    expect(recipients(effects)).toEqual([james])
    expect(bodies(effects)).toEqual([
      'ABC Church: Done — your check-ins about Emily Johnson are paused for 2 ' +
        'weeks. Reply RESUME any time to start them again sooner.',
    ])
  })

  it('takes back the check-in question that was out on the relationship it paused', () => {
    const { effects } = texting('YES', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
      checkIn: aConversationAbout(withEmily),
    })

    // Withdrawn, not passed over. A passed-over question is a silence the Leader
    // owns; this one Discipler took back, so the week it belonged to reads as
    // nothing having been asked.
    expect(eventTypes(effects)).toEqual([
      'relationship.paused',
      'checkin.question_withdrawn',
      'checkin.sequence_abandoned',
    ])
    expect(events(effects)[1]).toMatchObject({
      subjectId: withEmily,
      payload: { reason: 'paused' },
    })
  })

  it('leaves a question about a different relationship exactly where it was', () => {
    const { effects } = texting('YES', {
      inbound: inbound({
        holds: [emilysRelationship(), sarahsRelationship()],
        exchange: confirming(),
      }),
      // The open question is about Sarah; the pause is about Emily.
      checkIn: aConversationAbout(withSarah),
    })

    expect(eventTypes(effects)).toEqual(['relationship.paused'])
  })
})

// ---------------------------------------------------------------------------
// RESUME
// ---------------------------------------------------------------------------

describe('RESUME', () => {
  const paused = inbound({ holds: [emilysRelationship({ paused: true })] })

  it('resumes immediately, with no confirmation to give', () => {
    const { effects } = texting('RESUME', { inbound: paused })

    expect(events(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'relationship.resumed',
        subjectType: 'relationship',
        subjectId: withEmily,
        payload: { resumedBy: null, route: 'keyword', expired: false },
      },
    ])
  })

  it('releases the Resume Message to everyone in the relationship', () => {
    const { effects } = texting('RESUME', { inbound: paused })

    expect(recipients(effects)).toEqual([james, emily])
    expect(bodies(effects)).toEqual([
      'ABC Church: Your discipleship with Emily Johnson has been resumed! Msg & ' +
        'data rates may apply. Reply STOP to opt out, HELP for help.',
      'ABC Church: Your discipleship with James Harden has been resumed! Msg & ' +
        'data rates may apply. Reply STOP to opt out, HELP for help.',
    ])
  })

  it('leaves no standing pause for the tick to raise an expiry item about', () => {
    // The rule falls out of the model rather than being enforced by a second check:
    // `relationship.resumed` is the later event, so `relationship_pauses` no longer
    // returns this relationship at all and the tick never sees it.
    const { effects } = texting('RESUME', { inbound: paused })
    expect(items(effects)).toEqual([])
    expect(eventTypes(effects)).toEqual(['relationship.resumed'])
  })
})

// ---------------------------------------------------------------------------
// SWAP
// ---------------------------------------------------------------------------

describe('SWAP', () => {
  it('raises an item naming the Leader, the relationship and the side that asked', () => {
    const { effects } = texting('SWAP', {
      inbound: inbound({ holds: [emilysRelationship()] }),
    })

    expect(items(effects)).toEqual([
      {
        ministryId: ministry,
        kind: 'swap_requested',
        relationshipId: withEmily,
        personId: james,
        raisedAt: at,
        requestedBy: 'leader',
      },
    ])
  })

  it('says which side asked, because an Admin acts differently on each', () => {
    const { effects } = texting('SWAP', {
      inbound: inbound({ personId: james, holds: [beingDiscipledIn()] }),
    })

    expect(items(effects)[0]).toMatchObject({ requestedBy: 'participant' })
  })

  it('changes no state and coexists with a Pause', () => {
    const { effects } = texting('SWAP', {
      inbound: inbound({ holds: [emilysRelationship({ paused: true })] }),
    })

    expect(items(effects)).toHaveLength(1)
    // Nothing ends it, nothing resumes it, nobody moves.
    expect(eventTypes(effects)).toEqual(['relationship.swap_requested'])
    expect(bodies(effects)).toEqual([
      "ABC Church: Thanks for letting us know about Emily Johnson. We've passed " +
        'this on and someone will be in touch. Nothing changes in the meantime.',
    ])
  })
})

// ---------------------------------------------------------------------------
// The Keyword Exchange
// ---------------------------------------------------------------------------

describe('the Keyword Exchange', () => {
  it('is replaced by a second keyword, so at most one is ever open', () => {
    const { effects } = texting('SWAP', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
    })

    expect(exchangesClosed(effects)).toEqual([
      {
        ministryId: ministry,
        exchangeId: keywordExchangeId('exchange-1'),
        closedAt: at,
        outcome: 'replaced',
      },
    ])
    expect(items(effects)).toHaveLength(1)
  })

  it('takes the next reply when it is the most recent thing asked', () => {
    // Opened mid-sequence. The check-in question stays unanswered with its own
    // reminder clock still running, and `YES` belongs to the exchange.
    const { effects } = texting('YES', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
      checkIn: aConversationAbout(withSarah),
    })

    expect(effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(eventTypes(effects)).toEqual(['relationship.paused'])
  })

  it('gives the reply back to a check-in question a tick has since re-sent', () => {
    // *The most recent prompt owns the next reply* cuts both ways: a reminder is
    // the question put again, and the Leader is looking at it.
    const remindedAt = new Date(at.getTime() + hours(2))

    const { effects } = texting('1', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
      checkIn: aConversationAbout(withEmily, { remindedAt }),
    })

    expect(effects.filter((effect) => effect.kind === 'checkin.answer')).toHaveLength(1)
  })

  it('expires after twenty-four hours, with no reminder and nothing raised', () => {
    const later = new Date(at.getTime() + hours(24))

    const { effects } = texting('YES', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
      checkIn: aConversationAbout(withEmily),
    }, later)

    // Closed as expired, and the reply falls through to the check-in question it
    // was always also an answer to. Nothing is paused.
    expect(exchangesClosed(effects)).toMatchObject([{ outcome: 'expired' }])
    expect(eventTypes(effects)).not.toContain('relationship.paused')
  })

  it('does not send a reminder while it waits', () => {
    // Nothing in the domain re-prompts an exchange -- there is no route that could.
    // The tick never sees one, and this is the whole of the proof.
    const nearlyExpired = new Date(at.getTime() + hours(23))
    const { effects } = texting('what?', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: confirming() }),
    }, nearlyExpired)

    expect(bodies(effects)).toEqual([
      "ABC Church: Sorry, we didn't catch that. Reply YES to confirm, or a number of weeks.",
    ])
  })

  it('stops clarifying after two, and still honours a valid reply until it expires', () => {
    const spent = confirming({ clarificationsSent: 2 })

    const silent = texting('what?', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: spent }),
    })
    expect(bodies(silent.effects)).toEqual([])
    // Recorded even past the cap: this is where the enumerated forms grow from.
    expect(eventTypes(silent.effects)).toEqual(['keyword.reply_unreadable'])

    const nineteenHoursLater = new Date(at.getTime() + hours(19))
    const honoured = texting('YES', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: spent }),
    }, nineteenHoursLater)
    expect(eventTypes(honoured.effects)).toEqual(['relationship.paused'])
  })

  it('re-prints the menu rather than telling the Leader to reply with a number', () => {
    const { effects } = texting('the first one', {
      inbound: inbound({
        holds: [emilysRelationship(), sarahsRelationship()],
        exchange: choosing(),
      }),
    })

    expect(bodies(effects)).toEqual([
      "ABC Church: Sorry, we didn't catch that. 1. Emily Johnson 2. Sarah Reed",
    ])
  })

  it('asks a pause for its duration after a menu selection, and only then applies', () => {
    const { effects } = texting('2', {
      inbound: inbound({
        holds: [emilysRelationship(), sarahsRelationship()],
        exchange: choosing('PAUSE'),
      }),
    })

    expect(events(effects)).toEqual([])
    expect(bodies(effects)).toEqual([
      'ABC Church: Pause check-ins with Sarah Reed for 2 weeks? Reply YES to ' +
        'confirm, or reply 1, 4, 8, or 12 for a different number of weeks.',
    ])
  })

  it('applies a resume on the selection itself, because it has nothing to confirm', () => {
    const paused = [emilysRelationship({ paused: true }), sarahsRelationship({ paused: true })]

    const { effects } = texting('1', {
      inbound: inbound({ holds: paused, exchange: choosing('RESUME', paused) }),
    })

    expect(exchangesClosed(effects)).toMatchObject([{ outcome: 'applied' }])
    expect(events(effects).map((event) => event.subjectId)).toEqual([withEmily])
  })

  it('says plainly that there is nothing left when the world moved while it waited', () => {
    // An Admin paused the same relationship an hour ago. The confirmation is
    // answered honestly and there is nothing to apply it to.
    const { effects } = texting('YES', {
      inbound: inbound({
        holds: [emilysRelationship({ paused: true })],
        exchange: confirming({ target: emilysRelationship({ paused: true }) }),
      }),
    })

    expect(exchangesClosed(effects)).toMatchObject([{ outcome: 'overtaken' }])
    expect(events(effects)).toEqual([])
    expect(bodies(effects)).toEqual([
      'ABC Church: There are no check-ins to pause at the moment.',
    ])
  })
})

// ---------------------------------------------------------------------------
// Keywords against the conversation
// ---------------------------------------------------------------------------

describe('a keyword arriving mid-conversation', () => {
  it('is read as a keyword during the Concern detail step, leaving the Concern intact', () => {
    const { effects } = texting('PAUSE', {
      inbound: inbound({ holds: [emilysRelationship()] }),
      checkIn: aConversationAbout(withEmily, { question: 'concern_detail' }),
    })

    // No answer is recorded, so the Concern raised by the `C` before it stands
    // exactly as it was, and the detail request ages out normally.
    expect(effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(effects.filter((effect) => effect.kind === 'concern.raise')).toEqual([])
    expect(exchangesOpened(effects)).toHaveLength(1)
  })

  it('leaves the check-in question unanswered with its reminder clock running', () => {
    const { effects } = texting('PAUSE', {
      inbound: inbound({ holds: [sarahsRelationship()] }),
      checkIn: aConversationAbout(withEmily),
    })

    // Nothing touches the prompt: no answer, no clarification, no reminder.
    expect(
      effects.filter(
        (effect) =>
          effect.kind === 'checkin.answer' ||
          effect.kind === 'checkin.clarify' ||
          effect.kind === 'checkin.remind',
      ),
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// START and HELP
// ---------------------------------------------------------------------------

describe('START', () => {
  it('restores messaging to an opted-out Person and resumes no relationship', () => {
    const { effects } = texting('START', {
      inbound: inbound({
        optedOut: true,
        mayBeTexted: false,
        holds: [emilysRelationship({ paused: true })],
      }),
    })

    expect(effects.filter((effect) => effect.kind === 'person.opt_in')).toEqual([
      { kind: 'person.opt_in', optIn: { ministryId: ministry, personId: james, endedAt: at } },
    ])
    expect(eventTypes(effects)).toEqual(['person.opted_in'])
    // The pause is untouched, and no Resume Message reaches anybody.
    expect(bodies(effects)).toEqual([])
  })

  it('changes nothing for somebody who never opted out', () => {
    expect(texting('START', { inbound: inbound({ holds: [emilysRelationship()] }) }).effects)
      .toEqual([])
  })
})

describe('a Person Discipler is not allowed to text', () => {
  // A text arrives with no session and no consent test in front of it: the sender is
  // resolved by their number alone, so somebody imported onto the Roster who never
  // completed Intake can reach this webhook. Every reply Discipler might compose for
  // them is one the outbound queue refuses at the floor -- and the refusal aborts the
  // whole command, so their message would fail outright and the delivery vendor would
  // retry the identical failure. Silence is the only safe answer.
  const neverConsented = inbound({ mayBeTexted: false, holds: [beingDiscipledIn()] })

  it('is answered by nothing, keyword or free text', () => {
    expect(texting('SWAP', { inbound: neverConsented }).effects).toEqual([])
    expect(texting('HELP', { inbound: neverConsented }).effects).toEqual([])
    expect(texting('hello?', { inbound: neverConsented }).effects).toEqual([])
  })
})

describe('a resume where somebody in the relationship has opted out', () => {
  // Opting out ends no relationship -- that is the point of it being person-level --
  // so a Participant who texted `STOP` is still an open member of everything they
  // were in. Writing to them would be refused by the outbound queue, and the refusal
  // would take the Leader's resume down with it.
  const emilyHasOptedOut = emilysRelationship({
    paused: true,
    members: emilysRelationship().members.map((member) =>
      member.role === 'participant' ? { ...member, reachable: false } : member,
    ),
  })

  it('still resumes, and simply writes to nobody it may not reach', () => {
    const { effects } = texting('RESUME', { inbound: inbound({ holds: [emilyHasOptedOut] }) })

    expect(eventTypes(effects)).toEqual(['relationship.resumed'])
    expect(recipients(effects)).toEqual([james])
  })

  it('still names them in the message the other side receives', () => {
    // Who receives a message is a fact about their own consent; what it says is a
    // fact about the relationship, and the two are not the same question.
    const { effects } = texting('RESUME', { inbound: inbound({ holds: [emilyHasOptedOut] }) })

    expect(bodies(effects)[0]).toContain('Emily Johnson')
  })
})

describe('anything else from a Person who has opted out', () => {
  // The outbound queue refuses a message to somebody with a standing opt-out, and a
  // command that composed one would roll the whole transaction back -- so their
  // message would fail outright rather than reach nobody quietly. `START` is the one
  // thing they can say that Discipler is allowed to act on.
  const goneQuiet = (over: Partial<InboundSnapshot> = {}) =>
    inbound({ optedOut: true, mayBeTexted: false, holds: [emilysRelationship()], ...over })

  it('is heard and answered by nothing, keyword or not', () => {
    expect(texting('PAUSE', { inbound: goneQuiet() }).effects).toEqual([])
    expect(texting('HELP', { inbound: goneQuiet() }).effects).toEqual([])
    expect(texting('thanks!', { inbound: goneQuiet() }).effects).toEqual([])
  })

  it('does not answer a check-in question either, however the conversation was left', () => {
    const { effects } = texting('1', {
      inbound: goneQuiet(),
      checkIn: aConversationAbout(withEmily),
    })

    expect(effects).toEqual([])
  })
})

describe('HELP', () => {
  it('answers with the keywords and the A2P prefix compliance requires on it', () => {
    const { effects } = texting('HELP', {
      inbound: inbound({ holds: [emilysRelationship()] }),
    })

    expect(bodies(effects)).toEqual([
      'Discipler: ABC Church: Reply PAUSE to pause your check-ins, RESUME to start ' +
        'them again, or SWAP to ask about a different match. For anything else, ' +
        'please contact ABC Church directly. Msg & data rates may apply. Reply STOP ' +
        'to opt out, HELP for help.',
    ])
    expect(events(effects)).toEqual([])
  })

  it('replaces no exchange, because asking what the words are abandons nothing', () => {
    const { effects } = texting('HELP', {
      inbound: inbound({ holds: [emilysRelationship()], exchange: choosing() }),
    })

    expect(exchangesClosed(effects)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Nobody is left unanswered
// ---------------------------------------------------------------------------

describe('a Person who leads nothing', () => {
  const participant = inbound({ holds: [beingDiscipledIn()] })

  it('has their PAUSE acknowledged and put in front of an Admin', () => {
    const { effects } = texting('PAUSE', { inbound: participant })

    expect(items(effects)).toEqual([
      {
        ministryId: ministry,
        kind: 'participant_keyword',
        relationshipId: null,
        personId: james,
        raisedAt: at,
        keyword: 'PAUSE',
      },
    ])
    expect(bodies(effects)).toEqual([
      "ABC Church: Thanks — we've passed this on to ABC Church and someone will be " +
        'in touch. Nothing changes in the meantime.',
    ])
    // And nothing at all has happened to the relationship.
    expect(events(effects).map((event) => event.type)).toEqual(['inbound.keyword_passed_on'])
  })

  it('reaches SWAP through the same keyword a Leader uses', () => {
    const { effects } = texting('SWAP', { inbound: participant })

    expect(items(effects)).toMatchObject([
      { kind: 'swap_requested', relationshipId: withEmily, requestedBy: 'participant' },
    ])
  })

  it('has their HELP answered and passed on as well', () => {
    const { effects } = texting('HELP', { inbound: participant })
    expect(items(effects)).toMatchObject([{ kind: 'participant_keyword', keyword: 'HELP' }])
  })
})

describe('free text nothing can be made of', () => {
  it('is answered once, pointing at the Ministry, and raises nothing', () => {
    const { effects } = texting('thanks so much!', {
      inbound: inbound({ holds: [beingDiscipledIn()] }),
    })

    expect(bodies(effects)).toEqual([
      "ABC Church: Thanks for your message. We can't reply to texts here — please " +
        'contact ABC Church directly and someone will get back to you.',
    ])
    expect(items(effects)).toEqual([])
    // The event carries no payload at all. It exists for the rate limit, and what
    // somebody texts a number that cannot answer them is as likely to be their
    // hardest news as a thank-you -- `ministry_event` is append-only, so prose
    // written here could never be cleared.
    expect(events(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'inbound.acknowledged',
        subjectType: 'person',
        subjectId: james,
        payload: {},
      },
    ])
  })

  it('is answered at most once a day, so a back-and-forth is not auto-replied to', () => {
    const anHourLater = new Date(at.getTime() + hours(1))

    const { effects } = texting('and one more thing', {
      inbound: inbound({ holds: [beingDiscipledIn()], lastAcknowledgedAt: at }),
    }, anHourLater)

    expect(effects).toEqual([])
  })

  it('is answered again once the window has passed', () => {
    const aDayLater = new Date(at.getTime() + hours(24))

    const { effects } = texting('are you there?', {
      inbound: inbound({ holds: [beingDiscipledIn()], lastAcknowledgedAt: at }),
    }, aDayLater)

    expect(bodies(effects)).toHaveLength(1)
  })

  it('does not answer prose that merely contains a keyword as though it were one', () => {
    // Whole-message matching. *We had to pause for a bit* is a Leader describing a
    // pause, not asking for one.
    const { effects } = texting('we had to pause for a bit', {
      inbound: inbound({ holds: [emilysRelationship()] }),
    })

    expect(exchangesOpened(effects)).toEqual([])
    expect(eventTypes(effects)).toEqual(['inbound.acknowledged'])
  })
})

// ---------------------------------------------------------------------------
// Fixtures whose shape is worth reading once
// ---------------------------------------------------------------------------

/**
 * An exchange sitting on its numbered menu, with nothing chosen yet.
 *
 * The options are a snapshot of what the menu printed, read back fresh -- so a test
 * that wants a `RESUME` menu has to say the relationships in it are paused, exactly
 * as the database would. That is not a fixture detail: it is what lets the
 * eligibility rule refuse a target an Admin has since acted on.
 */
function choosing(
  keyword: OpenKeywordExchange['keyword'] = 'SWAP',
  options: readonly KeywordRelationship[] = [emilysRelationship(), sarahsRelationship()],
): OpenKeywordExchange {
  return {
    exchangeId: keywordExchangeId('exchange-1'),
    keyword,
    openedAt: at,
    promptedAt: at,
    options,
    target: null,
    clarificationsSent: 0,
  }
}

/** A `PAUSE` waiting on its one confirmation. */
function confirming(over: Partial<OpenKeywordExchange> = {}): OpenKeywordExchange {
  return {
    exchangeId: keywordExchangeId('exchange-1'),
    keyword: 'PAUSE',
    openedAt: at,
    promptedAt: at,
    options: [emilysRelationship()],
    target: emilysRelationship(),
    clarificationsSent: 0,
    ...over,
  }
}

/**
 * A check-in conversation with its opening question out about one relationship.
 * The keyword tests care only that a question is open and which relationship it
 * belongs to; the ladder itself is `answering-a-check-in.test.ts`'s.
 */
function aConversationAbout(
  about: typeof withEmily,
  over: { readonly question?: 'met' | 'concern_detail'; readonly remindedAt?: Date } = {},
): CheckInSnapshot {
  const covering: CheckInRelationship[] = [
    {
      relationshipId: about,
      role: 'leader',
      startedAt: new Date('2026-03-01T09:00:00Z'),
      participantNames: ['Emily Johnson'],
      acceptedAt: new Date('2026-05-01T09:00:00Z'),
      paused: false,
      cadence: { day: 1, hour: 20 },
    },
  ]

  const openSequence: OpenSequence = {
    sequenceId: checkInSequenceId('sequence-1'),
    startedAt: new Date(at.getTime() - hours(3)),
    covering,
    awaiting: {
      promptId: checkInPromptId('prompt-1'),
      relationshipId: about,
      position: 1,
      question: over.question ?? 'met',
      askedAt: new Date(at.getTime() - hours(3)),
      remindedAt: over.remindedAt ?? null,
      clarificationsSent: 0,
    },
  }

  return checkIn({ leads: covering, openSequence })
}
