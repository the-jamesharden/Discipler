import { createClient } from '@supabase/supabase-js'
import { SHORTEST_PASSWORD } from '~/domain/accounts'
import type { LeaderAccounts } from '~/service/ports'
import { serviceRoleKey, supabaseCredentials } from './credentials'

/**
 * Where an account comes into being. Every other surface in Discipler acts for
 * somebody who already has one; this one is reached by a person with no session
 * at all, holding a link, so it is the only place that needs the key that can
 * create a user -- and it does nothing else with it.
 *
 * The port it satisfies is declared in `src/service/ports.ts`, and the password
 * rule and refusal codes in `src/domain/accounts.ts`, so a page can render a
 * refusal without importing an adapter.
 */

export const supabaseLeaderAccounts: LeaderAccounts = {
  async create(phone, password) {
    if (!phone) return { refusal: 'account.no_number_on_file' }
    if (password.length < SHORTEST_PASSWORD) return { refusal: 'account.password_too_short' }

    const admin = createClient(supabaseCredentials().url, serviceRoleKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // The number is the one on file, never one the Leader typed: the invitation
    // page displays it and refuses it as input, so a forwarded link cannot
    // re-point an account at somebody else's phone.
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
}
