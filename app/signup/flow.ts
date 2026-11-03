import { EMAIL_CODE } from '~/domain/launch-terms'
import type { SignUpStanding } from '~/domain/sign-up-attempt'

/**
 * Where sign-up's pages are and what passes between them (Exponential launch, tickets
 * 15 and 16). Nothing here touches a server or a browser, so the pages and their forms
 * read the same answers and a test can read them too.
 *
 * Each step has its own address, because a reload, the back button and a tab left open
 * all have to land on the right page: the attempt's standing decides the page, and the
 * address only asks. Ticket 17 fills `/signup/account`.
 */

export type SignUpStep = SignUpStanding['step']

const PATHS: Record<SignUpStep, string> = {
  human_check: '/signup',
  email_and_phone: '/signup/email',
  code: '/signup/code',
  account: '/signup/account',
}

/**
 * What the address carries through the flow, in the address and never a cookie (ticket
 * 15): `code` is the mock-up's `/signup?code=EXPO26`, and `ref` is what `/r/<code>`
 * redirects with. Nothing here reads them; tickets 17 and 20 do, from the address of
 * the page they are on.
 */
const CARRIED_NAMES = ['code', 'ref'] as const

/** Anything else cannot be a code, and is not repeated back into a link. */
const CAN_BE_CARRIED = /^[A-Za-z0-9_-]{1,64}$/

/** The query an address carries on, such as `code=EXPO26`, or nothing. */
export const carriedFrom = (params: Record<string, string | string[] | undefined>): string => {
  const carried = new URLSearchParams()
  for (const name of CARRIED_NAMES) {
    const given = params[name]
    const value = Array.isArray(given) ? given[0] : given
    if (value && CAN_BE_CARRIED.test(value)) carried.set(name, value)
  }
  return carried.toString()
}

/**
 * A step's address, with what was carried. `again` is page one for somebody who has an
 * attempt already and wants another address on a new one, which has to pass the check
 * again (ticket 11); without it page one would send them back where they stand.
 */
export const signUpHref = (step: SignUpStep, carried: string, { again = false } = {}): string => {
  const query = [again ? 'again=1' : '', carried].filter(Boolean).join('&')
  return query ? `${PATHS[step]}?${query}` : PATHS[step]
}

/** A step to move to, in place of saying a refusal on the page. */
export interface NextStep {
  readonly step: SignUpStep
  readonly again?: boolean
}

/**
 * The refusals to "Email me a code" that mean another page. Too soon is the second of
 * a double click, or the back button, and the code is already on its way, so the code
 * page is right. Another address on the attempt, or a pass that lapsed, is page one.
 */
export const stepAfterSendRefusal = (refusal: string | null): NextStep | null => {
  switch (refusal) {
    case 'signup.human_check_needed':
      return { step: 'human_check', again: true }
    case 'signup.resend_too_soon':
      return { step: 'code' }
    case 'signup.already_verified':
      return { step: 'account' }
    default:
      return null
  }
}

/** The refusals to "Continue" and "Send a new code" that mean another page. */
export const stepAfterCodeRefusal = (refusal: string | null): NextStep | null => {
  switch (refusal) {
    case 'signup.human_check_needed':
      return { step: 'human_check', again: true }
    case 'signup.already_verified':
      return { step: 'account' }
    default:
      return null
  }
}

/**
 * What the code box holds, from whatever was typed or pasted: "482 913", "482-913" or
 * a whole line from the email. The box has no `maxLength`, which would cut "482 913"
 * short before this saw it.
 */
export const digitsOfCode = (typed: string): string => typed.replace(/\D/g, '').slice(0, EMAIL_CODE.digits)

/** A wait as a clock shows it, `0:42`. */
export const countdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
