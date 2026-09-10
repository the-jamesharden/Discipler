import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseCredentials } from '~/platform/supabase/credentials'

/**
 * Keeps the Supabase session cookie current. Sessions are long-lived -- on the
 * order of a year -- so a Leader or Admin is not signed out between visits, and
 * recovery is by password until one-time codes ship.
 *
 * This is the one place a request can write cookies, so it is the one place a
 * refresh can land; a page cannot. It asks the Auth server for nothing on an
 * ordinary request: `getClaims` verifies the token against the server's published
 * signing key, and only a token about to expire is refreshed. Whether the session
 * behind a valid token still exists is the page's question, answered in
 * `src/platform/supabase/session.ts` -- the middleware runs on prefetches too, and
 * a question asked here would be asked once per link on the screen.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  let credentials
  try {
    credentials = supabaseCredentials()
  } catch (error) {
    // With no credentials there is no session to refresh. Throwing here would put a
    // 500 on every route, /login included -- and /login is the one page that could
    // have said what to do about it. So the request passes through unrefreshed and
    // the reason is logged where whoever started the app will see it.
    console.error(error)
    return response
  }

  const { url, anonKey } = credentials

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  await supabase.auth.getClaims()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
