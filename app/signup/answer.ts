import { NextResponse, type NextRequest } from 'next/server'
import { signUpIsOpen } from '~/platform/sign-up-switch'
import type { CodeSending, SignUpRefusal } from '~/service/sign-up'
import { signUpRefusalMessage } from './copy'

/**
 * How sign-up's routes answer, and the switch they stand behind (Exponential launch,
 * ticket 11). Always JSON: they are called with `fetch` by pages (tickets 15 and 16)
 * that stay on screen whatever comes back, as the phone-check routes are by the test
 * check-in's card.
 *
 * A refusal carries its code, for the page to act on, and its sentence, for the page
 * to show. The status says which kind of no it is.
 */

type Answerable = Exclude<SignUpRefusal, 'signup.not_verified'>

const STATUS: Record<Answerable, number> = {
  'signup.not_human': 403,
  'signup.human_check_needed': 409,
  'signup.bad_email': 422,
  'signup.bad_phone': 422,
  'signup.phone_not_us': 422,
  'signup.resend_too_soon': 429,
  'signup.too_many_codes': 429,
  'signup.not_sent': 502,
  'signup.malformed_code': 422,
  'signup.no_code': 409,
  'signup.code_expired': 409,
  'signup.wrong_code': 422,
  'signup.too_many_tries': 409,
  'signup.already_verified': 409,
  'signup.not_checked': 502,
}

export const refused = (refusal: Answerable, extra: { triesLeft?: number; resendInSeconds?: number } = {}) =>
  NextResponse.json(
    { refusal, message: signUpRefusalMessage(refusal, extra.triesLeft), ...extra },
    { status: STATUS[refusal] },
  )

/** A 404 while sign-up is shut, as though the route were not there. */
export const whileSignUpIsShut = (): NextResponse | null =>
  signUpIsOpen(process.env) ? null : new NextResponse(null, { status: 404 })

/** What the email page's "Continue" and "Send a new code" both answer. */
export const answerSending = (outcome: CodeSending) => {
  if ('sent' in outcome) {
    return NextResponse.json({ sent: true, email: outcome.sent, resendInSeconds: outcome.resendInSeconds })
  }
  return outcome.refusal === 'signup.resend_too_soon'
    ? refused(outcome.refusal, { resendInSeconds: outcome.resendInSeconds })
    : refused(outcome.refusal)
}

/** A form field as a string, and an empty one when it is missing or a file. */
export const fieldOf = (form: FormData | null, name: string): string => {
  const value = form?.get(name)
  return typeof value === 'string' ? value : ''
}

export const formOf = (request: NextRequest): Promise<FormData | null> =>
  request.formData().catch(() => null)
