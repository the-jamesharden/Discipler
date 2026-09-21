import { describe, expect, it } from 'vitest'
import { invitationProblemMessage, leadingWithSentence, revealHeading } from '../../app/invitation/copy'
import type { InvitationRefusal } from '~/domain/errors'
import type { AccountRefusal } from '~/domain/accounts'

/**
 * A refusal that reaches its holder as nothing at all is the silent no-op this
 * flow rules out, and every one of them arrives here as a code.
 */

const EVERY_REFUSAL: readonly (InvitationRefusal | AccountRefusal)[] = [
  'invitation.not_found',
  'invitation.expired',
  'invitation.already_used',
  'invitation.not_a_leader',
  'account.password_too_short',
  'account.no_number_on_file',
  'account.already_exists',
]

describe('what the invitation page says went wrong', () => {
  it('has wording for every refusal either side of the boundary can raise', () => {
    for (const code of EVERY_REFUSAL) {
      expect(invitationProblemMessage(code)).toBeTruthy()
    }
  })

  it('says nothing at all when nothing went wrong', () => {
    expect(invitationProblemMessage(undefined)).toBeNull()
    expect(invitationProblemMessage('')).toBeNull()
  })

  it('does not reflect back what a caller put in the URL', () => {
    // The query string is whatever somebody typed. A code nobody recognises is
    // answered with the generic wording, never with itself.
    const injected = '<script>alert(1)</script>'
    expect(invitationProblemMessage(injected)).not.toContain('script')
    expect(invitationProblemMessage(injected)).toBe(
      invitationProblemMessage('invitation.not_found'),
    )
  })

  it('is not fooled by what an object inherits', () => {
    // `in` would let `__proto__`, `toString` and `constructor` through and hand
    // back something React cannot render -- a 500 on a page a signed-out Leader
    // reaches with a real link, from a query string anybody can type.
    for (const inherited of ['__proto__', 'toString', 'constructor', 'valueOf']) {
      expect(typeof invitationProblemMessage(inherited)).toBe('string')
      expect(invitationProblemMessage(inherited)).toBe(
        invitationProblemMessage('invitation.not_found'),
      )
    }
  })

  it('tells a spent link apart from one that has run out', () => {
    // One sends its holder to sign in; the other sends them back to an Admin.
    expect(invitationProblemMessage('invitation.already_used')).toContain('Sign in')
    expect(invitationProblemMessage('invitation.expired')).toContain('new one')
  })

  it('names the phone number as the thing they will sign in with', () => {
    expect(invitationProblemMessage('invitation.already_used')).toContain('phone number')
    expect(invitationProblemMessage('account.already_exists')).toContain('phone number')
  })
})

describe('the reveal: who somebody has been paired with', () => {
  it('says paired, which is the product’s word for it (James, 2026-09-21)', () => {
    expect(revealHeading(['Emily Johnson'])).toBe('You’ve been paired with Emily Johnson')
    expect(revealHeading(['Emily Johnson'])).not.toContain('matched')
  })

  it('reads the count, never a group-versus-one-to-one flag', () => {
    expect(revealHeading(['Emily Johnson', 'Sarah Kim'])).toBe(
      'You’ve been paired with Emily Johnson and Sarah Kim',
    )
    expect(revealHeading(['Emily Johnson', 'Sarah Kim', 'Anna Reed'])).toBe(
      'You’ve been paired with Emily Johnson, Sarah Kim and Anna Reed',
    )
  })

  it('says something rather than nothing when it has no names to give', () => {
    expect(revealHeading([])).toBe('You’ve been paired with someone')
  })
})

describe('saying who they would be leading with', () => {
  // Manual pairing, recut ticket 01. A Discipler added to a group is joining
  // somebody, and decides whether to lead knowing who.
  it('names the leaders they would be joining', () => {
    expect(leadingWithSentence(['Grace Lee'])).toBe('You’d be leading with Grace Lee.')
    expect(leadingWithSentence(['Grace Lee', 'David Chen'])).toBe(
      'You’d be leading with Grace Lee and David Chen.',
    )
  })

  it('says nothing at all to somebody leading alone', () => {
    // Never *leading with someone*: `asList` has a word for no names, and this
    // sentence must not borrow it.
    expect(leadingWithSentence([])).toBeNull()
  })
})
