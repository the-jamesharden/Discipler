/**
 * What an account is, stated where the domain can see it. The thing that creates
 * one lives at the platform edge -- it needs the key that can mint a user -- but
 * the rule about a password and the codes a refusal travels as are decisions this
 * product made, not decisions Supabase made, and the surfaces that render them
 * should not have to reach through an adapter to find out what they are.
 *
 * The credential is a phone number and a password, for every user, on one form.
 * See `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
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
