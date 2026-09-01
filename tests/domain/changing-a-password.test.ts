import { describe, expect, it } from 'vitest'
import { passwordChangeRefusals, SHORTEST_PASSWORD } from '~/domain/accounts'

/**
 * The rules a self-service password change checks before it touches anything: the
 * form's own rules, in the order the form asks its questions, so a person reads
 * their mistakes top to bottom and a form that was going to be refused anyway
 * spends nothing at the platform.
 *
 * The current password is not among them. Whether it is right is a fact only the
 * platform holds, and the port answers it alone once the form is well-formed.
 */

const long = 'a'.repeat(SHORTEST_PASSWORD)
const short = 'a'.repeat(SHORTEST_PASSWORD - 1)

describe('the rules on a new password', () => {
  it('accepts a long enough password typed the same twice', () => {
    expect(passwordChangeRefusals(long, long)).toEqual([])
  })

  it('refuses one that is too short', () => {
    expect(passwordChangeRefusals(short, short)).toEqual(['account.password_too_short'])
  })

  it('refuses two that differ', () => {
    expect(passwordChangeRefusals(long, `${long}b`)).toEqual(['account.passwords_differ'])
  })

  it('reports both at once, in field order', () => {
    // Too short comes first because the new password is the field above the
    // repeat, which is the order the person filled the form in.
    expect(passwordChangeRefusals(short, `${short}b`)).toEqual([
      'account.password_too_short',
      'account.passwords_differ',
    ])
  })

  it('places no rule on the new password beyond its length', () => {
    // Re-setting the same password is harmless and still ends every session, which
    // is the outcome that matters -- so nothing here asks for it to be different.
    expect(passwordChangeRefusals('correct-horse-battery-staple', 'correct-horse-battery-staple')).toEqual([])
  })
})
