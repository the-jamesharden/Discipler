import { createClient } from '@supabase/supabase-js'
import { SHORTEST_PASSWORD } from '~/domain/accounts'
import type { Accounts } from '~/service/ports'
import { serviceRoleKey, supabaseCredentials } from './credentials'

/**
 * Where an account comes into being: a phone identity with a password, and no
 * email, for every user alike. Two things reach it -- a Leader accepting an
 * Invitation Link, who has no session at all, and the provisioning of a Ministry's
 * first Admin -- so it is the only place that needs the key that can create a
 * user, and it does nothing else with it.
 *
 * The port it satisfies is declared in `src/service/ports.ts`, and the password
 * rule and refusal codes in `src/domain/accounts.ts`, so a page can render a
 * refusal without importing an adapter.
 */

export const supabaseAccounts: Accounts = {
  async create(phone, password) {
    if (!phone) return { refusal: 'account.no_number_on_file' }
    if (password.length < SHORTEST_PASSWORD) return { refusal: 'account.password_too_short' }

    const admin = createClient(supabaseCredentials().url, serviceRoleKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // A phone identity and nothing else. No email is set, because email is not a
    // credential here and an address on the account would be a second door onto it
    // that nothing in the product opens.
    //
    // At acceptance the number is the one on file, never one the Leader typed: the
    // invitation page displays it and refuses it as input, so a forwarded link
    // cannot re-point an account at somebody else's phone.
    const { data, error } = await admin.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
    })

    if (error) {
      // Only a taken identity. `422` alone covers an unparseable number and phone
      // signups being switched off as well, and answering either of those with
      // "there is already an account for this number, go and sign in" is advice
      // that is false, impossible to follow, and swallows the real fault.
      if (error.code === 'phone_exists' || error.code === 'user_already_exists') {
        return { refusal: 'account.already_exists' }
      }
      throw error
    }

    return { userId: data.user.id }
  },

  async discard(userId) {
    const admin = createClient(supabaseCredentials().url, serviceRoleKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Asked before deleting, and asked of the database rather than trusted from the
    // caller. The one account that must survive this is one somebody is already
    // signed in with, and the record of that is `person.user_id` -- the same column
    // the acceptance route reads to decide not to create a second account.
    const { data: held, error: lookup } = await admin
      .from('person')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (lookup) throw new Error(`Could not check whether an account is held: ${lookup.message}`)
    if (held && held.length > 0) {
      throw new Error(`Refusing to discard ${userId}: a Person already holds it`)
    }

    const { error } = await admin.auth.admin.deleteUser(userId)

    // Already gone is the outcome this wanted. This runs while another failure is
    // being handled, and throwing here would replace the error the Leader needs to
    // see with one about the cleanup that followed it.
    if (error && error.status !== 404) throw error
  },
}
