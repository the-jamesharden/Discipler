import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import type { SignInFailure } from '../../login/failures'

/**
 * Sign-in as an ordinary form POST rather than a client-side call, so it works
 * before JavaScript has loaded and on a phone with a poor connection. The session
 * cookie is set on the response by the Supabase client.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')

  // A code rather than the message itself: the sign-in page owns the wording, and
  // nothing a stranger puts in the query string can be rendered in the app's own
  // error styling.
  const failed = (reason: SignInFailure) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url), { status: 303 })

  if (!email || !password) return failed('missing-credentials')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  // Deliberately vague: a precise message would tell an outsider which email
  // addresses belong to a Ministry.
  if (error) return failed('no-such-account')

  return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
}
