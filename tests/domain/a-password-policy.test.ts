import { describe, expect, it } from 'vitest'
import { LONGEST_PASSWORD_BYTES, newPasswordRefusal, SHORTEST_PASSWORD } from '~/domain/accounts'
import { COMMON_PASSWORDS } from '~/domain/common-passwords'

/**
 * The one rule on a password somebody chooses, wherever they choose it: at an
 * Invitation Link, at a Ministry Setup Link, at a change of their own and, from
 * Exponential launch ticket 17, at sign-up (Exponential launch, ticket 12; Q28).
 *
 * At least 8 characters, no more than Supabase Auth can store, and not one of
 * the common passwords. Nothing about which kinds of character it holds.
 */

describe('a new password', () => {
  it('is accepted at 8 characters', () => {
    expect(newPasswordRefusal('tq7-wxzv')).toBeNull()
  })

  it('is refused at 7', () => {
    expect(newPasswordRefusal('tq7-wxz')).toBe('account.password_too_short')
  })

  it('is refused when it is a common password', () => {
    expect(newPasswordRefusal('password1')).toBe('account.password_too_common')
  })

  it('is refused when it is a common password in other capitals', () => {
    expect(newPasswordRefusal('PassWord1')).toBe('account.password_too_common')
    expect(newPasswordRefusal('ILOVEYOU')).toBe('account.password_too_common')
  })

  it('is short before it is common, so a person reads the rule they can act on first', () => {
    // `iloveu` is on the source list too, and is refused for its length alone.
    expect(newPasswordRefusal('iloveu')).toBe('account.password_too_short')
  })

  it('may be 64 characters and more', () => {
    expect(newPasswordRefusal('k'.repeat(64))).toBeNull()
    expect(newPasswordRefusal('k'.repeat(72))).toBeNull()
  })

  it('is refused past 72 bytes, which is all Supabase Auth can store', () => {
    // GoTrue hashes with bcrypt, which reads 72 bytes, and refuses a longer one
    // with a 500 rather than an answer.
    expect(newPasswordRefusal('k'.repeat(73))).toBe('account.password_too_long')
    expect(newPasswordRefusal('k'.repeat(100))).toBe('account.password_too_long')
  })

  it('counts the bytes, not the characters, against that ceiling', () => {
    // Four bytes each in UTF-8: nineteen of them is 76 bytes in 38 characters.
    expect(newPasswordRefusal('🔑'.repeat(18))).toBeNull()
    expect(newPasswordRefusal('🔑'.repeat(19))).toBe('account.password_too_long')
  })

  it('asks for no particular kinds of character', () => {
    expect(newPasswordRefusal('lanternthicketwillow')).toBeNull()
  })
})

describe('the list of common passwords', () => {
  const list = COMMON_PASSWORDS.split('\n').filter((line) => line !== '')

  it('is the long list, not a sample of it', () => {
    expect(list.length).toBeGreaterThan(46_000)
  })

  it('holds only lower case, so a lower-cased password is all it is asked about', () => {
    expect(list.filter((entry) => entry !== entry.toLowerCase())).toEqual([])
  })

  it('holds nothing the length rule already refuses', () => {
    expect(list.filter((entry) => entry.length < SHORTEST_PASSWORD)).toEqual([])
  })

  it('holds each entry once, in order', () => {
    expect(list).toEqual([...new Set(list)].sort())
  })

  it('holds the password the ticket names', () => {
    expect(list).toContain('password1')
  })
})

describe('the password ceiling', () => {
  it('is at least the 64 characters the spec asks for', () => {
    expect(LONGEST_PASSWORD_BYTES).toBeGreaterThanOrEqual(64)
  })
})
