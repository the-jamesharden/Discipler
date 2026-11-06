import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ministryId } from '~/domain/ids'
import { churchOfRemindersOffToken, remindersOffToken } from '~/platform/reminder-link'
import { PAYMENT_PAGE, paymentRefusalMessage, REMINDERS_OFF_PAGE, trialLine } from '../../app/signup/payment/copy'
import {
  AFTER_THE_PAYMENT_STEP,
  ASKING_FOR_ACCESS_EVERY_MS,
  cameBackFailed,
  someWalletIsAvailable,
  stepAfterOpening,
  trialEndsOn,
  WAITING_BEFORE_OFFERING_THE_LINK_MS,
  type OpenedTrial,
} from '../../app/signup/payment/flow'
import { PaymentForm } from '../../app/signup/payment/form'

/**
 * What the payment step decides without a browser (Exponential launch, ticket 18): the
 * step each answer of the route leads to, the words as James wrote them, and what the
 * form is before anything has answered. The route's answers themselves are
 * `tests/integration/the-payment-step.test.ts`.
 */

const OPENED: OpenedTrial = {
  clientSecret: 'seti_secret',
  publishableKey: 'pk_test_not_a_real_key',
  trialEndsAt: '2026-11-24T18:00:00.000Z',
  codeRefusal: null,
}

const refusedWith = (refusal: Parameters<typeof paymentRefusalMessage>[0]) =>
  stepAfterOpening({ ok: false, refusal, message: paymentRefusalMessage(refusal) })

afterEach(() => vi.unstubAllEnvs())

describe('the step an answer leads to', () => {
  it('is the form when the route gives a secret', () => {
    expect(stepAfterOpening({ ok: true, body: OPENED })).toEqual({ kind: 'form', ...OPENED })
  })

  it('waits when the route says the church already pays, because the webhook may be on its way', () => {
    expect(refusedWith('payment.already_paying')).toEqual({ kind: 'waiting' })
  })

  it.each(['payment.outside_stripe', 'payment.restart'] as const)('says the sentence for %s, with nothing to press', (refusal) => {
    expect(refusedWith(refusal)).toEqual({
      kind: 'refused',
      message: paymentRefusalMessage(refusal),
      canTryAgain: false,
    })
  })

  it('offers trying again when something failed along the way', () => {
    expect(refusedWith('payment.not_opened')).toMatchObject({ canTryAgain: true })
    expect(stepAfterOpening({ ok: false, refusal: null, message: 'No answer' })).toEqual({
      kind: 'refused',
      message: 'No answer',
      canTryAgain: true,
    })
  })
})

describe('leaving the step', () => {
  it('goes to the Overview and never /, which would read the church as not confirmed yet', () => {
    expect(AFTER_THE_PAYMENT_STEP).toBe('/overview')
  })

  it('offers the link at 30 seconds, and asks far more often than that', () => {
    expect(WAITING_BEFORE_OFFERING_THE_LINK_MS).toBe(30_000)
    expect(ASKING_FOR_ACCESS_EVERY_MS).toBeLessThan(WAITING_BEFORE_OFFERING_THE_LINK_MS / 5)
  })
})

describe('what Stripe adds to the return address', () => {
  it('is only ever a reason to say it failed', () => {
    expect(cameBackFailed('failed')).toBe(true)
    for (const other of ['succeeded', 'pending', undefined, ['failed']]) expect(cameBackFailed(other)).toBe(false)
  })
})

describe('whether a wallet shows, and the "or" with it', () => {
  it('reads both of the shapes Stripe says it in', () => {
    expect(someWalletIsAvailable({ applePay: true, link: false })).toBe(true)
    expect(someWalletIsAvailable({ link: { available: true } })).toBe(true)
  })

  it('shows nothing when nothing can be drawn here, whichever way that is said', () => {
    expect(someWalletIsAvailable(undefined)).toBe(false)
    expect(someWalletIsAvailable({})).toBe(false)
    expect(someWalletIsAvailable({ applePay: false, link: false })).toBe(false)
    expect(someWalletIsAvailable({ applePay: { available: false }, link: undefined })).toBe(false)
  })
})

describe('the words', () => {
  it('match the approved screen', () => {
    expect(PAYMENT_PAGE).toMatchObject({
      title: 'Add a card or bank account',
      step: 'Step 3 of 3',
      stepName: 'Payment',
      or: 'or',
      secured: 'Secured by Stripe',
      submit: 'Start my free trial',
      underTheButton: 'You can change or cancel any time in Settings, Billing.',
      finishing: 'Finishing setup...',
      takingLonger: 'This is taking longer than usual.',
    })
    expect(trialLine('November 24, 2026')).toBe(
      "You won't be charged today. Your free trial ends on November 24, 2026, and we'll email you a week before.",
    )
    expect(REMINDERS_OFF_PAGE.done).toBe("You won't get another reminder.")
  })

  it('name the trial day on the clock of the church, not of the server', () => {
    const justAfterMidnightUtc = '2026-11-25T01:00:00.000Z'

    expect(trialEndsOn(justAfterMidnightUtc, 'America/Chicago')).toBe('November 24, 2026')
    expect(trialEndsOn(justAfterMidnightUtc, 'Asia/Tokyo')).toBe('November 25, 2026')
  })

  it('name no price anywhere on the page', () => {
    for (const words of [...Object.values(PAYMENT_PAGE), trialLine('November 24, 2026')]) {
      expect(words).not.toMatch(/\$|\d+\s*(a|per)\s*(month|year)/i)
    }
  })
})

describe('the form before the route has answered', () => {
  const html = renderToStaticMarkup(
    createElement(PaymentForm, {
      cycle: 'month',
      code: null,
      timeZone: 'America/Chicago',
      prefill: { name: 'Dan Whitfield', email: 'dan@grace.example' },
      cameBackFailed: false,
    }),
  )

  it('holds the card still, with the heading and a button that cannot be pressed', () => {
    expect(html).toContain('Add a card or bank account')
    expect(html).toContain('You won&#x27;t be charged today.')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Start my free trial<\/button>/)
    expect(html).toContain('You can change or cancel any time in Settings, Billing.')
  })

  it('names no date it has not been told, and does not load Stripe yet', () => {
    expect(html).not.toContain('Your free trial ends on')
    expect(html).not.toContain('js.stripe.com')
  })
})

describe('the link behind "Don\'t send me reminders"', () => {
  const GRACE = ministryId('5f2a4a10-8f6e-4d3a-9a57-0a4b3c2d1e0f')

  it('says which church, under the secret it was signed with and no other', () => {
    vi.stubEnv('SIGN_UP_CODE_SECRET', 'a-test-secret-that-is-long-enough-to-be-accepted')
    const token = remindersOffToken(GRACE)

    expect(churchOfRemindersOffToken(token)).toBe(GRACE)

    vi.stubEnv('SIGN_UP_CODE_SECRET', 'another-test-secret-that-is-long-enough-to-pass')
    expect(churchOfRemindersOffToken(token)).toBeNull()
  })

  it('is read as nothing where the secret is not set', () => {
    vi.stubEnv('SIGN_UP_CODE_SECRET', 'a-test-secret-that-is-long-enough-to-be-accepted')
    const token = remindersOffToken(GRACE)

    vi.stubEnv('SIGN_UP_CODE_SECRET', '')
    expect(churchOfRemindersOffToken(token)).toBeNull()
  })

  it.each([null, undefined, '', 'nonsense', `${GRACE}.`, `.${'0'.repeat(64)}`, `${GRACE}.${'0'.repeat(64)}.more`])(
    'is read as nothing from %s',
    (token) => {
      vi.stubEnv('SIGN_UP_CODE_SECRET', 'a-test-secret-that-is-long-enough-to-be-accepted')
      expect(churchOfRemindersOffToken(token)).toBeNull()
    },
  )
})
