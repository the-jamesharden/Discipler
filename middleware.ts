import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { contentSecurityPolicy, newNonce } from '~/platform/security-headers'
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
 *
 * It is also where the Content-Security-Policy is set (Exponential launch, ticket 37),
 * because the policy holds a nonce and a nonce is one request's. On the request as well
 * as the response, because that is where Next reads the nonce it puts on its own scripts.
 */
export async function middleware(request: NextRequest) {
  const policy = contentSecurityPolicy({
    nonce: newNonce(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    development: process.env.NODE_ENV === 'development',
  })
  request.headers.set('content-security-policy', policy)

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
    response.headers.set('content-security-policy', policy)
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

  // Last, because a refreshed session replaces the response.
  response.headers.set('content-security-policy', policy)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
