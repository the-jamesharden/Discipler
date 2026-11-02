import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { passwordChangeRefusalMessages } from '../../app/account/copy'
import { invitationProblemMessage } from '../../app/invitation/copy'
import { setupProblemMessage } from '../../app/setup/copy'
import { SHORTEST_PASSWORD, type NewPasswordRefusal } from '~/domain/accounts'

/**
 * Every surface a person chooses a password on can be refused by the whole of the
 * password rule, so each one words all of it (Exponential launch, ticket 12).
 * A code a surface did not word would fall through to *this link is not one we
 * recognise*, which is false and sends a person off to ask for a new link.
 */

const EVERY_PASSWORD_REFUSAL: readonly NewPasswordRefusal[] = [
  'account.password_too_short',
  'account.password_too_long',
  'account.password_too_common',
]

describe('what a password refusal says', () => {
  it('is worded on the Invitation Link, and is not the unrecognised-link sentence', () => {
    for (const code of EVERY_PASSWORD_REFUSAL) {
      expect(invitationProblemMessage(code)).not.toBe(invitationProblemMessage('invitation.not_found'))
    }
  })

  it('is worded on the Ministry Setup Link, and is not the unrecognised-link sentence', () => {
    for (const code of EVERY_PASSWORD_REFUSAL) {
      expect(setupProblemMessage(code)).not.toBe(setupProblemMessage('setup.not_found'))
    }
  })

  it('is worded on the change-your-password form', () => {
    for (const code of EVERY_PASSWORD_REFUSAL) {
      expect(passwordChangeRefusalMessages(code)).toHaveLength(1)
    }
  })

  it('says the same thing on all three, because it is one rule', () => {
    for (const code of EVERY_PASSWORD_REFUSAL) {
      const sentence = invitationProblemMessage(code)
      expect(setupProblemMessage(code)).toBe(sentence)
      expect(passwordChangeRefusalMessages(code)).toEqual([sentence])
    }
  })

  it('names the number the rule enforces', () => {
    expect(invitationProblemMessage('account.password_too_short')).toContain(
      String(SHORTEST_PASSWORD),
    )
  })
})

describe('the local Supabase Auth', () => {
  it('asks for the same shortest password the domain does', () => {
    // Only the local stack reads this file. Production's minimum is a setting on
    // the hosted project, which ticket 12's comments list for James. Parsed rather
    // than asked of Auth: a running stack keeps the value it was started with until
    // `supabase stop` and `supabase start`, so asking it says when it last started.
    const config = parse(readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8'))
    const auth = config.auth as { minimum_password_length?: unknown }

    expect(auth.minimum_password_length).toBe(SHORTEST_PASSWORD)
  })
})
