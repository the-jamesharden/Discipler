import { NextResponse, type NextRequest } from 'next/server'
import { asPhoneNumber } from '~/domain/roster'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import type { SignInFailure } from '../../login/failures'

/**
 * Sign-in as an ordinary form POST rather than a client-side call, so it works
 * before JavaScript has loaded and on a phone with a poor connection. The session
 * cookie is set on the response by the Supabase client.
 *
 * The credential is a phone number and a password, for every user. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const typed = String(form.get('phone') ?? '').trim()
  const password = String(form.get('password') ?? '')

  // A code rather than the message itself: the sign-in page owns the wording, and
  // nothing a stranger puts in the query string can be rendered in the app's own
  // error styling.
  const failed = (reason: SignInFailure) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url), { status: 303 })

  if (!typed || !password) return failed('missing-credentials')

  // The same reading of a phone number the Roster and the Intake form use. A
  // second one here would eventually disagree with them, and the way it would fail
  // is that somebody's account becomes unreachable through the front door while the
  // messages still arrive.
  const phone = asPhoneNumber(typed)
  if (!phone) return failed('unreadable-phone')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ phone, password })

  // Deliberately vague: a precise message would tell an outsider which phone
  // numbers belong to a Ministry.
  if (error) return failed('no-such-account')

  // Not to a surface. Which of the two this person reaches is a question about what
  // they hold, and `/` is the one place that asks it -- so an Admin who leads is not
  // sent somewhere on the strength of a guess made before anything was read.
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
