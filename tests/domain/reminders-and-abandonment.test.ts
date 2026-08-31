import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock, hours } from '~/domain/clock'
import {
  checkInPromptId,
  checkInSequenceId,
  type CheckInRelationship,
  type CheckInSnapshot,
  type OpenPrompt,
  type OpenSequence,
} from '~/domain/check-in'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { withoutTheSweep } from '../support/effects'
import { anInboundSnapshot } from '../support/inbound'

/**
 * What happens when a Leader does not answer, and what happens when they answer
 * something Discipler cannot read.
 *
 * The property under all of it: Discipler's side is capped and the Leader's is
 * not. It stops re-prompting after two clarifications and stops chasing after one
 * reminder, and at no point does it stop listening -- a valid reply is accepted
 * right up until the sequence has moved past the question it answers.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const james = personId('00000000-0000-4000-8000-0000000000d0')
const sequenceId = checkInSequenceId('00000000-0000-4000-8000-0000000000e1')
const promptId = checkInPromptId('00000000-0000-4000-8000-0000000000f1')

const emily = relationshipId('00000000-0000-4000-8000-0000000000b1')
const marcus = relationshipId('00000000-0000-4000-8000-0000000000b2')

/**
 * Monday 24 August 2026, 8pm in London -- the Ministry's cadence instant for ISO
 * week 2026-W35. Every clock below is an offset from it, and none of them leaves
 * the week: a new week would abandon the sequence, which is a different rule with
 * its own tests at the bottom of this file.
 */
const asked = new Date('2026-08-24T19:00:00Z')
const after = (elapsed: number) => new Date(asked.getTime() + elapsed)

/** The same instant a week later, which is when the cadence next comes due. */
const nextWeek = new Date('2026-08-31T19:00:00Z')

const leads = (id: typeof emily, startedOn: string, names: readonly string[]): CheckInRelationship => ({
  relationshipId: id,
  role: 'leader',
  startedAt: new Date(startedOn),
  participantNames: names,
  acceptedAt: new Date(startedOn),
  paused: false,
  cadence: { day: 1, hour: 20 },
})

const covering = [
  leads(emily, '2026-03-02T09:00:00Z', ['Emily']),
  leads(marcus, '2026-06-01T09:00:00Z', ['Marcus', 'Dan']),
]

const awaiting = (over: Partial<OpenPrompt> = {}): OpenPrompt => ({
  promptId,
  relationshipId: emily,
  position: 1,
  question: 'met',
  askedAt: asked,
  remindedAt: null,
  clarificationsSent: 0,
  ...over,
})

const openSequence = (over: Partial<OpenSequence> = {}): OpenSequence => ({
  sequenceId,
  startedAt: asked,
  covering,
  awaiting: awaiting(),
  ...over,
})

const snapshot = (over: Partial<CheckInSnapshot> = {}): CheckInSnapshot => ({
  personId: james,
  phone: '+15550100001',
  timeZone: 'Europe/London',
  leads: covering,
  openSequence: openSequence(),
  // This week's conversation is the one that is open, so the cadence has nothing
  // left to do until the week turns over.
  lastCheckInAt: asked,
  ...over,
})

/** The same conversation, with one or both of its relationships now paused. */
const withPaused = (...ids: readonly (typeof emily)[]) => {
  const relationships = covering.map((relationship) => ({
    ...relationship,
    paused: ids.includes(relationship.relationshipId),
  }))

  return snapshot({
    leads: relationships,
    openSequence: openSequence({ covering: relationships }),
  })
}

const replying = (body: string, checkIn: CheckInSnapshot = snapshot(), at: Date = after(hours(1))) =>
  handleCommand({ type: 'sms.inbound', ministryId: ministry, personId: james, body }, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'ABC Church',
    appBaseUrl: 'https://discipler.example',
    checkIn,
    inbound: anInboundSnapshot({ personId: james }),
  } satisfies CommandContext)

const ticking = (at: Date, checkIn: CheckInSnapshot = snapshot()) =>
  handleCommand({ type: 'scheduled.tick', ministryId: ministry }, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'ABC Church',
    appBaseUrl: 'https://discipler.example',
    unaccepted: [],
    paused: [],
    checkInsDue: [checkIn],
  } satisfies CommandContext)

const bodies = (effects: readonly Effect[]): string[] =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message.body] : []))

const historyTypes = (effects: readonly Effect[]): string[] =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event.type] : []))

const eventOf = (effects: readonly Effect[], type: string) =>
  effects.flatMap((effect) =>
    effect.kind === 'history.append' && effect.event.type === type ? [effect.event] : [],
  )[0]

const MEETING_QUESTION =
  'ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no.'
const MEETING_CLARIFICATION =
  'ABC Church: Sorry, we didn’t catch that. Reply 1 for yes, 2 for no.'

describe('a reply Discipler cannot read', () => {
  it('answers with the valid replies rather than silence', () => {
    expect(bodies(replying("it wasn't great").effects)).toEqual([MEETING_CLARIFICATION])
  })

  it('names the replies belonging to the question that is open', () => {
    const rating = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ question: 'satisfaction' }) }),
    })
    expect(bodies(replying('sort of', rating).effects)).toEqual([
      'ABC Church: Sorry, we didn’t catch that. Reply A for outstanding, B for good, C for concern.',
    ])
  })

  it('leaves the question open and records nothing as answered', () => {
    const result = replying('no concerns')
    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(result.effects.filter((effect) => effect.kind === 'checkin.ask')).toEqual([])
  })

  it('records what was actually typed, so the enumerated list can grow from it', () => {
    const event = eventOf(replying('yess').effects, 'checkin.reply_unreadable')
    expect(event).toMatchObject({
      subjectId: emily,
      payload: { sequenceId, question: 'met', body: 'yess' },
    })
  })

  it('clarifies twice and then stops re-prompting', () => {
    expect(bodies(replying('?', snapshot()).effects)).toEqual([MEETING_CLARIFICATION])

    const once = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ clarificationsSent: 1 }) }),
    })
    expect(bodies(replying('?', once).effects)).toEqual([MEETING_CLARIFICATION])

    const twice = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ clarificationsSent: 2 }) }),
    })
    expect(bodies(replying('?', twice).effects)).toEqual([])
  })

  it('still records the third unreadable reply it does not answer', () => {
    const twice = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ clarificationsSent: 2 }) }),
    })
    expect(historyTypes(replying('?', twice).effects)).toEqual(['checkin.reply_unreadable'])
  })

  it('counts a clarification only when one was sent', () => {
    const clarifications = (checkIn: CheckInSnapshot) =>
      replying('?', checkIn).effects.filter((effect) => effect.kind === 'checkin.clarify')

    expect(clarifications(snapshot())).toHaveLength(1)
    expect(
      clarifications(
        snapshot({ openSequence: openSequence({ awaiting: awaiting({ clarificationsSent: 2 }) }) }),
      ),
    ).toHaveLength(0)
  })

  it('accepts a valid reply after the cap, because only Discipler’s side is capped', () => {
    const capped = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ clarificationsSent: 2 }) }),
    })
    const result = replying('yes', capped)

    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toMatchObject([
      { answer: { promptId, met: true } },
    ])
    expect(bodies(result.effects)).toEqual([
      'ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern.',
    ])
  })
})

describe('a question nobody answered', () => {
  it('is left alone before twenty-four hours have passed', () => {
    expect(withoutTheSweep(ticking(after(hours(23))).effects)).toEqual([])
  })

  it('is re-sent once at twenty-four hours', () => {
    const result = ticking(after(hours(24)))
    expect(bodies(result.effects)).toEqual([MEETING_QUESTION])
    expect(historyTypes(result.effects)).toEqual(['checkin.question_reminded'])
  })

  it('is re-sent as itself and not as a second question', () => {
    const result = ticking(after(hours(24)))
    // No new prompt row. The reminder is the same question again, so nothing
    // downstream can count it as a second one the Leader failed to answer.
    expect(result.effects.filter((effect) => effect.kind === 'checkin.ask')).toEqual([])
    expect(result.effects.filter((effect) => effect.kind === 'checkin.remind')).toMatchObject([
      { reminder: { promptId } },
    ])
  })

  it('is not re-sent twice, however often the tick runs', () => {
    const reminded = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ remindedAt: after(hours(24)) }) }),
    })
    expect(withoutTheSweep(ticking(after(hours(30)), reminded).effects)).toEqual([])
  })

  it('carries no cadence stamp: a lapse produced it, not a Monday', () => {
    const [message] = ticking(after(hours(24))).effects.flatMap((effect) =>
      effect.kind === 'message.enqueue' ? [effect.message] : [],
    )
    expect(message?.scheduledFor).toBeNull()
  })
})

describe('a reminder nobody answered', () => {
  const reminded = (over: Partial<OpenPrompt> = {}) =>
    snapshot({
      openSequence: openSequence({
        awaiting: awaiting({ remindedAt: after(hours(24)), ...over }),
      }),
    })

  it('moves the conversation on to the next relationship', () => {
    const result = ticking(after(hours(48)), reminded())

    expect(bodies(result.effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
    expect(result.effects.filter((effect) => effect.kind === 'checkin.ask')).toMatchObject([
      { prompt: { relationshipId: marcus, position: 2, question: 'met' } },
    ])
  })

  it('leaves the question it passed over unanswered, rather than tidying it away', () => {
    const result = ticking(after(hours(48)), reminded())
    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(historyTypes(result.effects)).toEqual(['checkin.question_passed_over'])
  })

  it('passes over an unanswered Concern detail request too, leaving the Concern recorded', () => {
    const concern = reminded({ question: 'concern_detail' })
    const result = ticking(after(hours(48)), concern)

    // The Concern was recorded when `C` was answered and the badge was raised
    // then. Nothing here revisits either -- only the request for more detail is
    // given up on.
    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(bodies(result.effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('ends the conversation when there is no next relationship, and does not thank the Leader', () => {
    const lastOne = reminded({ position: 2, relationshipId: marcus })
    const result = ticking(after(hours(48)), lastOne)

    expect(bodies(result.effects)).toEqual([])
    expect(result.effects.filter((effect) => effect.kind === 'checkin.close')).toMatchObject([
      { closure: { sequenceId, outcome: 'abandoned' } },
    ])
    // `abandoned` is the one outcome all three endings share, so the reason is
    // the only thing that says which this was.
    expect(eventOf(result.effects, 'checkin.sequence_abandoned')?.payload).toMatchObject({
      reason: 'unanswered',
    })
  })
})

describe('a new week arriving while a conversation is open', () => {
  // `lastCheckInAt` is still last week's, so the cadence is due again.
  const nextMonday = nextWeek

  it('abandons the open sequence and opens one conversation, not two', () => {
    const result = ticking(nextMonday)

    expect(result.effects.filter((effect) => effect.kind === 'checkin.close')).toMatchObject([
      { closure: { sequenceId, outcome: 'abandoned' } },
    ])
    expect(result.effects.filter((effect) => effect.kind === 'checkin.open')).toHaveLength(1)
    expect(eventOf(result.effects, 'checkin.sequence_abandoned')?.payload).toMatchObject({
      reason: 'displaced',
    })
  })

  it('does not chase the question it abandoned', () => {
    const stale = snapshot({
      openSequence: openSequence({ awaiting: awaiting({ remindedAt: after(hours(24)) }) }),
    })
    const result = ticking(nextMonday, stale)

    expect(historyTypes(result.effects)).toEqual([
      'checkin.sequence_abandoned',
      'checkin.sequence_opened',
    ])
  })

  it('rewrites nothing: last week’s unanswered question stays unanswered', () => {
    const result = ticking(nextMonday)
    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toEqual([])
    expect(
      result.effects.filter((effect) => effect.kind === 'checkin.remind'),
    ).toEqual([])
  })
})

describe('a late reply', () => {
  it('attaches to the question it answers and to nothing earlier', () => {
    // A reply binds to the question that is open, which is the question the
    // Leader was last sent. Nothing reaches back into the abandoned conversation
    // to mark last week's silence as answered -- that is the half of the rule
    // that can be got wrong, and getting it wrong would rewrite a week the
    // Ministry has already read.
    const thisWeek = snapshot({
      openSequence: openSequence({
        sequenceId: checkInSequenceId('00000000-0000-4000-8000-0000000000e2'),
        startedAt: nextWeek,
        awaiting: awaiting({
          promptId: checkInPromptId('00000000-0000-4000-8000-0000000000f2'),
          askedAt: nextWeek,
        }),
      }),
      lastCheckInAt: nextWeek,
    })

    const result = replying('yes', thisWeek, new Date(nextWeek.getTime() + hours(2)))

    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toMatchObject([
      { answer: { promptId: checkInPromptId('00000000-0000-4000-8000-0000000000f2') } },
    ])
  })

  it('is heard even after Discipler stopped re-prompting and stopped chasing', () => {
    const givenUpOn = snapshot({
      openSequence: openSequence({
        awaiting: awaiting({ clarificationsSent: 2, remindedAt: after(hours(24)) }),
      }),
    })
    const result = replying('we did', givenUpOn, after(hours(40)))

    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toMatchObject([
      { answer: { promptId, met: true } },
    ])
  })
})

/**
 * A Pause taken while a question is out.
 *
 * The rule the product settled: **a paused pair gets no next-day reminder.**
 * Discipler does not chase a Leader who has just stepped back, and the question
 * it had out is taken back rather than left to age into a silence the Leader
 * never owned.
 */
describe('a Pause taken while a question is waiting on an answer', () => {
  it('sends no reminder, however long the question has been out', () => {
    // The reminder is the one message a Pause exists to stop: a text to somebody
    // who has just told their Admin they are stepping back.
    expect(bodies(ticking(after(hours(24)), withPaused(emily)).effects)).not.toContain(
      MEETING_QUESTION,
    )
    expect(historyTypes(ticking(after(hours(24)), withPaused(emily)).effects)).not.toContain(
      'checkin.question_reminded',
    )
  })

  it('takes the question back the moment it notices, not at the next lapse', () => {
    // An hour in, well short of the twenty-four the reminder waits. Waiting for
    // the lapse would leave the conversation stuck on a relationship nobody is
    // being asked about for a day.
    const withdrawn = eventOf(
      ticking(after(hours(1)), withPaused(emily)).effects,
      'checkin.question_withdrawn',
    )

    expect(withdrawn).toMatchObject({
      subjectId: emily,
      payload: { sequenceId, promptId, question: 'met', reason: 'paused' },
    })
  })

  it('is withdrawn rather than passed over, so it is nobody’s silence', () => {
    // A passed-over question is a silence the Leader owns and ticket 10 counts.
    // This one is Discipler's to take back.
    expect(historyTypes(ticking(after(hours(48)), withPaused(emily)).effects)).not.toContain(
      'checkin.question_passed_over',
    )
  })

  it('moves the conversation on to the relationships still running', () => {
    expect(bodies(ticking(after(hours(1)), withPaused(emily)).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('skips past any other relationship paused alongside it, in silence', () => {
    // A relationship nobody was asked about has no question to withdraw and no
    // event to record -- the same silence `relationshipsToAskAbout` keeps when a
    // conversation opens without it.
    const both = ticking(after(hours(1)), withPaused(emily, marcus))

    expect(bodies(both.effects)).toEqual([])
    expect(historyTypes(both.effects)).toEqual([
      'checkin.question_withdrawn',
      'checkin.sequence_abandoned',
    ])
    expect(eventOf(both.effects, 'checkin.sequence_abandoned')?.payload).toMatchObject({
      sequenceId,
      reason: 'paused',
    })
  })

  it('leaves a running relationship’s question alone', () => {
    // The Pause is the relationship's, not the Leader's. One paused relationship
    // does not stop Discipler chasing a question about another.
    expect(bodies(ticking(after(hours(24)), withPaused(marcus)).effects)).toEqual([
      MEETING_QUESTION,
    ])
  })
})

/**
 * The other half of *a keyword mid-sequence takes the next reply*.
 *
 * Ticket 17 settles that an exchange opened mid-sequence takes the reply **while the
 * check-in question stays unanswered with its reminder clock running.** The keyword
 * tests prove the first half -- opening an exchange touches no prompt. This is the
 * half that says the clock kept running, and it is asserted positively rather than
 * inferred from the absence of a `checkin.remind` at keyword time.
 *
 * A request to pause is not a Pause. Only the confirmation applies one, and the
 * describe above is what changes once it has.
 */
describe('a question whose reply a keyword took', () => {
  it('is still reminded at twenty-four hours', () => {
    // The Leader texted `PAUSE` an hour in and has not confirmed, so nothing is
    // paused and Emily's question is still out. It is chased on time.
    //
    // This holds for every keyword rather than for `PAUSE` alone, and structurally:
    // `scheduled.tick` is handed no `InboundSnapshot`, so an open Keyword Exchange
    // is not in reach of the code that decides to remind. The snapshot below is the
    // whole of what the tick knows, and an exchange cannot be expressed in it.
    expect(bodies(ticking(after(hours(24))).effects)).toEqual([MEETING_QUESTION])
    expect(historyTypes(ticking(after(hours(24))).effects)).toEqual([
      'checkin.question_reminded',
    ])
  })
})

/**
 * The rest of *pausing suppresses that relationship's check-ins*.
 *
 * `covering` is fixed when the conversation opens so that a Pause halfway
 * through does not renumber the questions still to come -- which means a Pause
 * taken since is in nobody's list, and every route that moves the conversation
 * forward has to step over it. Withdrawing the one question that happened to be
 * out is not the rule; it is one of three places the rule applies.
 */
describe('a Pause reaching a relationship before its turn in the conversation did', () => {
  const MARCUS_QUESTION =
    'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.'
  const RATING_QUESTION =
    'ABC Church: How would you rate how it went? Reply 1 for great, 2 for okay, 3 for I have a concern.'

  it('asks nothing about it when a reply moves the conversation on', () => {
    // Emily's question answered, Marcus paused since. The next question in the
    // ladder is Marcus's, and sending it would be a check-in about a
    // relationship that is not being checked in on.
    const result = replying('2', withPaused(marcus))

    expect(bodies(result.effects)).not.toContain(MARCUS_QUESTION)
  })

  it('thanks the Leader instead, because the conversation is over', () => {
    // Marcus was the last relationship left. Skipped in silence, this
    // conversation has nothing else to ask -- so it finishes properly rather
    // than hanging on a question nobody will be sent.
    const result = replying('2', withPaused(marcus))

    expect(historyTypes(result.effects)).toContain('checkin.sequence_completed')
    expect(result.effects.filter((effect) => effect.kind === 'checkin.close')).toMatchObject([
      { closure: { sequenceId, outcome: 'completed' } },
    ])
  })

  it('asks no follow-up about the relationship the answer was about', () => {
    // *Yes we met*, about a relationship paused an hour ago. The answer stands
    // -- a Pause does not unsay it -- but the rating question is a new question,
    // and no new question is asked about a paused relationship.
    const result = replying('1', withPaused(emily))

    expect(bodies(result.effects)).not.toContain(RATING_QUESTION)
    expect(result.effects.filter((effect) => effect.kind === 'checkin.answer')).toHaveLength(1)
    expect(bodies(result.effects)).toEqual([MARCUS_QUESTION])
  })

  it('asks nothing about it when the question ahead of it is given up on', () => {
    // Emily's question reminded and now passed over -- a silence the Leader
    // owns. What follows it is still Marcus's turn, and Marcus is paused.
    const reminded = withPaused(marcus)
    const stale = {
      ...reminded,
      openSequence: { ...reminded.openSequence!, awaiting: awaiting({ remindedAt: after(hours(24)) }) },
    }
    const result = ticking(after(hours(48)), stale)

    expect(bodies(result.effects)).toEqual([])
    expect(historyTypes(result.effects)).toEqual([
      'checkin.question_passed_over',
      'checkin.sequence_abandoned',
    ])
  })

  it('records nothing about the turn it stepped over', () => {
    // Nothing was asked, so there is no question to withdraw. `relationship_weeks`
    // reads a covered relationship with no prompt as nothing having been asked,
    // and a withdrawal event here would be a record of something that never
    // happened.
    expect(historyTypes(replying('2', withPaused(marcus)).effects)).not.toContain(
      'checkin.question_withdrawn',
    )
  })
})

describe('a new week displacing a question a Pause had already taken back', () => {
  it('withdraws it on the way past rather than leaving it as silence', () => {
    // The one Admin whose Pause is displaced before any tick notices it: they
    // paused between the last tick and the cadence hour. Without the withdrawal
    // the week reads as the Leader's silence -- one week closer to `Stalled` for
    // a question Discipler had already stopped asking.
    const result = ticking(nextWeek, withPaused(emily))

    expect(eventOf(result.effects, 'checkin.question_withdrawn')).toMatchObject({
      subjectId: emily,
      payload: { sequenceId, promptId, question: 'met', reason: 'paused' },
    })
    expect(historyTypes(result.effects)).toEqual([
      'checkin.question_withdrawn',
      'checkin.sequence_abandoned',
      'checkin.sequence_opened',
    ])
  })

  it('leaves a running relationship’s unanswered question exactly as it was', () => {
    // *The pause does not answer the old ones.* A question nobody paused is a
    // silence the Leader owns, and a new week displacing it does not take it back.
    expect(historyTypes(ticking(nextWeek).effects)).not.toContain('checkin.question_withdrawn')
  })

  it('opens the new conversation about the relationships still running', () => {
    expect(bodies(ticking(nextWeek, withPaused(emily)).effects)).toEqual([
      'ABC Church: Did you meet with Marcus and Dan this week? Reply 1 for yes, 2 for no.',
    ])
  })
})
