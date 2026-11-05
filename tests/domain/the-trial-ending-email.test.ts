import { describe, expect, it } from 'vitest'
import type { BillingPicture } from '~/domain/billing-picture'
import { asEmailAddress, openEnvelope } from '~/domain/email'
import { trialEndingEmail, trialEndingEmailIsDue, whatTheDayCharges } from '~/domain/trial-ending'

const ZONE = 'America/New_York'
const TRIAL_ENDS = new Date('2026-12-30T15:00:00Z')

const aPicture = (changes: Partial<BillingPicture> = {}): BillingPicture => ({
  subscriptionId: 'sub_1',
  onASchedule: true,
  status: 'trialing',
  cycle: 'month',
  priceCents: 9_700,
  aboveTheLimit: false,
  trial: { days: 60, endsAt: TRIAL_ENDS },
  nextPayment: { cents: 7_760, fullCents: 7_760, at: TRIAL_ENDS },
  cancelsAt: null,
  endedAt: null,
  offers: [{ kind: 'exponential', endsAt: new Date('2027-12-30T15:00:00Z') }],
  creditCents: 0,
  creditLeftCents: 0,
  method: { kind: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 },
  failed: null,
  ...changes,
})

describe('when it is due', () => {
  const at = (iso: string) => trialEndingEmailIsDue({ trialEndsAt: TRIAL_ENDS, timeZone: ZONE, now: new Date(iso) })

  it('is not due before 9am on the day a week before', () => {
    expect(at('2026-12-22T23:00:00Z')).toBe(false)
    expect(at('2026-12-23T13:59:00Z')).toBe(false)
  })

  it('is due from 9am that day, on the church’s clock', () => {
    expect(at('2026-12-23T14:00:00Z')).toBe(true)
  })

  it('stays due for as long as the trial lasts, so ticks that were down cost nobody the warning', () => {
    expect(at('2026-12-26T02:00:00Z')).toBe(true)
    expect(at('2026-12-30T14:59:00Z')).toBe(true)
  })

  it('is over when the trial is', () => {
    expect(at('2026-12-30T15:00:00Z')).toBe(false)
  })
})

describe('what the day charges', () => {
  it('says James’s sentence for a monthly Exponential church', () => {
    expect(whatTheDayCharges(aPicture())).toBe(
      'That day your Visa ending 4242 is charged $77.60 for your first month: $97 a month, 20% off your first year with your Exponential special offer.',
    )
  })

  it('says a year for a yearly Exponential church', () => {
    expect(
      whatTheDayCharges(
        aPicture({ cycle: 'year', priceCents: 93_120, nextPayment: { cents: 74_496, fullCents: 74_496, at: TRIAL_ENDS } }),
      ),
    ).toBe(
      'That day your Visa ending 4242 is charged $744.96 for your first year: $931.20 a year, 20% off your first year with your Exponential special offer.',
    )
  })

  it('names the bank for a bank payer', () => {
    expect(
      whatTheDayCharges(
        aPicture({ offers: [], nextPayment: { cents: 9_700, fullCents: 9_700, at: TRIAL_ENDS }, method: { kind: 'bank', bankName: 'Chase', accountType: 'checking', last4: '6789' } }),
      ),
    ).toBe('That day your Chase checking ending 6789 is charged $97.00 for your first month.')
  })

  it('needs no card details from Link, which gives none', () => {
    const sentence = whatTheDayCharges(
      aPicture({ offers: [], nextPayment: { cents: 9_700, fullCents: 9_700, at: TRIAL_ENDS }, method: { kind: 'link' } }),
    )
    expect(sentence).toBe('That day your Link account is charged $97.00 for your first month.')
  })

  it('does not claim a charge for a first month that is free', () => {
    expect(
      whatTheDayCharges(
        aPicture({
          offers: [{ kind: 'first_free_month', endsAt: new Date('2027-01-30T15:00:00Z') }],
          nextPayment: { cents: 0, fullCents: 0, at: TRIAL_ENDS },
        }),
      ),
    ).toBe('Your first paid month is free, so nothing is charged that day.')
  })

  it('says so where credit covers the bill', () => {
    expect(
      whatTheDayCharges(aPicture({ offers: [], nextPayment: { cents: 0, fullCents: 9_700, at: TRIAL_ENDS } })),
    ).toBe('Your credit covers your first bill, so nothing is charged that day.')
  })
})

describe('the email', () => {
  const email = trialEndingEmail({
    church: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    churchName: 'Riverside Chapel',
    firstName: 'Grace',
    to: asEmailAddress('grace@riverside.example')!,
    trialEndsAt: TRIAL_ENDS,
    timeZone: ZONE,
    picture: aPicture(),
    billing: new URL('https://app.trydiscipler.com/settings/billing'),
    logo: new URL('https://app.trydiscipler.com/discipler-logo.png'),
  })

  const envelope = openEnvelope(email)

  it('is James’s words, as the mock-up draws them', () => {
    expect(envelope.subject).toBe('Your free trial ends December 30')
    const body = envelope.text
    for (const line of [
      'Your free trial ends in a week',
      'Grace, thank you for trying Discipler with Riverside Chapel. Your free trial ends on December 30, 2026.',
      'That day your Visa ending 4242 is charged $77.60 for your first month: $97 a month, 20% off your first year with your Exponential special offer.',
      "If you'd like to keep going, there's nothing to do. To change your card or cancel, open Billing in Settings.",
      'If you have any questions, just reply to this email.',
      'James Harden',
      'Founder and CEO, Discipler',
      "You're receiving this because you are an Admin of Riverside Chapel on Discipler.",
    ]) {
      expect(body).toContain(line)
    }
  })

  it('opens Billing from its button', () => {
    expect(envelope.html).toContain('href="https://app.trydiscipler.com/settings/billing"')
    expect(envelope.html).toContain('>Open Billing</a>')
  })

  it('is once per Subscription and Admin, with no address in it', () => {
    expect(envelope.idempotencyKey).toBe(
      'trialEnding/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222',
    )
  })
})
