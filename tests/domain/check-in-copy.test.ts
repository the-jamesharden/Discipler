import { describe, expect, it } from 'vitest'
import {
  checkInClarification,
  checkInThankYou,
  concernDetailRequest,
  meetingQuestion,
  satisfactionQuestion,
} from '~/domain/outbound-copy'

/**
 * The four messages of one relationship's turn. Every one of them speaks in the
 * Ministry's voice and carries its name, reminders and one-line acknowledgements
 * included -- a check-in question read out of context and unattributed is the
 * message a Leader is likeliest to ignore.
 */

const ministryName = 'ABC Church'

describe('the check-in conversation', () => {
  it('asks whether the meeting happened, naming who it was with', () => {
    expect(meetingQuestion({ ministryName, subject: 'Emily', discloseOptOut: false })).toBe(
      'ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no.',
    )
  })

  it('names everyone in a group rather than the relationship', () => {
    expect(
      meetingQuestion({
        ministryName,
        subject: 'Marcus, Dan and Ade',
        discloseOptOut: false,
      }),
    ).toBe(
      'ABC Church: Did you meet with Marcus, Dan and Ade this week? Reply 1 for yes, 2 for no.',
    )
  })

  it('offers the three satisfaction tokens by name', () => {
    expect(satisfactionQuestion({ ministryName })).toBe(
      'ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern.',
    )
  })

  it('asks for the Concern in prose', () => {
    expect(concernDetailRequest({ ministryName })).toBe(
      'ABC Church: Please tell us more about the concern.',
    )
  })

  it('closes the conversation so the Leader knows it is finished', () => {
    expect(checkInThankYou({ ministryName })).toBe(
      'ABC Church: Thank you. We’ll check in with you next week.',
    )
  })

  /**
   * The clarification says the valid replies again and does not re-ask the
   * question. The Leader has the question -- they replied to it moments ago -- and
   * re-asking would read as though Discipler had lost the thread rather than one
   * message.
   */
  it('offers the open question’s replies again, and only that question’s', () => {
    expect(checkInClarification({ ministryName, question: 'met' })).toBe(
      'ABC Church: Sorry, we didn’t catch that. Reply 1 for yes, 2 for no.',
    )
    expect(checkInClarification({ ministryName, question: 'satisfaction' })).toBe(
      'ABC Church: Sorry, we didn’t catch that. ' +
        'Reply A for outstanding, B for good, C for concern.',
    )
    expect(checkInClarification({ ministryName, question: 'concern_detail' })).toBe(
      'ABC Church: Sorry, we didn’t catch that. Please tell us more about the concern.',
    )
  })

  it('never re-discloses the opt-out, whichever question was misread', () => {
    // The monthly language rode on the message that opened the conversation. A
    // clarification is not a new month and not a new conversation.
    for (const question of ['met', 'satisfaction', 'concern_detail'] as const) {
      expect(checkInClarification({ ministryName, question })).not.toContain('STOP')
    }
  })

  /**
   * The monthly rule. It rides on the opening question because that is the first
   * check-in message of the month, and it identifies no delivery brand: a Leader
   * eleven months into a pilot is not being contacted for the first time.
   */
  it('carries the opt-out and rate disclosure on the month’s first check-in', () => {
    expect(meetingQuestion({ ministryName, subject: 'Emily', discloseOptOut: true })).toBe(
      'ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
  })
})
