import { describe, expect, it } from 'vitest'
import {
  carriedFrom,
  carrying,
  countdown,
  digitsOfCode,
  emailPageArrival,
  signUpHref,
  stepAfterCodeRefusal,
  stepAfterSendRefusal,
} from '../../app/signup/flow'

/**
 * What sign-up's forms decide in the browser, written where it can be read without one
 * (Exponential launch, tickets 15 and 16).
 */
describe('the code box', () => {
  it.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    ['123-456', '123456'],
    [' 123456\n', '123456'],
    ['Your code is 482913', '482913'],
    ['12', '12'],
    ['1234567', '123456'],
    ['abc', ''],
  ])('reads %j as %j, so a pasted code is taken as it comes', (typed, digits) => {
    expect(digitsOfCode(typed)).toBe(digits)
  })
})

describe('the wait for a new code', () => {
  it.each([
    [60, '1:00'],
    [59, '0:59'],
    [42, '0:42'],
    [9, '0:09'],
    [1, '0:01'],
  ])('%i seconds reads %s', (seconds, shown) => {
    expect(countdown(seconds)).toBe(shown)
  })
})

describe('an address on the way through', () => {
  it('names each step', () => {
    expect(signUpHref('human_check', '')).toBe('/signup')
    expect(signUpHref('email_and_phone', '')).toBe('/signup/email')
    expect(signUpHref('code', '')).toBe('/signup/code')
    expect(signUpHref('account', '')).toBe('/signup/account')
  })

  it('keeps what it carried, and goes through page one again when told to', () => {
    expect(signUpHref('code', 'code=EXPO26')).toBe('/signup/code?code=EXPO26')
    expect(signUpHref('human_check', '', { again: true })).toBe('/signup?again=1')
    expect(signUpHref('human_check', 'ref=k7m2qp9x', { again: true })).toBe('/signup?again=1&ref=k7m2qp9x')
  })

  it('carries a code and a referral, and takes the first of a repeated one', () => {
    expect(carriedFrom({ code: 'EXPO26', ref: 'k7m2qp9x' })).toBe('code=EXPO26&ref=k7m2qp9x')
    expect(carriedFrom({ code: ['expo26', 'other'] })).toBe('code=expo26')
  })

  it('drops whatever could not be a code', () => {
    expect(carriedFrom({ code: '"><script>', ref: 'a'.repeat(65), again: '1', other: 'x' })).toBe('')
    expect(carriedFrom({})).toBe('')
  })
})

describe('a refusal that means another page', () => {
  it('moves page two on from the second of a double click', () => {
    expect(stepAfterSendRefusal('signup.resend_too_soon')).toEqual({ step: 'code' })
    expect(stepAfterSendRefusal('signup.already_verified')).toEqual({ step: 'account' })
  })

  it('sends a lapsed pass, or another address on the attempt, through page one again', () => {
    expect(stepAfterSendRefusal('signup.human_check_needed')).toEqual({ step: 'human_check', again: true })
    expect(stepAfterCodeRefusal('signup.human_check_needed')).toEqual({ step: 'human_check', again: true })
  })

  it('moves the code page on when the code was already used', () => {
    expect(stepAfterCodeRefusal('signup.already_verified')).toEqual({ step: 'account' })
  })

  it('stays put for anything that is said on the page', () => {
    for (const refusal of [
      'signup.bad_email',
      'signup.bad_phone',
      'signup.phone_not_us',
      'signup.too_many_codes',
      'signup.not_sent',
      null,
    ]) {
      expect(stepAfterSendRefusal(refusal)).toBeNull()
    }
    for (const refusal of [
      'signup.wrong_code',
      'signup.code_expired',
      'signup.too_many_tries',
      'signup.malformed_code',
      'signup.no_code',
      'signup.not_checked',
      'signup.resend_too_soon',
      null,
    ]) {
      expect(stepAfterCodeRefusal(refusal)).toBeNull()
    }
  })
})

describe('what a tab carries (ticket 20)', () => {
  it('carries the code, the referral and that the offer was claimed, always in one order', () => {
    expect(carriedFrom({ claimed: '1', ref: 'abc', code: 'EXPO26', sent: '1', again: '1' })).toBe('code=EXPO26&ref=abc&claimed=1')
  })

  it('adds a typed code to what is already carried, and changes it where there is one', () => {
    expect(carrying('ref=abc', 'code', 'EXPO26')).toBe('code=EXPO26&ref=abc')
    expect(carrying('', 'code', 'EXPO26')).toBe('code=EXPO26')
    expect(carrying('code=expo26', 'code', 'EXPO26')).toBe('code=EXPO26')
    expect(carrying('code=EXPO26', 'claimed', '1')).toBe('code=EXPO26&claimed=1')
  })

  it('says the code page was reached from "Continue", which nothing else carries on', () => {
    expect(signUpHref('code', 'code=EXPO26', { sent: true })).toBe('/signup/code?code=EXPO26&sent=1')
    expect(signUpHref('code', '', { sent: true })).toBe('/signup/code?sent=1')
    expect(signUpHref('code', 'code=EXPO26')).toBe('/signup/code?code=EXPO26')
  })
})

describe('arriving on the email and phone page (ticket 20)', () => {
  const OPEN = new Date('2026-11-10T18:00:00Z')
  const ENDED = new Date('2026-12-12T08:00:00Z')
  const nothing = { code: null, claimed: false, refIsLive: false, at: OPEN }

  it('with nothing, shows nothing, and offers the box', () => {
    expect(emailPageArrival(nothing)).toEqual({ offerScreen: false, invited: false, codeRefusal: null, canTypeACode: true })
  })

  it('with the code, opens the offer until it is claimed', () => {
    expect(emailPageArrival({ ...nothing, code: 'expo26' })).toEqual({
      offerScreen: true,
      invited: false,
      codeRefusal: null,
      canTypeACode: false,
    })
    expect(emailPageArrival({ ...nothing, code: 'EXPO26', claimed: true }).offerScreen).toBe(false)
  })

  it('with the code and a referral, shows only the offer', () => {
    expect(emailPageArrival({ ...nothing, code: 'EXPO26', refIsLive: true })).toMatchObject({ offerScreen: true, invited: false })
  })

  it('with an expired code, says so, opens nothing, and leaves a referral standing', () => {
    expect(emailPageArrival({ ...nothing, code: 'EXPO26', at: ENDED })).toMatchObject({
      offerScreen: false,
      codeRefusal: 'offer.code_expired',
    })
    expect(emailPageArrival({ ...nothing, code: 'EXPO26', refIsLive: true, at: ENDED }).invited).toBe(true)
  })

  it('with a code nobody knows, says so and opens nothing', () => {
    expect(emailPageArrival({ ...nothing, code: 'EXPO25' })).toMatchObject({
      offerScreen: false,
      codeRefusal: 'offer.code_unknown',
    })
  })

  it('claimed means nothing without a code that applies', () => {
    expect(emailPageArrival({ ...nothing, claimed: true })).toEqual(emailPageArrival(nothing))
  })

  it('with a live referral, shows the banner and offers the box', () => {
    expect(emailPageArrival({ ...nothing, refIsLive: true })).toMatchObject({ invited: true, canTypeACode: true })
  })
})
