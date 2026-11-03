import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { SignUpStanding } from '~/domain/sign-up-attempt'
import { signUpIsOpen } from '~/platform/sign-up-switch'
import { getSignUp } from '~/service/container'
import { SIGN_UP_ATTEMPT_COOKIE } from './attempt-cookie'
import { signUpHref, type SignUpStep } from './flow'

/**
 * What every sign-up page asks first (Exponential launch, tickets 15 and 16).
 *
 * While sign-up is shut (`SIGN_UP_OPEN`, spec Q30) a page is a 404, as though it were
 * not there, and the database is not asked. The routes beside these pages answer the
 * same through `whileSignUpIsShut`.
 */
export const holdWhileSignUpIsShut = (): void => {
  if (!signUpIsOpen(process.env)) notFound()
}

/**
 * The attempt's standing, if this is the page it belongs on, and otherwise a redirect
 * to the page it does. A reload, the back button and an old tab all land right this
 * way, and nobody reaches the code page without an email having gone.
 */
export const standingOnPage = async <Step extends SignUpStep>(
  page: Step,
  carried: string,
): Promise<Extract<SignUpStanding, { step: Step }>> => {
  holdWhileSignUpIsShut()

  const attempt = (await cookies()).get(SIGN_UP_ATTEMPT_COOKIE)?.value
  const standing = await getSignUp().standing(attempt)
  if (standing.step !== page) redirect(signUpHref(standing.step, carried))
  return standing as Extract<SignUpStanding, { step: Step }>
}
