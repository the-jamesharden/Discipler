import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SHORTEST_PASSWORD } from '~/domain/accounts'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A person changing their own password, at the port.
 *
 * One method and not a verify beside a set, for the reason ADR-0016 gives about
 * `setPassword` and `endSessions`: two methods would let a caller skip the verify,
 * and a borrowed phone would change the password unchallenged. So the tests here
 * are about the one method answering both halves -- refusing a wrong current
 * password without touching anything, and otherwise doing exactly what a reset does,
 * every session ended included.
 */

describe('changing your own password', () => {
  let ministry: MinistryFixture

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
  })

  const created: string[] = []

  afterAll(async () => {
    for (const userId of created) {
      await serviceRoleClient().auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })

  const NEW_PASSWORD = 'harbinger-lantern-copper-fern'

  const signInAttempt = async (phone: string, password: string) => {
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    return client.auth.signInWithPassword({ phone, password })
  }

  it('ends every session on the account, including the one that asked', async () => {
    const leader = await addPersonWithAccount(ministry, 'Marcus Webb', 'leader')

    // Two sessions, the way a person holds them: a phone and a laptop, both signed
    // in and both working. One of them is the one making the change.
    const phone = await signInWith(leader)
    const laptop = await signInWith(leader)
    expect((await phone.auth.getUser()).data.user?.id).toBe(leader.userId)
    expect((await laptop.auth.getUser()).data.user?.id).toBe(leader.userId)

    const outcome = await supabaseAccounts.changePassword(
      leader.userId,
      leader.password,
      NEW_PASSWORD,
    )
    expect(outcome).toEqual({ changed: true })

    // Both refused, the one that asked included. Keeping the asking session alive
    // was considered and rejected -- `docs/adr/0016-a-password-change-ends-every-
    // session.md` -- because it would make *ends every session* conditional.
    expect((await phone.auth.getUser()).data.user).toBeNull()
    expect((await laptop.auth.getUser()).data.user).toBeNull()
  })

  it('leaves the new password working and the old one refused', async () => {
    const leader = await addPersonWithAccount(ministry, 'Ruth Adeyemi', 'leader')

    await supabaseAccounts.changePassword(leader.userId, leader.password, NEW_PASSWORD)

    expect((await signInAttempt(leader.phone, leader.password)).error).not.toBeNull()
    const withTheNew = await signInAttempt(leader.phone, NEW_PASSWORD)
    expect(withTheNew.error).toBeNull()
    expect(withTheNew.data.user?.id).toBe(leader.userId)
  })

  it('refuses a wrong current password and touches nothing', async () => {
    const leader = await addPersonWithAccount(ministry, 'Sam Doyle', 'leader')
    const held = await signInWith(leader)

    const outcome = await supabaseAccounts.changePassword(
      leader.userId,
      'not-what-they-have',
      NEW_PASSWORD,
    )
    expect(outcome).toEqual({ refusal: 'account.current_password_wrong' })

    // The old password still signs them in, and the session they held is still
    // theirs: a refusal is not a reset.
    expect((await signInAttempt(leader.phone, leader.password)).error).toBeNull()
    expect((await signInAttempt(leader.phone, NEW_PASSWORD)).error).not.toBeNull()
    expect((await held.auth.getUser()).data.user?.id).toBe(leader.userId)
  })

  it('accepts the same password again, and still ends every session', async () => {
    const leader = await addPersonWithAccount(ministry, 'Nadia Farouk', 'leader')
    const held = await signInWith(leader)

    // No rule that it differ. Re-setting the same password is harmless, and the
    // sessions ending is the outcome that matters.
    const outcome = await supabaseAccounts.changePassword(
      leader.userId,
      leader.password,
      leader.password,
    )

    expect(outcome).toEqual({ changed: true })
    expect((await held.auth.getUser()).data.user).toBeNull()
    expect((await signInAttempt(leader.phone, leader.password)).error).toBeNull()
  })

  it('refuses a new password that is too short, before checking the current one', async () => {
    const leader = await addPersonWithAccount(ministry, 'Omar Haddad', 'leader')
    const held = await signInWith(leader)

    // The same rule `create` enforces at the same edge, so a caller that forgot the
    // form check cannot set a password the invitation form would have refused.
    const outcome = await supabaseAccounts.changePassword(
      leader.userId,
      leader.password,
      'a'.repeat(SHORTEST_PASSWORD - 1),
    )

    expect(outcome).toEqual({ refusal: 'account.password_too_short' })
    expect((await held.auth.getUser()).data.user?.id).toBe(leader.userId)
  })

  it('serves an account that no Person holds', async () => {
    // Somebody whose Person row was removed, or an account left over between
    // creation and acceptance. The credential is theirs and not a Ministry's, and a
    // membership check here would leave an orphaned account with a password it can
    // never change.
    const phone = aTestPhoneNumber()
    const minted = await supabaseAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in minted)) throw new Error(`the account was refused: ${minted.refusal}`)
    created.push(minted.userId)

    const outcome = await supabaseAccounts.changePassword(
      minted.userId,
      'a-long-enough-password',
      NEW_PASSWORD,
    )

    expect(outcome).toEqual({ changed: true })
    expect((await signInAttempt(phone, NEW_PASSWORD)).error).toBeNull()
  })
})
