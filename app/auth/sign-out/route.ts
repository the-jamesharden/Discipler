import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'

/**
 * Sign-out as an ordinary form POST, like sign-in: it works before JavaScript has
 * loaded, and a link that signed somebody out on a GET would be one a prefetch
 * could follow.
 *
 * This device only. Signing out is a person leaving a screen, not an account
 * being locked; ending every session everywhere is what a password change does,
 * and it says so before it does it (ADR-0016). The call clears the cookie on the
 * response whether or not the server accepted the token, which is the part this
 * wants -- see the same call in `app/account/change/route.ts`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  // Not fatal: the cookie is gone either way and the next request holds no
  // session. Logged, because a sign-out the server refused is worth knowing about.
  if (error) console.error(error)

  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
