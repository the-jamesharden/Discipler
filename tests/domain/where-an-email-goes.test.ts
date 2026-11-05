import { describe, expect, it } from 'vitest'
import {
  asEmailAddress,
  EMAIL_KINDS,
  emailBody,
  EmailField,
  EmailRefused,
  emailSubject,
  openEnvelope,
  UnescapedEmailField,
  type Email,
  type EmailAddress,
} from '~/domain/email'

/**
 * Where each kind of email goes is decided by its kind and nowhere else
 * (Exponential launch, ticket 10): the alerts and the forms to support@, a
 * church-plant application to James and Lerone, and what a church's Admin is sent
 * to the address that Admin gave. A caller names an address only for the last.
 */

const subject = emailSubject`Something needs your attention`
const body = emailBody`Open Discipler to see it.`
const admin = asEmailAddress('pastor@riverside.example')!

const toSupport = {
  kind: 'over200FollowUp',
  subject,
  body,
  once: '00000000-0000-4000-8000-0000000000aa/2026-11',
} satisfies Email

describe('the routing', () => {
  it.each([
    ['newSignUp'],
    ['supportRequest'],
    ['bugReport'],
    ['featureRequest'],
    ['numbersNearCapacity'],
    ['dailyCapReached'],
    ['twilioBalanceLow'],
    ['twilioSpendPassed'],
    ['over200FollowUp'],
    ['deliverabilityCheck'],
    ['askDisciplerSpendStopped'],
  ] as const)('sends %s to support@', (kind) => {
    expect(openEnvelope({ kind, subject, body, once: 'x' }).to).toEqual([
      'support@trydiscipler.com',
    ])
  })

  it('sends a church-plant application to James and Lerone', () => {
    expect(
      openEnvelope({ kind: 'churchPlantApplication', subject, body, once: 'x' }).to,
    ).toEqual(['james@trydiscipler.com', 'lerone@trydiscipler.com'])
  })

  it.each([
    ['emailCode'],
    ['signUpAttemptNotice'],
    ['passwordReset'],
    ['paymentReminder'],
    ['trialEnding'],
    ['churchPlantDecision'],
  ] as const)('sends %s to the Admin it is addressed to', (kind) => {
    expect(openEnvelope({ kind, to: admin, subject, body, once: 'x' }).to).toEqual([
      'pastor@riverside.example',
    ])
  })

  it('has a route for every kind, and nothing else', () => {
    // A kind with no route here would be a kind nobody decided the inbox of.
    expect(Object.keys(EMAIL_KINDS).sort()).toEqual(
      [
        'askDisciplerSpendStopped',
        'billingEventRefused',
        'bugReport',
        'churchPlantApplication',
        'churchPlantDecision',
        'dailyCapReached',
        'deliverabilityCheck',
        'emailCode',
        'featureRequest',
        'newChurchLimitHit',
        'newSignUp',
        'numbersNearCapacity',
        'over200FollowUp',
        'paymentReminder',
        'passwordReset',
        'referralCreditReview',
        'signUpAttemptNotice',
        'supportRequest',
        'textingGateUnread',
        'trialEnding',
        'twilioBalanceLow',
        'twilioSpendPassed',
      ].sort(),
    )
  })

  it('sends every reply to support@', () => {
    expect(openEnvelope(toSupport).replyTo).toBe('support@trydiscipler.com')
  })

  it('will not let a caller send an alert somewhere else', () => {
    const redirected = { ...toSupport, to: admin } as unknown as Email

    // @ts-expect-error -- an alert's inbox is its kind's, not the caller's.
    const typed: Email = { ...toSupport, to: admin }
    void typed

    expect(() => openEnvelope(redirected)).toThrow(EmailRefused)
  })

  it('will not send an Admin’s email without an address', () => {
    // @ts-expect-error -- the Admin's address is required.
    const typed: Email = { kind: 'trialEnding', subject, body, once: 'x' }

    expect(() => openEnvelope(typed)).toThrow(EmailRefused)
  })

  it('will not send to an address nobody checked', () => {
    const unchecked = 'pastor@riverside.example\r\nBcc: everyone@example.com' as EmailAddress

    expect(() =>
      openEnvelope({ kind: 'trialEnding', to: unchecked, subject, body, once: 'x' }),
    ).toThrow(EmailRefused)
  })

  it('refuses a kind it does not know', () => {
    const unknown = { ...toSupport, kind: 'newsletter' } as unknown as Email

    expect(() => openEnvelope(unknown)).toThrow(EmailRefused)
  })
})

describe('an address', () => {
  it.each([
    ['pastor@riverside.example'],
    ['first.last+tag@sub.church.org'],
  ])('is taken when it is one ordinary address: %s', (raw) => {
    expect(asEmailAddress(raw)).toBe(raw)
  })

  it('is trimmed, and its domain is lower-cased', () => {
    expect(asEmailAddress('  Pastor@Riverside.Example ')).toBe('Pastor@riverside.example')
  })

  it.each([
    [''],
    ['pastor'],
    ['pastor@'],
    ['@riverside.example'],
    ['pastor@riverside'],
    ['a@b.example, c@d.example'],
    ['Pastor <pastor@riverside.example>'],
    ['pastor@riverside.example\nBcc: x@y.example'],
    [`${'a'.repeat(250)}@riverside.example`],
  ])('is refused when it is not: %j', (raw) => {
    expect(asEmailAddress(raw)).toBeNull()
  })
})

describe('the envelope', () => {
  it('carries the subject and body as composed', () => {
    const church = EmailField.line('Riverside Chapel')
    const envelope = openEnvelope({
      ...toSupport,
      subject: emailSubject`Follow up with ${church}`,
      body: emailBody`${church} stayed above 200 all month.`,
    })

    expect(envelope.subject).toBe('Follow up with Riverside Chapel')
    expect(envelope.text).toBe('Riverside Chapel stayed above 200 all month.')
  })

  it('refuses a subject or body the tags did not make', () => {
    const rawSubject = { ...toSupport, subject: 'Hello' as unknown as Email['subject'] }
    const rawBody = { ...toSupport, body: 'Hello' as unknown as Email['body'] }

    expect(() => openEnvelope(rawSubject)).toThrow(UnescapedEmailField)
    expect(() => openEnvelope(rawBody)).toThrow(UnescapedEmailField)
  })

  it('keys each message by its kind and what makes it the one it is', () => {
    expect(openEnvelope(toSupport).idempotencyKey).toBe(
      'over200FollowUp/00000000-0000-4000-8000-0000000000aa/2026-11',
    )
  })

  it.each([
    ['an email address', 'pastor@riverside.example'],
    ['a phone number', '+15551230000'],
    ['a phone number without its plus', '15551230000'],
    ['spaces', 'Riverside Chapel'],
    ['nothing', ''],
    ['too much for Resend', 'x'.repeat(250)],
  ])('refuses a key made of %s', (_label, once) => {
    // Resend keeps its keys, and a key is no place for anybody's details.
    expect(() => openEnvelope({ ...toSupport, once })).toThrow(EmailRefused)
  })
})
