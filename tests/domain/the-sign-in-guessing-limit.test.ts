import { describe, expect, it } from 'vitest'
import {
  FAILED_SIGN_INS_ALLOWED,
  SIGN_IN_WINDOW_MINUTES,
  signInIsHeldBack,
} from '~/domain/sign-in-limit'

/**
 * Ten failed sign-ins per account and per network in fifteen minutes, and the
 * eleventh is not tried (Exponential launch, ticket 13; Q34).
 */

describe('the sign-in guessing limit', () => {
  it('is ten failures in fifteen minutes', () => {
    expect(FAILED_SIGN_INS_ALLOWED).toBe(10)
    expect(SIGN_IN_WINDOW_MINUTES).toBe(15)
  })

  it('lets a try through with nine failures on the account and nine on the network', () => {
    expect(signInIsHeldBack({ forAccount: 9, forNetwork: 9 })).toBe(false)
  })

  it('holds back the eleventh try on an account', () => {
    expect(signInIsHeldBack({ forAccount: 10, forNetwork: 0 })).toBe(true)
  })

  it('holds back the eleventh try from a network, whichever accounts it tried', () => {
    expect(signInIsHeldBack({ forAccount: 0, forNetwork: 10 })).toBe(true)
  })
})
