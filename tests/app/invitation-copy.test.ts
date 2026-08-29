import { describe, expect, it } from 'vitest'
import { asList, invitationProblemMessage } from '../../app/invitation/copy'
import type { InvitationRefusal } from '~/domain/errors'
import type { AccountRefusal } from '~/platform/supabase/leader-accounts'

/**
 * A refusal that reaches its holder as nothing at all is the silent no-op this
 * flow rules out, and every one of them arrives here as a code.
 */

const EVERY_REFUSAL: readonly (InvitationRefusal | AccountRefusal)[] = [
  'invitation.not_found',
  'invitation.expired',
  'invitation.already_used',
  'invitation.not_a_leader',
  'invitation.not_a_participant',
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

describe('naming who somebody has been matched with', () => {
  it('reads the count, never a group-versus-one-to-one flag', () => {
    expect(asList(['Emily Johnson'])).toBe('Emily Johnson')
    expect(asList(['Emily Johnson', 'Sarah Kim'])).toBe('Emily Johnson and Sarah Kim')
    expect(asList(['Emily Johnson', 'Sarah Kim', 'Anna Reed'])).toBe(
      'Emily Johnson, Sarah Kim and Anna Reed',
    )
  })

  it('says something rather than nothing when it has no names to give', () => {
    expect(asList([])).toBe('someone')
  })
})
