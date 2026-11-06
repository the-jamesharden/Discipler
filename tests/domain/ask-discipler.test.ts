import { describe, expect, it } from 'vitest'
import {
  LONGEST_QUESTION,
  chatsKeptSince,
  questionsLeftAfter,
  readQuestion,
  spendMonthOf,
  splitAnswerSource,
} from '~/domain/ask-discipler'
import { AI_GUIDE_CHAT_KEPT_DAYS, AI_GUIDE_QUESTIONS_PER_DAY } from '~/domain/launch-terms'

describe('what can be asked', () => {
  it('trims it', () => {
    expect(readQuestion('  How do check-ins work?\n')).toBe('How do check-ins work?')
  })

  it.each(['', '   \n ', 'x'.repeat(LONGEST_QUESTION + 1)])('refuses nothing and too much', (typed) => {
    expect(readQuestion(typed)).toBeNull()
  })

  it('takes the longest the box allows', () => {
    expect(readQuestion('x'.repeat(LONGEST_QUESTION))).toHaveLength(LONGEST_QUESTION)
  })
})

describe('the day and the months', () => {
  it('counts down from the limit and stops at none', () => {
    expect(questionsLeftAfter(0)).toBe(AI_GUIDE_QUESTIONS_PER_DAY)
    expect(questionsLeftAfter(AI_GUIDE_QUESTIONS_PER_DAY)).toBe(0)
    expect(questionsLeftAfter(AI_GUIDE_QUESTIONS_PER_DAY + 4)).toBe(0)
  })

  it('keeps a chat for the days the policy says', () => {
    const now = new Date('2026-11-04T12:00:00Z')
    expect(now.getTime() - chatsKeptSince(now).getTime()).toBe(AI_GUIDE_CHAT_KEPT_DAYS * 24 * 60 * 60 * 1000)
  })

  it('names a month in UTC, when the budgets reset', () => {
    expect(spendMonthOf(new Date('2026-11-30T23:59:00-05:00'))).toBe('2026-12')
  })
})

describe('the page an answer came from', () => {
  it('takes the last line off', () => {
    expect(splitAnswerSource('Open Settings.\n\nSource: /help/settings')).toEqual({
      words: 'Open Settings.',
      source: '/help/settings',
    })
  })

  it.each([
    'Open Settings.\n\n**Source:** /help/settings',
    'Open Settings.\nSource: `/help/settings`\n',
    'Open Settings.\nSOURCE: /help/settings.',
    'Open Settings.\nSource: /help/settings#the-check-in',
  ])('reads it however the model dressed it: %j', (answer) => {
    expect(splitAnswerSource(answer)).toEqual({ words: 'Open Settings.', source: '/help/settings' })
  })

  it('finds none where there is none', () => {
    expect(splitAnswerSource('Open Settings.')).toEqual({ words: 'Open Settings.', source: null })
  })

  it('leaves a line that only mentions a source in the middle', () => {
    const answer = 'Source: /help/settings is a page.\nOpen it.'
    expect(splitAnswerSource(answer)).toEqual({ words: answer, source: null })
  })

  it('does not take an address outside the help pages', () => {
    const answer = 'Open it.\nSource: https://example.org/help/settings'
    expect(splitAnswerSource(answer)).toEqual({ words: answer, source: null })
  })
})
