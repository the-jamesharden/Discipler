import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { backFromARefusal, changesTheChurchsWork } from '~/domain/read-only'
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
 * It is also where an ended church's read-only pages are enforced (Exponential launch,
 * ticket 33), because every route is behind it and a route added later cannot forget. That
 * does ask a question, but only for a request that would change a church's work, and those
 * are never prefetched. A read that fails lets the request through: the database behind it
 * is then the route's problem, and nobody loses their work to a question about billing.
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

  const { data: claims } = await supabase.auth.getClaims()

  if (claims?.claims && changesTheChurchsWork(request.method, request.nextUrl.pathname)) {
    const { data, error } = await supabase.rpc('signed_in_admin')
    if (error) console.error(`Asking whether a church has ended failed: ${error.code ?? 'unknown'}`)
    if ((data as { billing?: { standing?: unknown } } | null)?.billing?.standing === 'ended') {
      // Compared with the Host the browser asked for, because behind `next start` or a proxy
      // `request.url` can name an address the browser never used.
      const refused = NextResponse.redirect(
        new URL(backFromARefusal(request.headers.get('referer'), request.headers.get('host')), request.url),
        { status: 303 },
      )
      for (const cookie of response.cookies.getAll()) refused.cookies.set(cookie)
      return refused
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
