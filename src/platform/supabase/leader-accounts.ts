import { createClient } from '@supabase/supabase-js'
import { serviceRoleKey, supabaseCredentials } from './credentials'

/**
 * Where an account comes into being. Every other surface in Discipler acts for
 * somebody who already has one; this one is reached by a person with no session
 * at all, holding a link, so it is the only place that needs the key that can
 * create a user -- and it does nothing else with it.
 *
 * The credential is a phone number and a password, for every user, on one form.
 * Email is optional at Intake, so a credential built on it is one half the people
 * who need it may not have. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 */

/** Codes, never prose. The page renders its own wording, like every refusal. */
export type AccountRefusal =
  | 'account.password_too_short'
  /**
   * Discipler holds no number for this Person, so there is nothing to sign in
   * with -- and nothing to text them either. It is an Admin's to fix.
   */
  | 'account.no_number_on_file'
  /** A number already signs somebody in. Their way forward is to sign in with it. */
  | 'account.already_exists'

/** Short enough to type on a phone, long enough to be worth having. */
export const SHORTEST_PASSWORD = 8

export interface LeaderAccounts {
  create(
    phone: string | null,
    password: string,
  ): Promise<{ readonly userId: string } | { readonly refusal: AccountRefusal }>
}

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
      // Supabase reports a taken identity as a conflict. Anything else is a
      // failure of ours and is not dressed up as the Leader's mistake.
      if (error.status === 422 || error.status === 409) {
        return { refusal: 'account.already_exists' }
      }
      throw error
    }

    return { userId: data.user.id }
  },
}
