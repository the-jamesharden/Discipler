import { NextResponse, type NextRequest } from 'next/server'
import { readSignInEntry } from '~/domain/accounts'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getSignInLimit } from '~/service/container'
import type { SignInFailure } from '../../login/failures'
import { networkOf } from '../network'

/**
 * Sign-in as an ordinary form POST rather than a client-side call, so it works
 * before JavaScript has loaded and on a phone with a poor connection. The session
 * cookie is set on the response by the Supabase client.
 *
 * One box for who they are, and a password. An Admin who signed up with an email may
 * type either, and everybody else types their phone. See
 * `docs/adr/0030-an-admin-signs-in-with-email-or-phone.md`, and ADR-0008 for everybody
 * without an email.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const typed = String(form.get('login') ?? '').trim()
  const password = String(form.get('password') ?? '')

  // A code rather than the message itself: the sign-in page owns the wording, and
  // nothing a stranger puts in the query string can be rendered in the app's own
  // error styling.
  const failed = (reason: SignInFailure) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url), { status: 303 })

  if (!typed || !password) return failed('missing-credentials')

  // A phone goes through the same reading the Roster and the Intake form use. A
  // second one here would eventually disagree with them, and the way it would fail
  // is that somebody's account becomes unreachable through the front door while the
  // messages still arrive.
  const account = readSignInEntry(typed)
  if (!account) return failed('unreadable-phone')

  // The guessing limit, before Supabase Auth is asked anything (Exponential
  // launch, ticket 13). Supabase's own limit counts the address that calls it,
  // which is this function's and not the person's, so it holds nobody back on
  // their own. Counted against the number as read, so `(555) 010-0000` and
  // `+15550100000` are one account, against the phone of whoever holds an email, so
  // the two ways in share one count, and against the network Vercel saw.
  //
  // The same refusal whether or not anybody holds what was typed: a failure against
  // an entry nobody holds is counted exactly like one against an entry somebody
  // does, so the limit is reached the same way for both.
  const attempt = await getSignInLimit().attempt(account, networkOf(request.headers))
  if (!attempt) return failed('too-many-attempts')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth
    .signInWithPassword({ ...account, password })
    .catch(async (thrown: unknown) => {
      await attempt.notAFailure()
      throw thrown
    })

  // Only a wrong password is a guess. Anything else -- Supabase rate limiting this
  // address, or not answering -- tested no password, and counting it would lock a
  // person out for an outage that was not theirs.
  if (!error || error.code !== 'invalid_credentials') await attempt.notAFailure()

  // Deliberately vague: a precise message would tell an outsider which emails and
  // phone numbers belong to a Ministry.
  if (error) return failed('no-such-account')

  // Not to a surface. Which of the two this person reaches is a question about what
  // they hold, and `/` is the one place that asks it -- so an Admin who leads is not
  // sent somewhere on the strength of a guess made before anything was read.
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
