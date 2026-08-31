import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { supabaseLeaderAccounts } from '~/platform/supabase/leader-accounts'
import {
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The window between an account being created and the acceptance that links it.
 *
 * Acceptance mints the auth user first and links it inside the command that
 * follows, so a failure in between leaves a login belonging to no Person. Ticket 06
 * recorded that as recoverable by retrying the same link. It was not: the retry
 * reads `person.user_id`, which the failed command never set, so it tries to create
 * the account a second time and is refused because the number is taken -- and the
 * refusal tells the Leader to go and sign in to an account linked to nobody, which
 * would accept nothing.
 *
 * What closes it is undoing the half-step rather than reconciling it later. These
 * cover the primitive that lets the route do that.
 */

describe('an account orphaned between creation and acceptance', () => {
  let ministry: MinistryFixture

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')

    // The adapter reads its keys from the environment the way the running app does,
    // and the test runner is not the app. Discovered from the local stack rather
    // than hard-coded, for the reason `local-supabase.ts` gives: keys a test chose
    // for itself prove the adapter agrees with the test and nothing else.
    const { apiUrl, anonKey, serviceRoleKey } = localSupabase()
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= apiUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= anonKey
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= serviceRoleKey
  })

  const created: string[] = []

  afterAll(async () => {
    for (const userId of created) {
      await serviceRoleClient().auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  it('leaves the number taken, so a second attempt at the same link is refused', async () => {
    // The state as it stands today, written down because it is the reason the
    // compensation below exists rather than a behaviour anybody wants.
    const phone = aNumber()

    const first = await supabaseLeaderAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in first)) throw new Error(`the first account was refused: ${first.refusal}`)
    created.push(first.userId)

    const second = await supabaseLeaderAccounts.create(phone, 'a-long-enough-password')
    expect(second).toEqual({ refusal: 'account.already_exists' })
  })

  it('frees the number again once the half-made account is discarded', async () => {
    const phone = aNumber()

    const orphan = await supabaseLeaderAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in orphan)) throw new Error(`the account was refused: ${orphan.refusal}`)

    await supabaseLeaderAccounts.discard(orphan.userId)

    // The retry the ticket promised. It works because the failed attempt left
    // nothing behind, not because anything reconciled it afterwards.
    const retry = await supabaseLeaderAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in retry)) throw new Error(`the retry was refused: ${retry.refusal}`)
    created.push(retry.userId)

    expect(retry.userId).not.toEqual(orphan.userId)
  })

  it('discards nothing and says nothing when the account is already gone', async () => {
    // The compensation runs in a failure path, where the thing it undoes may
    // already be undone. Throwing there would replace the error the Leader needs
    // to see with one about the cleanup.
    const phone = aNumber()
    const account = await supabaseLeaderAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in account)) throw new Error(`the account was refused: ${account.refusal}`)

    await supabaseLeaderAccounts.discard(account.userId)
    await expect(supabaseLeaderAccounts.discard(account.userId)).resolves.toBeUndefined()
  })

  it('refuses to discard an account a Person already holds', async () => {
    // The one case where deleting would do real harm: an account reached through
    // `person.user_id` was not made by the attempt that is failing, and removing it
    // would sign a working Leader out of a Ministry for good.
    const phone = aNumber()
    const account = await supabaseLeaderAccounts.create(phone, 'a-long-enough-password')
    if (!('userId' in account)) throw new Error(`the account was refused: ${account.refusal}`)
    created.push(account.userId)

    const { error } = await serviceRoleClient()
      .from('person')
      .insert({
        ministry_id: ministry.id,
        full_name: 'Held Account',
        phone: aNumber(),
        user_id: account.userId,
      })
    if (error) throw new Error(error.message)

    await expect(supabaseLeaderAccounts.discard(account.userId)).rejects.toThrow()

    const { data } = await serviceRoleClient().auth.admin.getUserById(account.userId)
    expect(data.user).not.toBeNull()
  })
})
