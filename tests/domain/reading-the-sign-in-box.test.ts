import { describe, expect, it } from 'vitest'
import { readSignInEntry } from '~/domain/accounts'

/**
 * The one box, "Email or phone" (Exponential launch, ticket 21). An `@` makes an entry
 * an email, and anything else has to read as a phone.
 */

describe('reading the sign-in box', () => {
  it('reads an entry with an @ as an email, in lower case', () => {
    expect(readSignInEntry('Pastor@Grace.Example')).toEqual({ email: 'pastor@grace.example' })
    expect(readSignInEntry('  pastor@grace.example ')).toEqual({ email: 'pastor@grace.example' })
  })

  it('never checks an email further, because a mistyped one is only a wrong one', () => {
    for (const entry of ['pastor@', '@', '@grace', 'a b@c', 'a@b@c']) {
      expect(readSignInEntry(entry)).toEqual({ email: entry.toLowerCase() })
    }
  })

  it('reads anything else through the one reading of a phone number', () => {
    for (const entry of ['2055550100', '(205) 555-0100', '205.555.0100', '1 205 555 0100', '+12055550100']) {
      expect(readSignInEntry(entry)).toEqual({ phone: '+12055550100' })
    }
    expect(readSignInEntry('+14165550100')).toEqual({ phone: '+14165550100' })
  })

  it('reads neither from an entry that is a typo', () => {
    for (const entry of ['pastor', '555-0100', 'pastor.grace.example', '12345']) {
      expect(readSignInEntry(entry)).toBeNull()
    }
  })
})
