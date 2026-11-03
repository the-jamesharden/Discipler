import { describe, expect, it } from 'vitest'
import { signUpRefusalMessage } from '../../app/signup/copy'

/** What sign-up's first three steps say (Exponential launch, ticket 11). */
describe('sign-up’s refusals', () => {
  it('say how many tries are left, in the mock-up’s own words', () => {
    expect(signUpRefusalMessage('signup.wrong_code', 4)).toBe(
      "That code doesn't match. Please check your email and try again. You have 4 tries left.",
    )
    expect(signUpRefusalMessage('signup.wrong_code', 1)).toBe(
      "That code doesn't match. Please check your email and try again. You have 1 try left.",
    )
  })

  it('never say whether an address has an account', () => {
    for (const refusal of [
      'signup.not_human',
      'signup.human_check_needed',
      'signup.bad_email',
      'signup.bad_phone',
      'signup.phone_not_us',
      'signup.resend_too_soon',
      'signup.too_many_codes',
      'signup.not_sent',
      'signup.malformed_code',
      'signup.no_code',
      'signup.code_expired',
      'signup.too_many_tries',
      'signup.already_verified',
      'signup.not_checked',
    ] as const) {
      expect(signUpRefusalMessage(refusal)).not.toMatch(/\baccount\b/i)
    }
  })
})
