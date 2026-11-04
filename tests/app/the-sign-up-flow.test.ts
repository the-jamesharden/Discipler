import { describe, expect, it } from 'vitest'
import {
  carriedFrom,
  countdown,
  digitsOfCode,
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
