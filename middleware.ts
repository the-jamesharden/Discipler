import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseCredentials } from '~/platform/supabase/credentials'

/**
 * Refreshes the Supabase session cookie on each request. Sessions are long-lived
 * -- on the order of a year -- so a Leader or Admin is not signed out between
 * visits, and recovery is by password until one-time codes ship.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, anonKey } = supabaseCredentials()

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

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
