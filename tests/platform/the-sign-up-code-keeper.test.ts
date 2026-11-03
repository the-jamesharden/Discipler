import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignUpCodeSecretMissing, readAttemptToken } from '~/domain/sign-up-attempt'
import { createSignUpCodeKeeper } from '~/platform/sign-up-code-keeper'
import { signUpIsOpen } from '~/platform/sign-up-switch'

/**
 * The randomness and the HMAC behind sign-up's code, and sign-up's switch (Exponential
 * launch, ticket 11).
 */

const keeper = createSignUpCodeKeeper(() => 'a-test-secret-that-is-long-enough-to-use')
const ATTEMPT = '00000000-0000-4000-8000-000000000001'

afterEach(() => vi.unstubAllEnvs())

describe('a code', () => {
  it('is always six digits, leading zeros included', () => {
    const draws = Array.from({ length: 5000 }, () => keeper.newCode())
    expect(draws.every((code) => /^\d{6}$/.test(code))).toBe(true)
    expect(new Set(draws).size).toBeGreaterThan(4900)
  })

  it('is sealed as an HMAC that does not hold it', () => {
    const sealed = keeper.seal(ATTEMPT, '012345')
    expect(sealed).toMatch(/^[0-9a-f]{64}$/)
    expect(sealed).not.toContain('012345')
  })

  it('matches only itself, on its own attempt', () => {
    const sealed = keeper.seal(ATTEMPT, '012345')
    expect(keeper.matches(ATTEMPT, '012345', sealed)).toBe(true)
    expect(keeper.matches(ATTEMPT, '012346', sealed)).toBe(false)
    expect(keeper.matches('00000000-0000-4000-8000-000000000002', '012345', sealed)).toBe(false)
  })

  it('never matches an attempt with no code', () => {
    expect(keeper.matches(ATTEMPT, '012345', null)).toBe(false)
  })

  it('does not match under another secret', () => {
    const other = createSignUpCodeKeeper(() => 'another-test-secret-long-enough-to-use')
    expect(other.matches(ATTEMPT, '012345', keeper.seal(ATTEMPT, '012345'))).toBe(false)
  })

  it('is refused with the secret unset or too short', () => {
    for (const value of ['', 'too-short']) {
      vi.stubEnv('SIGN_UP_CODE_SECRET', value)
      const unset = createSignUpCodeKeeper()
      expect(() => unset.seal(ATTEMPT, '012345')).toThrow(SignUpCodeSecretMissing)
      expect(() => unset.matches(ATTEMPT, '012345', null)).toThrow(SignUpCodeSecretMissing)
    }
  })
})

describe('an attempt’s ID', () => {
  it('is random, and reads back as an attempt', () => {
    const tokens = Array.from({ length: 100 }, () => keeper.newAttemptToken())
    expect(new Set(tokens).size).toBe(100)
    for (const token of tokens) expect(readAttemptToken(token)).toBe(token)
  })
})

describe('sign-up’s switch', () => {
  it('is shut unless it says exactly true', () => {
    for (const value of [undefined, '', '1', 'TRUE', 'yes', 'false']) {
      expect(signUpIsOpen({ SIGN_UP_OPEN: value })).toBe(false)
    }
    expect(signUpIsOpen({ SIGN_UP_OPEN: 'true' })).toBe(true)
  })

  it('obeys on production and on staging', () => {
    const on = { SIGN_UP_OPEN: 'true', VERCEL: '1' }
    expect(signUpIsOpen({ ...on, VERCEL_TARGET_ENV: 'production', VERCEL_ENV: 'production' })).toBe(true)
    expect(signUpIsOpen({ ...on, VERCEL_TARGET_ENV: 'staging', VERCEL_ENV: 'preview' })).toBe(true)
    expect(signUpIsOpen({ VERCEL: '1', VERCEL_TARGET_ENV: 'production' })).toBe(false)
  })

  it('stays shut on a Preview, which shares production’s database', () => {
    expect(signUpIsOpen({ SIGN_UP_OPEN: 'true', VERCEL: '1', VERCEL_TARGET_ENV: 'preview', VERCEL_ENV: 'preview' })).toBe(
      false,
    )
  })
})
