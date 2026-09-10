import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whose session this is, answered without a call to the Auth server.
 *
 * Every signed-in request used to ask the Auth server who held the cookie -- the
 * middleware once and the page once more -- and a click on a tab, with the links
 * beside it being prefetched, was eight or more such calls. The Auth server holds
 * a fixed handful of database connections, so those calls queued behind each other,
 * and when a session's token was near its end the concurrent requests raced to
 * refresh it and the loser was signed out.
 *
 * The token is a signed statement from the Auth server, and the server publishes
 * the key it signs with. `getClaims` checks the signature and the expiry against
 * that key, fetched once and kept for a while, so on most requests nothing leaves
 * the process; only a token about to expire is refreshed, which is the one call
 * the Auth server is for.
 *
 * What the token cannot say is whether its session still exists. A password
 * change ends every session on the account
 * (`docs/adr/0016-a-password-change-ends-every-session.md`), and it ends them
 * on the server, where the token in somebody's hand does not see it. So the second
 * half of the answer comes from the database on the connection the request already
 * holds: `session_is_live` reads the one row the token names. A token that verifies
 * but names a session that is gone is nobody, which is how a reset signs a stolen
 * session out before it can open a page.
 */
export const signedInUserId = async (supabase: SupabaseClient): Promise<string | null> => {
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) return null

  const { data: live, error } = await supabase.rpc('session_is_live')

  // Raised rather than read as signed-out: a database that could not answer
  // would otherwise send a signed-in Admin to the sign-in page, and the page's
  // own reads are about to fail on the same fault anyway.
  if (error) throw new Error(`Could not tell whether the session is still held: ${error.message}`)

  return live === true ? userId : null
}
