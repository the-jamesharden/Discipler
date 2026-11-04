import { describe, expect, it } from 'vitest'
import { EXPONENTIAL_OFFER } from '~/domain/launch-terms'
import { openEnvelope } from '~/domain/email'
import {
  firstNameOf,
  paymentReminderEmail,
  paymentReminderIsDue,
  paymentReminderSaysTheOffer,
  PAYMENT_REMINDER_HOUR,
} from '~/domain/payment-reminder'

/**
 * The one reminder (Exponential launch, ticket 18): when it goes, and its words, which
 * are James's and the approved mock-up's (`s8-reminder-email.html`).
 */

const CHICAGO = 'America/Chicago'
// 8:15pm on Tuesday the 10th in Chicago, which is already the 11th in UTC.
const OPENED = new Date('2026-11-11T02:15:00Z')

describe('when it goes', () => {
  it('goes at or after 9am on the day after the church opened, on the church\'s clock', () => {
    expect(PAYMENT_REMINDER_HOUR).toBe(9)
    const due = (at: string) => paymentReminderIsDue({ openedAt: OPENED, timeZone: CHICAGO, now: new Date(at) })

    expect(due('2026-11-11T14:59:59Z')).toBe(false) // 8:59am on the 11th
    expect(due('2026-11-11T15:00:00Z')).toBe(true) // 9:00am on the 11th
    expect(due('2026-11-12T05:59:00Z')).toBe(true) // 11:59pm on the 11th
  })

  it('does not go on the day it opened, however late', () => {
    const lateThatDay = new Date('2026-11-11T05:30:00Z') // 11:30pm on the 10th
    expect(paymentReminderIsDue({ openedAt: OPENED, timeZone: CHICAGO, now: lateThatDay })).toBe(false)
  })

  it('does not go on a later day, if every tick that day was missed', () => {
    const dayAfterThat = new Date('2026-11-12T15:00:00Z') // 9am on the 12th
    expect(paymentReminderIsDue({ openedAt: OPENED, timeZone: CHICAGO, now: dayAfterThat })).toBe(false)
  })

  it('reads the day in the church\'s zone, not the server\'s', () => {
    // The same moment is the next morning in Tokyo and the same day in Honolulu.
    const opened = new Date('2026-11-10T12:00:00Z')
    const at = new Date('2026-11-11T01:00:00Z')
    expect(paymentReminderIsDue({ openedAt: opened, timeZone: 'Asia/Tokyo', now: at })).toBe(true)
    expect(paymentReminderIsDue({ openedAt: opened, timeZone: 'Pacific/Honolulu', now: at })).toBe(false)
  })

  it('keeps the next day across a daylight saving change', () => {
    const openedBeforeTheChange = new Date('2026-11-01T01:00:00Z') // 8pm on Oct 31 in Chicago
    // The clocks went back at 2am, so this is 8am and not yet 9.
    const stillEight = new Date('2026-11-01T14:00:00Z')
    expect(paymentReminderIsDue({ openedAt: openedBeforeTheChange, timeZone: CHICAGO, now: stillEight })).toBe(false)
    expect(
      paymentReminderIsDue({
        openedAt: openedBeforeTheChange,
        timeZone: CHICAGO,
        now: new Date('2026-11-01T15:00:00Z'),
      }),
    ).toBe(true)
  })
})

describe('the first name', () => {
  it('is the first word of the full name', () => {
    expect(firstNameOf('Dan Whitfield')).toBe('Dan')
    expect(firstNameOf('  Mary  Ann   Lee ')).toBe('Mary')
  })
})

describe('the offer line', () => {
  it('shows while a saved code is still valid on the day it is sent, and through its last day', () => {
    const says = (code: string | null, at: string) => paymentReminderSaysTheOffer(code, new Date(at))

    expect(EXPONENTIAL_OFFER.lastDay).toBe('2026-12-11')
    expect(says('EXPO26', '2026-11-11T15:00:00Z')).toBe(true)
    expect(says('expo26', '2026-11-11T15:00:00Z')).toBe(true)
    expect(says('EXPO26', '2026-12-12T07:59:00Z')).toBe(true) // 11:59pm Pacific on the 11th
    expect(says('EXPO26', '2026-12-12T08:01:00Z')).toBe(false)
    expect(says('SOMETHING', '2026-11-11T15:00:00Z')).toBe(false)
    expect(says(null, '2026-11-11T15:00:00Z')).toBe(false)
  })
})

describe('the email', () => {
  const email = (offerSaved: boolean) =>
    openEnvelope(
      paymentReminderEmail({
        church: 'd5a7c0a2-0000-4000-8000-000000000001',
        churchName: 'Grace Church',
        firstName: 'Dan',
        to: 'pastor.dan@gracechurch.org' as never,
        start: new URL('https://app.trydiscipler.com/'),
        stop: new URL('https://app.trydiscipler.com/signup/reminders-off?t=abc.def'),
        logo: new URL('https://app.trydiscipler.com/discipler-logo.png'),
        offerSaved,
      }),
    )

  it('has the subject, and goes to the Admin once with replies to support@', () => {
    const envelope = email(false)
    expect(envelope.subject).toBe('Finish setting up Grace Church on Discipler')
    expect(envelope.to).toEqual(['pastor.dan@gracechurch.org'])
    expect(envelope.replyTo).toBe('support@trydiscipler.com')
    expect(envelope.idempotencyKey).toBe('paymentReminder/d5a7c0a2-0000-4000-8000-000000000001')
  })

  const JAMES_WORDS = [
    "You're one step away",
    'Dan, we are so excited that you are considering Discipler for your church. We want to help you help your people by making mentorship something that is easy to manage.',
    "All that's left is clicking start and initiating your free trial!",
    'If anything got in the way, please let us know and we are happy to help.',
    'Thank you,',
    'James Harden',
    'Founder and CEO, Discipler',
    "You're receiving this because you started an account for Grace Church at app.trydiscipler.com. This is the only reminder we'll send.",
    "Don't send me reminders",
    'Start',
  ]

  /** What a reader sees of the HTML part. */
  const shownIn = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&')
      .replace(/\s+/g, ' ')

  it.each(JAMES_WORDS)('says, word for word, in both parts: %s', (words) => {
    const envelope = email(false)
    expect(envelope.text).toContain(words)
    expect(shownIn(envelope.html!)).toContain(words)
  })

  it('links Start to where sign-in begins, and the foot to the signed page, with no session in either', () => {
    const envelope = email(false)
    expect(envelope.html).toContain('href="https://app.trydiscipler.com/"')
    expect(envelope.html).toContain('href="https://app.trydiscipler.com/signup/reminders-off?t=abc.def"')
    expect(envelope.text).toContain('https://app.trydiscipler.com/signup/reminders-off?t=abc.def')
    expect(envelope.text).toContain('Start: https://app.trydiscipler.com/\n')
  })

  it('says the offer only with one saved', () => {
    const line = 'Your Exponential special offer is saved until December 11.'
    expect(email(true).text).toContain(line)
    expect(shownIn(email(true).html!)).toContain(line)
    expect(email(false).text).not.toContain('special offer')
    expect(email(false).html).not.toContain('special offer')
  })

  it('names no price', () => {
    for (const part of [email(true).text, email(true).html!]) expect(part).not.toContain('$')
  })

  it('lays its HTML out at the width of a phone rather than shrinking a desktop page onto it', () => {
    expect(email(false).html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
  })
})
