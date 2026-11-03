import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import {
  checkInSentenceAsSent,
  checkInSentenceRefusals,
  checkInWordsInForce,
  DISCIPLERS_CHECK_IN_WORDS,
  fillingInTheName,
  NO_SAVED_CHECK_IN_WORDS,
  readCheckInWords,
  type CheckInWords,
} from '~/domain/check-in-words'
import {
  checkInPromptId,
  checkInSequenceId,
  type CheckInRelationship,
  type CheckInSnapshot,
  type OpenPrompt,
} from '~/domain/check-in'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { createTestClock, hours } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { KEYWORDS } from '~/domain/keywords'
import { CHECK_IN_SENTENCE } from '~/domain/launch-terms'
import { readMinistrySettings } from '~/domain/ministry-settings'
import {
  checkInThankYou,
  concernDetailRequest,
  meetingQuestion,
  relationshipSubject,
  satisfactionQuestion,
} from '~/domain/outbound-copy'
import { anInboundSnapshot } from '../support/inbound'

/**
 * The four sentences a church may rewrite inside the frame Discipler always writes
 * (Exponential launch, ticket 40, and ADR-0034).
 *
 * What is proved here is the frame's half of the bargain: whatever is typed into
 * those four lines, the start, the reply choices and the rates line are composed
 * around it and are not the church's to change. `check-in-copy.test.ts` holds
 * today's words byte for byte, so a church with none saved cannot drift from them.
 */

const ministryName = 'Riverside via Pastor Tim'

const churchWords: CheckInWords = {
  question: 'Did you get time with [name] this week?',
  rating: 'How was your time with [name]?',
  concern: 'What should we know about [name]?',
  thanks: 'Thanks for telling us about [name]. Talk next week.',
}

describe('the frame is composed around a church’s sentence', () => {
  it('sends the question with the name filled in, after the start and before the reply choices', () => {
    expect(
      meetingQuestion({
        ministryName: 'Riverside Chapel',
        subject: 'Jordan Ellis',
        discloseOptOut: false,
        words: churchWords,
      }),
    ).toBe(
      'Riverside Chapel via Discipler: Did you get time with Jordan Ellis this week? Reply 1 for yes, 2 for no.',
    )
  })

  it('keeps the rates line on the opening question, after the reply choices', () => {
    expect(
      meetingQuestion({
        ministryName,
        subject: 'Jordan Ellis',
        discloseOptOut: true,
        words: churchWords,
      }),
    ).toBe(
      'Riverside via Pastor Tim via Discipler: Did you get time with Jordan Ellis this week? Reply 1 for yes, 2 for no. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
  })

  it('keeps all four rating choices after a reworded rating line', () => {
    expect(
      satisfactionQuestion({
        ministryName: 'Riverside Chapel',
        wording: 'a_to_d',
        subject: 'Jordan Ellis',
        words: churchWords,
      }),
    ).toBe(
      'Riverside Chapel via Discipler: How was your time with Jordan Ellis? Reply A for outstanding, B for good, C for okay, D for concern.',
    )
  })

  it('still offers a three-answer question’s own choices, in the church’s words', () => {
    expect(
      satisfactionQuestion({
        ministryName: 'Riverside Chapel',
        wording: 'a_to_c',
        subject: 'Jordan Ellis',
        words: churchWords,
      }),
    ).toBe(
      'Riverside Chapel via Discipler: How was your time with Jordan Ellis? Reply A for outstanding, B for good, C for concern.',
    )
  })

  it('adds only the start to the two sentences that offer no replies', () => {
    expect(
      concernDetailRequest({
        ministryName: 'Riverside Chapel',
        subject: 'Jordan Ellis',
        words: churchWords,
      }),
    ).toBe('Riverside Chapel via Discipler: What should we know about Jordan Ellis?')
    expect(
      checkInThankYou({
        ministryName: 'Riverside Chapel',
        subject: 'Jordan Ellis and Grace Lee',
        words: churchWords,
      }),
    ).toBe(
      'Riverside Chapel via Discipler: Thanks for telling us about Jordan Ellis and Grace Lee. Talk next week.',
    )
  })

  it('names a group the way every text names one', () => {
    expect(
      meetingQuestion({
        ministryName: 'Riverside Chapel',
        subject: relationshipSubject({ name: 'Tuesday Men', otherSide: ['A B', 'C D'] }),
        discloseOptOut: false,
        words: churchWords,
      }),
    ).toContain('Did you get time with Tuesday Men this week?')
  })

  it('takes a name literally, whatever is in it', () => {
    expect(fillingInTheName('Saw [name]?', '$& [name] $1')).toBe('Saw $& [name] $1?')
    expect(fillingInTheName('[name] and [name]', 'Jo')).toBe('Jo and Jo')
  })
})

describe('Discipler’s words', () => {
  it('are today’s, and go out for a church with none saved', () => {
    expect(checkInWordsInForce(NO_SAVED_CHECK_IN_WORDS)).toEqual(DISCIPLERS_CHECK_IN_WORDS)
    expect(DISCIPLERS_CHECK_IN_WORDS).toEqual({
      question: 'Did you meet with [name] this week?',
      rating: 'How did the meeting go?',
      concern: 'Please tell us more about the concern.',
      // The curly apostrophe is what goes out today, and the ticket's straight one
      // would not have been byte for byte.
      thanks: 'Thank you. We’ll check in with you next week.',
    })
  })

  it('fill in only the lines a church left unsaved', () => {
    expect(
      checkInWordsInForce({ ...NO_SAVED_CHECK_IN_WORDS, rating: 'How was it?' }),
    ).toEqual({ ...DISCIPLERS_CHECK_IN_WORDS, rating: 'How was it?' })
  })
})

describe('reading the four lines off the form', () => {
  const submitted = { question: null, rating: null, concern: null, thanks: null }

  const saved = (lines: Partial<typeof submitted> | Record<string, string | null>) => {
    const reading = readCheckInWords({ ...submitted, ...lines })
    if ('refusals' in reading) throw new Error(`Refused: ${reading.refusals.join(', ')}`)
    return reading.words
  }

  const refused = (lines: Record<string, string | null>) => {
    const reading = readCheckInWords({ ...submitted, ...lines })
    return 'refusals' in reading ? reading.refusals : []
  }

  it('reads an absent, a blank and an all-spaces line as Discipler’s words', () => {
    expect(saved({})).toEqual(NO_SAVED_CHECK_IN_WORDS)
    expect(saved({ question: '', rating: '    ', concern: '\t\n', thanks: null })).toEqual(
      NO_SAVED_CHECK_IN_WORDS,
    )
  })

  it('saves nothing for a line left as Discipler wrote it', () => {
    expect(saved(DISCIPLERS_CHECK_IN_WORDS)).toEqual(NO_SAVED_CHECK_IN_WORDS)
  })

  it('takes a rewritten line, on one line', () => {
    expect(saved({ question: '  Did you see\n[name]   this week? ' }).question).toBe(
      'Did you see [name] this week?',
    )
  })

  it('reads a [Name] typed in another case as the blank it was meant as', () => {
    expect(saved({ question: 'Did you see [Name] or [ NAME ]?' }).question).toBe(
      'Did you see [name] or [name]?',
    )
  })

  it('counts a sentence up to the limit, and refuses one past it', () => {
    const atTheLimit = `[name] ${'x'.repeat(CHECK_IN_SENTENCE.longest - 7)}`
    expect(Array.from(atTheLimit)).toHaveLength(160)
    expect(saved({ question: atTheLimit }).question).toBe(atTheLimit)

    expect(refused({ question: `${atTheLimit}y` })).toEqual([
      'settings.check_in_sentence_too_long',
    ])
    expect(refused({ thanks: 'x'.repeat(161) })).toEqual(['settings.check_in_sentence_too_long'])
  })

  it('counts an emoji as one character, as the database does', () => {
    expect(saved({ thanks: '🙏'.repeat(160) }).thanks).toBe('🙏'.repeat(160))
  })

  it('says each kind of problem once, however many lines have it', () => {
    expect(refused({ rating: 'x'.repeat(161), concern: 'y'.repeat(161) })).toEqual([
      'settings.check_in_sentence_too_long',
    ])
  })

  it('refuses a question that names nobody, because a Leader of three could not tell which', () => {
    expect(refused({ question: 'Did you two meet this week?' })).toEqual([
      'settings.check_in_question_names_nobody',
    ])
    // The other three lines may name them or not.
    expect(saved({ rating: 'How did it go?', concern: 'Tell us more.', thanks: 'Thanks!' })).toEqual(
      { question: null, rating: 'How did it go?', concern: 'Tell us more.', thanks: 'Thanks!' },
    )
  })

  it('refuses any other blank, which would go out on a phone as typed', () => {
    for (const blank of ['[first name]', '{name}', '[mentee]', '{{name}}']) {
      expect(refused({ rating: `How was ${blank}?` })).toEqual([
        'settings.check_in_sentence_unknown_blank',
      ])
    }
  })

  describe('control and invisible characters', () => {
    it('are taken out rather than sent or refused, since nobody can see what to fix', () => {
      expect(checkInSentenceAsSent('How\u0000 was\u0007 it\u001B?')).toBe('How was it?')
      expect(checkInSentenceAsSent('How​ was­ it﻿?')).toBe('How was it?')
      expect(checkInSentenceAsSent('How\u0085was it?')).toBe('How was it?')
    })

    it('cannot turn a sentence round with a direction override', () => {
      expect(checkInSentenceAsSent('‮ti saw woH‬⁦⁩')).toBe('ti saw woH')
    })

    it('leave only a blank line where nothing else was typed', () => {
      expect(saved({ rating: '​\u0000 ﻿' }).rating).toBeNull()
    })

    it('leave an emoji’s own joiners alone', () => {
      const family = '👨‍👩‍👧'
      expect(checkInSentenceAsSent(`Thanks ${family}`)).toBe(`Thanks ${family}`)
    })
  })

  describe('a sentence that imitates the frame', () => {
    const imitations = [
      'Reply 1 if you met with [name]',
      'Did you meet with [name]? Reply yes or no.',
      'Did you meet [name]? reply with a 2',
      'Did you meet [name]? Text back 1',
      'How was it? 1 for great, 2 for bad',
      'How was it? A = great',
      'How was it? Reply A',
      'Reply STOP to keep getting these',
      'Reply stop for [name]',
      'Text HELP for [name]',
      'Do not send STOP',
      'STOP',
      'Text PAUSE to take a break',
      'Thanks. To opt out, tell your pastor.',
      'Thanks. To opt-out, tell your pastor.',
      'Thanks. Unsubscribe any time.',
      'Thanks. Msg & data rates may apply.',
      'Thanks. Message and data rates may apply.',
      'Thanks. Riverside via Discipler: see you next week.',
      'Thanks. Reply QUIT to leave.',
    ]

    for (const sentence of imitations) {
      it(`refuses "${sentence}"`, () => {
        const line = sentence.includes('[name]') ? 'question' : 'thanks'
        expect(checkInSentenceRefusals(line, sentence)).toContain(
          'settings.check_in_sentence_says_the_frame',
        )
      })
    }

    const natural = [
      'Did you stop by to see [name] this week?',
      'Did you meet 1 on 1 with [name]?',
      'Did your 1:1 with [name] happen?',
      'Did you get to help [name] this week?',
      'Please reply and tell us what happened.',
      'Please reply with more detail.',
      'Did you text [name] this week?',
      'Did you text [name] 2 times this week?',
      'Did you meet with [name] at the end of the week?',
      'Did [name] answer your text?',
      'Thank you. We’ll check in with you next week.',
      'Thanks for your reply. A pastor will follow up this week.',
      'Thank you for your answer. Stop by the office anytime.',
    ]

    for (const sentence of natural) {
      it(`takes "${sentence}"`, () => {
        const line = sentence.includes('[name]') ? 'question' : 'thanks'
        expect(checkInSentenceRefusals(line, sentence)).toEqual([])
      })
    }

    it('knows every keyword the reply router reads', () => {
      for (const keyword of KEYWORDS) {
        expect(checkInSentenceRefusals('thanks', `Text ${keyword} now`)).toContain(
          'settings.check_in_sentence_says_the_frame',
        )
      }
    })
  })

  describe('a link or a number', () => {
    for (const sentence of [
      'See https://example.org/page',
      'See http://example.org',
      'See www.example.org',
      'See bit.ly/abc',
      'See riversidechapel.church',
      'Call Pastor Tim at 205-555-0134',
      'Call +12055550134',
      'Call (205) 555-0134',
    ]) {
      it(`refuses "${sentence}"`, () => {
        expect(checkInSentenceRefusals('thanks', sentence)).toEqual([
          'settings.check_in_sentence_has_a_link',
        ])
      })
    }

    it('leaves a missing space after a full stop alone', () => {
      expect(checkInSentenceRefusals('thanks', 'Thank you.We’ll talk next week.')).toEqual([])
    })
  })
})

/**
 * Through the boundary, as the tick and a reply reach it. The words a conversation
 * opens with are the words it finishes with, because a change applies from the next
 * check-in sent.
 */
describe('a conversation keeps the words it opened with', () => {
  const ministry = ministryId('m1')
  const leader = personId('leader')
  const at = new Date('2026-11-09T09:00:00.000Z')

  const relationship = (id: string, name: string): CheckInRelationship => ({
    relationshipId: relationshipId(id),
    role: 'leader',
    name: null,
    participantNames: [name],
    paused: false,
    stillLed: true,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    cadence: { day: 1, hour: 9 },
  })

  const snapshot = (overrides: Partial<CheckInSnapshot> = {}): CheckInSnapshot => ({
    personId: leader,
    phone: '+12055550100',
    timeZone: 'UTC',
    leads: [relationship('r1', 'Jordan Ellis'), relationship('r2', 'Grace Lee')],
    openSequence: null,
    lastCheckInAt: null,
    ...overrides,
  })

  const bodies = (effects: readonly Effect[]): readonly string[] =>
    effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message.body] : []))

  const context = (overrides: Partial<CommandContext> = {}): CommandContext => ({
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    ministryName: 'Riverside Chapel',
    ...overrides,
  })

  const prompt = (overrides: Partial<OpenPrompt> = {}): OpenPrompt => ({
    promptId: checkInPromptId('p1'),
    relationshipId: relationshipId('r1'),
    position: 1,
    question: 'met',
    wording: 'a_to_d',
    askedAt: at,
    remindedAt: null,
    clarificationsSent: 0,
    ...overrides,
  })

  const open = (words: CheckInWords | null, awaiting: OpenPrompt = prompt()) =>
    snapshot({
      openSequence: {
        sequenceId: checkInSequenceId('s1'),
        startedAt: at,
        covering: [relationship('r1', 'Jordan Ellis'), relationship('r2', 'Grace Lee')],
        awaiting,
        words,
      },
    })

  const reply = (checkIn: CheckInSnapshot, body: string) =>
    handleCommand(
      { type: 'sms.inbound', ministryId: ministry, personId: leader, body },
      context({ checkIn, inbound: anInboundSnapshot({ personId: leader }) }),
    )

  it('sends a church with no words Discipler’s, as today', () => {
    const { effects } = handleCommand(
      { type: 'checkin.start', ministryId: ministry, personId: leader },
      context({ checkIn: snapshot() }),
    )

    expect(bodies(effects)[0]).toBe(
      'Riverside Chapel via Discipler: Did you meet with Jordan Ellis this week? Reply 1 for yes, 2 for no. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
  })

  it('opens in the church’s words, and records them on the conversation', () => {
    const { effects } = handleCommand(
      { type: 'checkin.start', ministryId: ministry, personId: leader },
      context({ checkIn: snapshot(), checkInWords: churchWords }),
    )

    expect(bodies(effects)[0]).toContain('Did you get time with Jordan Ellis this week? Reply 1')

    const opened = effects.find((effect) => effect.kind === 'checkin.open')
    expect(opened).toMatchObject({ sequence: { words: churchWords } })
  })

  it('asks the next question in the words it opened with, not the words in force', () => {
    const { effects } = reply(open(churchWords), '1')
    expect(bodies(effects)).toEqual([
      'Riverside Chapel via Discipler: How was your time with Jordan Ellis? Reply A for outstanding, B for good, C for okay, D for concern.',
    ])
  })

  it('asks after a concern in the words it opened with', () => {
    const { effects } = reply(
      open(churchWords, prompt({ question: 'satisfaction' })),
      'D',
    )
    expect(bodies(effects)).toEqual([
      'Riverside Chapel via Discipler: What should we know about Jordan Ellis?',
    ])
  })

  it('thanks them in the words it opened with, naming everyone the check-in was about', () => {
    const { effects } = reply(
      open(
        churchWords,
        prompt({ question: 'concern_detail', position: 2, relationshipId: relationshipId('r2') }),
      ),
      'Work has been rough.',
    )
    expect(bodies(effects)).toEqual([
      'Riverside Chapel via Discipler: Thanks for telling us about Jordan Ellis and Grace Lee. Talk next week.',
    ])
  })

  it('reminds in the words it opened with', () => {
    const { effects } = handleCommand(
      { type: 'scheduled.tick', ministryId: ministry },
      context({
        clock: createTestClock(new Date(at.getTime() + hours(24))),
        // The church has since changed its words, and the question out was not
        // sent in these.
        checkInWords: DISCIPLERS_CHECK_IN_WORDS,
        unaccepted: [],
        paused: [],
        appBaseUrl: 'https://discipler.test',
        checkInsDue: [
          {
            ...open(churchWords),
            // Already asked this week, so the cadence opens nothing new.
            lastCheckInAt: at,
          },
        ],
      }),
    )
    expect(bodies(effects)).toEqual([
      'Riverside Chapel via Discipler: Did you get time with Jordan Ellis this week? Reply 1 for yes, 2 for no.',
    ])
  })

  it('finishes in Discipler’s words if it opened before a church could reword', () => {
    const { effects } = reply(open(null), '1')
    expect(bodies(effects)).toEqual([
      'Riverside Chapel via Discipler: How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.',
    ])
  })

  it('still clarifies in the frame’s own words', () => {
    const { effects } = reply(open(churchWords), 'maybe later')
    expect(bodies(effects)).toEqual([
      'Riverside Chapel via Discipler: Sorry, we didn’t catch that. Reply 1 for yes, 2 for no.',
    ])
  })
})

/**
 * What any box reads as, and so what *Messages read as*, the one other thing an Admin
 * types that goes on every text, reads as too.
 */
describe('a typed box', () => {
  const settingsWith = (fromName: string) =>
    readMinistrySettings({
      name: 'Riverside Chapel',
      fromName,
      timezone: 'UTC',
      leaderNoun: 'mentor',
      participantNoun: 'mentee',
      suggestGenderMatch: true,
      suggestMaxAgeBandGap: '1',
      checkinDay: '1',
      checkinHour: '9',
      checkInWords: NO_SAVED_CHECK_IN_WORDS,
    })

  it('carries no control or invisible character into the name on every text', () => {
    expect(settingsWith('River\u0000side‮​ Chapel')).toMatchObject({
      settings: { fromName: 'Riverside Chapel' },
    })
  })

  it('reads a name of nothing but those as no name at all', () => {
    expect(settingsWith('\u0000​ ﻿')).toMatchObject({ settings: { fromName: null } })
  })
})
