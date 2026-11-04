import { NextResponse, type NextRequest } from 'next/server'
import { PASSWORD_REFUSALS } from '../../invitation/copy'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getOpeningAChurch } from '~/service/container'
import type { OpeningRefusal } from '~/service/opening-a-church'
import { fieldOf, formOf, whileSignUpIsShut } from '../answer'
import { attemptFrom, clearAttemptCookie } from '../attempt-cookie'
import { OPENING_REFUSALS } from '../copy'
import { carriedValue } from '../flow'

export const dynamic = 'force-dynamic'

const STATUS: Record<OpeningRefusal, number> = {
  'signup.church_name_needed': 422,
  'signup.full_name_needed': 422,
  'signup.bad_timezone': 422,
  'signup.bad_cycle': 422,
  'signup.terms_needed': 422,
  'account.password_too_short': 422,
  'account.password_too_long': 422,
  'account.password_too_common': 422,
  'account.already_exists': 409,
  'signup.not_human': 403,
  'signup.not_verified': 409,
  'signup.not_opened': 502,
}

const SENTENCE: Record<OpeningRefusal, string> = { ...OPENING_REFUSALS, ...PASSWORD_REFUSALS }

/**
 * **Start free trial** on "Set up your account" (Exponential launch, ticket 17). Takes
 * the page's fields and a fresh Turnstile token, `humanToken`, and the attempt from its
 * cookie. The email and the phone are the attempt's, and neither is read from here.
 *
 * Answers `{ next }`, the address to go to: the payment step with the Admin signed in,
 * or `/` when this attempt has already opened a church. A refusal is `{ refusal, message }`
 * and never anything provisioning said.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const form = await formOf(request)
  const outcome = await getOpeningAChurch().open({
    attempt: attemptFrom(request),
    humanToken: fieldOf(form, 'humanToken'),
    churchName: fieldOf(form, 'churchName'),
    fullName: fieldOf(form, 'fullName'),
    heardFrom: fieldOf(form, 'heardFrom'),
    password: fieldOf(form, 'password'),
    timezone: fieldOf(form, 'timezone'),
    cycle: fieldOf(form, 'cycle'),
    agreedToTerms: fieldOf(form, 'agreedToTerms') === 'yes',
    carriedCode: carriedValue(fieldOf(form, 'code')),
  })

  if ('refusal' in outcome) {
    const { refusal } = outcome
    return NextResponse.json({ refusal, message: SENTENCE[refusal] }, { status: STATUS[refusal] })
  }
  if ('alreadyOpened' in outcome) return NextResponse.json({ next: '/' })

  const { phone, password } = outcome.opened
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ phone, password })

  // The church is open and nothing can be gained by saying otherwise, so a sign-in that
  // failed sends them to sign in by hand, and the sign-in page has the way back.
  if (error) console.error(`Signing in a new church's Admin failed: ${error.name}`)
  const response = NextResponse.json({ next: error ? '/login' : '/signup/payment' })
  clearAttemptCookie(response)
  return response
}
