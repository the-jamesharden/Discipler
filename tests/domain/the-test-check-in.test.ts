import { describe, expect, it } from 'vitest'
import { CLARIFICATIONS_PER_QUESTION } from '~/domain/check-in'
import { DISCIPLERS_CHECK_IN_WORDS } from '~/domain/check-in-words'
import { personId, type PersonId } from '~/domain/ids'
import { TEST_CHECK_IN_OPEN_HOURS, TEST_CHECK_INS_PER_DAY } from '~/domain/launch-terms'
import { testCheckInQuestion, testCheckInThanks } from '~/domain/outbound-copy'
import {
  needsTheAgreement,
  testCheckInId,
  testCheckInIsLive,
  testCheckInRefusal,
  testCheckInsLapsedBy,
  testCheckInsSentToday,
  testCheckInsLeftToday,
  testCheckInTurn,
  type OpenTestCheckIn,
  type TestCheckInStanding,
} from '~/domain/test-check-in'

/**
 * The test check-in's own rules against an injected clock (Exponential launch, ticket 28).
 * The router, the tables, the queue and the counts are in
 * `tests/integration/the-test-check-in.test.ts`.
 */

const NOW = new Date('2026-11-04T15:00:00Z')
const HOUR = 60 * 60 * 1000

const aStanding = (over: Partial<TestCheckInStanding> = {}): TestCheckInStanding => ({
  personId: personId('00000000-0000-4000-8000-000000000001') as PersonId,
  phone: '+13185550142',
  optedOut: false,
  smsDecision: true,
  agreed: true,
  sentAt: [],
  realQuestionOpen: false,
  hasAccess: true,
  timeZone: 'America/Chicago',
  ...over,
})

const aTest = (over: Partial<OpenTestCheckIn> = {}): OpenTestCheckIn => ({
  id: testCheckInId('00000000-0000-4000-8000-000000000002'),
  question: 'met',
  askedAt: NOW,
  clarificationsSent: 0,
  subject: 'your mentee',
  words: DISCIPLERS_CHECK_IN_WORDS,
  ...over,
})

describe('who may send one', () => {
  it('lets an Admin with a phone, who said yes, send one', () => {
    expect(testCheckInRefusal(aStanding(), NOW)).toBeNull()
  })

  it('refuses an Admin with nowhere to send it', () => {
    expect(testCheckInRefusal(aStanding({ personId: null, phone: null }), NOW)).toBe('test_check_in.no_phone')
  })

  it('refuses a phone that said STOP, which only START undoes', () => {
    expect(testCheckInRefusal(aStanding({ optedOut: true }), NOW)).toBe('test_check_in.opted_out')
  })

  it('refuses where their latest decision about texts is no', () => {
    expect(testCheckInRefusal(aStanding({ smsDecision: false }), NOW)).toBe('test_check_in.declined')
  })

  it('refuses with a real question open on the phone', () => {
    expect(testCheckInRefusal(aStanding({ realQuestionOpen: true }), NOW)).toBe(
      'test_check_in.real_question_open',
    )
  })

  it('refuses a church with no access to texting', () => {
    expect(testCheckInRefusal(aStanding({ hasAccess: false }), NOW)).toBe('test_check_in.church_has_no_access')
  })

  it('shows the agreement until they have given it, and nothing about it after', () => {
    expect(needsTheAgreement(aStanding({ agreed: false }))).toBe(true)
    expect(needsTheAgreement(aStanding({ agreed: true }))).toBe(false)
  })
})

describe('the limit on a day', () => {
  const sent = (...at: readonly string[]) => at.map((when) => new Date(when))

  it(`refuses the fourth in a day, ${TEST_CHECK_INS_PER_DAY} being the limit`, () => {
    const threeToday = sent('2026-11-04T14:00:00Z', '2026-11-04T14:30:00Z', '2026-11-04T14:40:00Z')
    expect(testCheckInRefusal(aStanding({ sentAt: threeToday }), NOW)).toBe('test_check_in.limit_reached')
    expect(testCheckInRefusal(aStanding({ sentAt: threeToday.slice(1) }), NOW)).toBeNull()
  })

  it('says the limit before an open question, since answering it would not help', () => {
    const threeToday = sent('2026-11-04T14:00:00Z', '2026-11-04T14:30:00Z', '2026-11-04T14:40:00Z')
    expect(testCheckInRefusal(aStanding({ sentAt: threeToday, realQuestionOpen: true }), NOW)).toBe(
      'test_check_in.limit_reached',
    )
  })

  it("counts the day in the church's timezone, not the server's", () => {
    // 11:30pm on the 3rd in Chicago, and already the 4th in UTC.
    const lastNight = sent('2026-11-04T05:30:00Z')
    expect(testCheckInsSentToday(lastNight, NOW, 'America/Chicago')).toBe(0)
    expect(testCheckInsSentToday(lastNight, NOW, 'UTC')).toBe(1)
  })

  it('says how many are left, and never fewer than none', () => {
    expect(testCheckInsLeftToday(1)).toBe(TEST_CHECK_INS_PER_DAY - 1)
    expect(testCheckInsLeftToday(TEST_CHECK_INS_PER_DAY + 1)).toBe(0)
  })
})

describe('the hour', () => {
  const hour = TEST_CHECK_IN_OPEN_HOURS * HOUR

  it('runs from the question last asked', () => {
    expect(testCheckInIsLive({ askedAt: new Date(NOW.getTime() - hour + 1) }, NOW)).toBe(true)
  })

  it('is over the moment it is up', () => {
    expect(testCheckInIsLive({ askedAt: new Date(NOW.getTime() - hour) }, NOW)).toBe(false)
    expect(testCheckInsLapsedBy(NOW)).toEqual(new Date(NOW.getTime() - hour))
  })
})

describe('what a reply does', () => {
  it('goes on to how it went after a yes', () => {
    expect(testCheckInTurn(aTest(), '1')).toEqual({ kind: 'ask', question: 'satisfaction', met: true, satisfaction: null })
  })

  it('finishes after a no', () => {
    expect(testCheckInTurn(aTest(), '2')).toEqual({ kind: 'finish', met: false, satisfaction: null })
  })

  it('finishes after a rating', () => {
    expect(testCheckInTurn(aTest({ question: 'satisfaction' }), 'B')).toEqual({
      kind: 'finish',
      met: null,
      satisfaction: 'good',
    })
  })

  it('asks for more after a concern', () => {
    expect(testCheckInTurn(aTest({ question: 'satisfaction' }), 'D')).toEqual({
      kind: 'ask',
      question: 'concern_detail',
      met: null,
      satisfaction: 'concern',
    })
  })

  it('finishes on the words after a concern, and keeps none of them', () => {
    expect(testCheckInTurn(aTest({ question: 'concern_detail' }), 'He is struggling')).toEqual({
      kind: 'finish',
      met: null,
      satisfaction: null,
    })
  })

  it('asks again as a real conversation does, then lets it lie', () => {
    expect(testCheckInTurn(aTest(), 'maybe')).toEqual({ kind: 'unreadable', clarify: true })
    expect(testCheckInTurn(aTest({ clarificationsSent: CLARIFICATIONS_PER_QUESTION }), 'maybe')).toEqual({
      kind: 'unreadable',
      clarify: false,
    })
  })
})

describe('what it says', () => {
  it("is James's sentence where the church has saved no words", () => {
    expect(
      testCheckInQuestion({
        ministryName: 'Riverside Chapel',
        leaderNoun: 'mentor',
        subject: 'your mentee',
        words: DISCIPLERS_CHECK_IN_WORDS,
        discloseOptOut: false,
      }),
    ).toBe(
      'Riverside Chapel via Discipler: This is your test check-in, the same one your mentors get. Did you meet with your mentee this week? Reply 1 for yes, 2 for no.',
    )
  })

  it("asks in the church's own sentence, inside the frame", () => {
    expect(
      testCheckInQuestion({
        ministryName: 'Riverside Chapel',
        leaderNoun: 'mentor',
        subject: 'your mentee',
        words: { ...DISCIPLERS_CHECK_IN_WORDS, question: 'Did you get together with [name] lately?' },
        discloseOptOut: false,
      }),
    ).toBe(
      'Riverside Chapel via Discipler: This is your test check-in, the same one your mentors get. Did you get together with your mentee lately? Reply 1 for yes, 2 for no.',
    )
  })

  it("thanks them in James's words", () => {
    expect(testCheckInThanks({ ministryName: 'Riverside Chapel' })).toBe(
      'Riverside Chapel via Discipler: Thank you! Glad you are getting to experience what Discipler can do for your ministry!!',
    )
  })
})
