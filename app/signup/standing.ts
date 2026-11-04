import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { SignUpStanding } from '~/domain/sign-up-attempt'
import { signUpIsOpen } from '~/platform/sign-up-switch'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getChurchSignups, getSignUp } from '~/service/container'
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
 * A page's `generateMetadata`. The title goes in the head of whatever is rendered, the
 * 404 included, so a fixed `metadata` would tell anybody that sign-up exists.
 */
export const titleWhileOpen = (title: string) => (): Metadata =>
  signUpIsOpen(process.env) ? { title } : {}

/**
 * Whether this is an Admin who has already opened their church and come back to sign-up:
 * by the back button, with the attempt's cookie gone once it was spent, or by a tab
 * still holding a spent one (Exponential launch, ticket 18). They have nothing to do
 * here, and `/` knows where they belong. Anyone else is starting a sign-up of their own.
 */
const hasAlreadyOpenedAChurch = async (attempt: string | undefined): Promise<boolean> => {
  const resolution = await resolveAdmin()
  if (resolution.status !== 'admin') return false
  if (await getSignUp().attemptIsSpent(attempt)) return true
  return (await getChurchSignups().of(resolution.admin.ministryId)) !== null
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
  if (standing.step === 'human_check' && (await hasAlreadyOpenedAChurch(attempt))) redirect('/')
  if (standing.step !== page) redirect(signUpHref(standing.step, carried))
  return standing as Extract<SignUpStanding, { step: Step }>
}
