import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'

/**
 * Sign-in as an ordinary form POST rather than a client-side call, so it works
 * before JavaScript has loaded and on a phone with a poor connection. The session
 * cookie is set on the response by the Supabase client.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')

  const failed = (message: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, request.url),
      { status: 303 },
    )

  if (!email || !password) return failed('Enter your email and password.')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  // Deliberately vague: a precise message would tell an outsider which email
  // addresses belong to a Ministry.
  if (error) return failed('That email and password did not match.')

  return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
}
