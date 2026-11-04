import { deploymentOf, type Environment } from './deployment'

/**
 * Whether sign-up is open on this deployment (Exponential launch, spec Q30): off
 * until James has published the privacy policy and terms.
 *
 * `SIGN_UP_OPEN=true` and nothing else opens it, so an unset variable, a typo and a
 * forgotten dashboard all leave it shut. Every sign-up route and page answers 404
 * while it is shut.
 *
 * A Vercel Preview is never open, whatever it says: Preview shares production's
 * database, so an open one would run real sign-ups on an address nobody meant to
 * publish. Production and staging obey the variable, and so does a developer's
 * machine.
 */
export const signUpIsOpen = (env: Environment): boolean => {
  if (env.SIGN_UP_OPEN !== 'true') return false
  return !env.VERCEL || deploymentOf(env) !== 'other'
}
