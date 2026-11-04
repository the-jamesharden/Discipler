import { EMAIL_CODE } from '~/domain/launch-terms'
import { offerFor, type CodeRefusal } from '~/domain/offers'
import type { SignUpStanding } from '~/domain/sign-up-attempt'

/**
 * Where sign-up's pages are and what passes between them (Exponential launch, tickets
 * 15 and 16). Nothing here touches a server or a browser, so the pages and their forms
 * read the same answers and a test can read them too.
 *
 * Each step has its own address, because a reload, the back button and a tab left open
 * all have to land on the right page: the attempt's standing decides the page, and the
 * address only asks.
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
 * redirects with. `claimed` says the offer screen has been closed in this tab (ticket 20),
 * because the address is what a tab keeps across a reload and "Use a different email". The
 * server reads it, so a reload paints no offer screen before it knows better.
 */
const CARRIED_NAMES = ['code', 'ref', 'claimed'] as const

/** Anything else cannot be a code, and is not repeated back into a link. */
const CAN_BE_CARRIED = /^[A-Za-z0-9_-]{1,64}$/

/** One carried value, or null when it is missing or cannot be a code. */
export const carriedValue = (given: string | string[] | undefined): string | null => {
  const value = Array.isArray(given) ? given[0] : given
  return value && CAN_BE_CARRIED.test(value) ? value : null
}

/** The query an address carries on, such as `code=EXPO26`, or nothing. */
export const carriedFrom = (params: Record<string, string | string[] | undefined>): string => {
  const carried = new URLSearchParams()
  for (const name of CARRIED_NAMES) {
    const value = carriedValue(params[name])
    if (value) carried.set(name, value)
  }
  return carried.toString()
}

/** What was carried, with one value more or changed, in the order it is always carried. */
export const carrying = (carried: string, name: (typeof CARRIED_NAMES)[number], value: string): string => {
  const params = Object.fromEntries(new URLSearchParams(carried))
  return carriedFrom({ ...params, [name]: value })
}

/**
 * A step's address, with what was carried. `again` is page one for somebody who has an
 * attempt already and wants another address on a new one, which has to pass the check
 * again (ticket 11); without it page one would send them back where they stand. `sent`
 * is the code page on arrival from "Continue", which is what opens its popup, and the
 * page takes it back out of the address so a reload does not open it again (ticket 20).
 */
export const signUpHref = (step: SignUpStep, carried: string, { again = false, sent = false } = {}): string => {
  const query = [again ? 'again=1' : '', carried, sent ? 'sent=1' : ''].filter(Boolean).join('&')
  return query ? `${PATHS[step]}?${query}` : PATHS[step]
}

/** What the email and phone page opens with, from what the address carried (ticket 20). */
export interface EmailPageArrival {
  /** The offer is over the whole screen. */
  readonly offerScreen: boolean
  /** "You were invited by another church". Only the offer shows when a church holds both. */
  readonly invited: boolean
  /** Why the carried code does not apply. Sign-up carries on at the normal price. */
  readonly codeRefusal: CodeRefusal | null
  /** "Have a code?", which James drew only for somebody who arrived with no code. */
  readonly canTypeACode: boolean
}

export const emailPageArrival = ({
  code,
  claimed,
  refIsLive,
  at,
}: {
  readonly code: string | null
  readonly claimed: boolean
  readonly refIsLive: boolean
  readonly at: Date
}): EmailPageArrival => {
  const { offer, codeRefusal } = offerFor({ code: code ?? '', invited: refIsLive, at })
  return {
    offerScreen: offer === 'exponential' && !claimed,
    invited: offer === 'referral',
    codeRefusal,
    canTypeACode: code === null,
  }
}

/** A step to move to, in place of saying a refusal on the page. */
export interface NextStep {
  readonly step: SignUpStep
  readonly again?: boolean
}

/**
 * The refusals to the email page's "Continue" that mean another page. Too soon is the second of
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

/** The refusals to the code page's "Continue" and "Send a new code" that mean another page. */
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
 * The refusals to "Start free trial" that mean another page. An attempt with no live
 * proof is page one, whatever was typed here, and it cannot keep it.
 */
export const stepAfterOpenRefusal = (refusal: string | null): NextStep | null =>
  refusal === 'signup.not_verified' ? { step: 'human_check', again: true } : null

/**
 * Whether **Start free trial** is on (ticket 17): every required field holds a real
 * entry. It is a courtesy, and `readAccountForm` is the rule, so a name of nothing but
 * spaces and a password that is merely common are for the server to say. The shortest
 * password is handed in because the list that lives beside it has no place in a browser.
 */
export const canStartFreeTrial = (
  fields: {
    readonly churchName: string
    readonly fullName: string
    readonly password: string
    readonly agreedToTerms: boolean
    /** The application's four required answers while "Yes, we are" is chosen (ticket 19). */
    readonly plant?: {
      readonly launchDate: string
      readonly sendingChurch: string
      readonly averageAttendance: string
      readonly leadPastor: string
    } | null
  },
  shortestPassword: number,
): boolean =>
  fields.churchName.trim() !== '' &&
  fields.fullName.trim() !== '' &&
  fields.password.length >= shortestPassword &&
  fields.agreedToTerms &&
  Object.values(fields.plant ?? {}).every((answer) => answer.trim() !== '')

/**
 * What the code box holds, from whatever was typed or pasted: "482 913", "482-913" or
 * a whole line from the email. The box has no `maxLength`, which would cut "482 913"
 * short before this saw it.
 */
export const digitsOfCode = (typed: string): string => typed.replace(/\D/g, '').slice(0, EMAIL_CODE.digits)

/** A wait as a clock shows it, `0:42`. */
export const countdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
