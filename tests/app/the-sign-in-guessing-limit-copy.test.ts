import { describe, expect, it } from 'vitest'
import { passwordChangeRefusalMessages } from '../../app/account/copy'
import { signInFailureMessage } from '../../app/login/failures'

/**
 * What a person reads once the sign-in guessing limit holds them back
 * (Exponential launch, ticket 13): one sentence on both doors it guards, naming
 * the wait and nothing about the account.
 */

const SENTENCE = 'Too many tries. Wait 15 minutes, then try again.'

describe('the guessing limit, in words', () => {
  it('is said on the sign-in page', () => {
    expect(signInFailureMessage('too-many-attempts')).toBe(SENTENCE)
  })

  it('is said the same way on the change-your-password form', () => {
    expect(passwordChangeRefusalMessages('account.too_many_attempts')).toEqual([SENTENCE])
  })
})
