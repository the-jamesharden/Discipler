import { emailBody, EmailField, emailSubject, type EmailAddress, type EmailBody, type EmailSubject } from './email'
import { EMAIL_CODE } from './launch-terms'
import type { PhoneNumber } from './roster'
import type { Branded } from './branded'

/**
 * One person's way through sign-up's first three steps, before there is an account
 * or a Ministry (Exponential launch, ticket 11): they pass the human check, are
 * sent a 6-digit code at the address they gave, and prove the address with it.
 *
 * What lives here is what those steps decide. Where a row is kept is
 * `PendingSignups`, what a code is sealed with is `SignUpCodeKeeper`, and what a
 * page says about any of it is the page's own.
 *
 * **Spending a human check.** A pass opens one attempt, and an attempt names one
 * address for good. So one pass of the check buys emails to one inbox and no
 * other, and asking for another address goes back through the check. A resend needs
 * no fresh check, because it can only reach the address the pass was spent on.
 */

/** Thrown where a code would be sealed or judged and the server has no secret. */
export class SignUpCodeSecretMissing extends Error {
  constructor() {
    super('SIGN_UP_CODE_SECRET is not set or is too short. Discipler refuses to make sign-up codes.')
    this.name = 'SignUpCodeSecretMissing'
  }
}

/**
 * How long a passed human check is good for before a code is asked for. Long enough
 * to type an email and a phone at a conference booth; short enough that a pass
 * cannot be saved up.
 */
export const HUMAN_PASS_LIFETIME_MINUTES = 30

/**
 * How long a proven address stays proven while "Set up your account" is filled in.
 * After that the person starts again, so a page left open overnight opens no church.
 */
export const VERIFIED_LIFETIME_MINUTES = 60

/** A row is swept this long after it began, along with the caps' own rows. */
export const PENDING_SIGNUP_KEPT_HOURS = 24

/**
 * What a Turnstile token must have been issued for, one per place it is spent, so
 * a token from the first check cannot be replayed as the one before the church
 * opens. The widget on each page names the same word.
 */
export const HUMAN_CHECK_ACTIONS = {
  startSignUp: 'signup_start',
  openChurch: 'signup_open',
  /** The support form, for somebody who is not signed in (ticket 25). */
  contactSupport: 'support_contact',
  /** "Send me the link", for a forgotten password (ticket 22). */
  forgotPassword: 'forgot_password',
} as const

export type HumanCheckAction = (typeof HUMAN_CHECK_ACTIONS)[keyof typeof HUMAN_CHECK_ACTIONS]

/** The random ID in the visitor's cookie: 256 bits, base64url. */
export type SignUpAttemptToken = Branded<string, 'SignUpAttemptToken'>

/** What came back in a cookie, or null when it cannot be an attempt. */
export const readAttemptToken = (raw: string | null | undefined): SignUpAttemptToken | null =>
  typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw) ? (raw as SignUpAttemptToken) : null

/** Six digits, as typed with the spacing taken out. */
export type SignUpCode = Branded<string, 'SignUpCode'>

/**
 * A code as typed, or null when it cannot be one, so a slip -- five digits, a
 * letter -- is told at once and is not spent as one of the five tries.
 */
export const readSignUpCode = (raw: string): SignUpCode | null => {
  const code = raw.replace(/[\s-]/g, '')
  return new RegExp(`^\\d{${EMAIL_CODE.digits}}$`).test(code) ? (code as SignUpCode) : null
}

/**
 * The one spelling of an address for counting and for finding an account. Supabase
 * Auth keeps an address in lower case, so `Pastor@Grace.org` and `pastor@grace.org`
 * are one person's inbox; the address as typed is what the email is sent to.
 */
export const emailKeyOf = (email: EmailAddress): string => email.toLowerCase()

/** One attempt, as `PendingSignups` keeps it. */
export interface PendingSignup {
  readonly id: string
  readonly humanPassedAt: Date
  readonly email: EmailAddress | null
  readonly phone: PhoneNumber | null
  /**
   * When "Email me a code" was pressed for this phone, which is the time of the Admin's
   * consent. A resend keeps it, because the agreement was the press, and another phone
   * moves it, because the agreement was for that number. Null exactly when `phone` is.
   */
  readonly agreedAt: Date | null
  /**
   * The current code, sealed. Null before a code, after one is used, and for an
   * address that already has an account: no code exists for that attempt, so none
   * can match, and everything else about it reads the same as a real one.
   */
  readonly codeDigest: string | null
  /** When the latest email went. Null until one has, and again if it failed. */
  readonly codeSentAt: Date | null
  /** Wrong tries at the current code. */
  readonly codeTries: number
  readonly verifiedAt: Date | null
  readonly spentAt: Date | null
}

/** Where an attempt stands at a moment, which is what each page and step asks. */
export type SignUpStanding =
  /** No live attempt, or its pass or proof has lapsed: page one. */
  | { readonly step: 'human_check' }
  /** Passed, and no email has gone. `email` is what was tried, after a failed send. */
  | { readonly step: 'email_and_phone'; readonly email: EmailAddress | null }
  /** An email has gone, so the code page. Reads alike whether or not it held a code. */
  | {
      readonly step: 'code'
      readonly email: EmailAddress
      readonly code: 'live' | 'expired' | 'tries_used'
      readonly triesLeft: number
      readonly resendInSeconds: number
    }
  /** The address is proven: "Set up your account". */
  | { readonly step: 'account'; readonly email: EmailAddress; readonly phone: PhoneNumber }

const minutes = (count: number) => count * 60_000

export const standingOf = (pending: PendingSignup | null, now: Date): SignUpStanding => {
  if (!pending || pending.spentAt) return { step: 'human_check' }
  const at = now.getTime()

  if (pending.verifiedAt) {
    const lapsed = at >= pending.verifiedAt.getTime() + minutes(VERIFIED_LIFETIME_MINUTES)
    return lapsed ? { step: 'human_check' } : { step: 'account', email: pending.email!, phone: pending.phone! }
  }

  if (!pending.codeSentAt) {
    const lapsed = at >= pending.humanPassedAt.getTime() + minutes(HUMAN_PASS_LIFETIME_MINUTES)
    return lapsed ? { step: 'human_check' } : { step: 'email_and_phone', email: pending.email }
  }

  const sentAt = pending.codeSentAt.getTime()
  const triesLeft = Math.max(EMAIL_CODE.tries - pending.codeTries, 0)
  return {
    step: 'code',
    email: pending.email!,
    code:
      triesLeft === 0
        ? 'tries_used'
        : at >= sentAt + minutes(EMAIL_CODE.lifetimeMinutes)
          ? 'expired'
          : 'live',
    triesLeft,
    resendInSeconds: Math.max(Math.ceil((sentAt + EMAIL_CODE.resendAfterSeconds * 1000 - at) / 1000), 0),
  }
}

/** Emails inside the last hour, to this address and from this network. */
export interface RecentSends {
  readonly forEmail: number
  readonly forNetwork: number
}

/** How far back the caps count. */
export const SEND_CAP_WINDOW_MINUTES = 60

/**
 * Whether one more email may go. A notice counts exactly as a code does, so the
 * cap is reached the same way whether or not the address has an account, and an
 * owner cannot be flooded with notices.
 */
export const sendAllowed = ({ forEmail, forNetwork }: RecentSends): boolean =>
  forEmail < EMAIL_CODE.perEmailPerHour && forNetwork < EMAIL_CODE.perNetworkPerHour

/** An email's subject and body, ready for the one sender. */
export interface SignUpMessage {
  readonly subject: EmailSubject
  readonly body: EmailBody
}

/**
 * The email carrying a code. The code is in the body and not the subject, so it is
 * not on a locked phone's screen for whoever is standing near it.
 *
 * Drafted here: the spec gives no wording, and James approves it in mock-up 1.
 */
export const codeEmail = (code: string): SignUpMessage => ({
  subject: emailSubject`Your Discipler code`,
  body: emailBody`Here is your code to finish creating your Discipler account:

${EmailField.code(code)}

It works for ${EmailField.line(String(EMAIL_CODE.lifetimeMinutes))} minutes. Please enter it on the page you came from.

If you didn't ask for this, you can ignore this email. Nobody can use your address without this code.
`,
})

/**
 * What the owner of an existing account is sent instead of a code (spec, Security,
 * protection 8). No link, so a stranger's typing cannot make Discipler send somebody
 * a button to press.
 *
 * Drafted here: the spec gives only "someone tried to sign up with your email", and
 * James approves the rest in mock-up 1.
 */
export const signUpAttemptNotice = (): SignUpMessage => ({
  subject: emailSubject`Someone tried to sign up with your email`,
  body: emailBody`Someone just tried to create a new Discipler account with this email address, which already has an account.

No code was sent, and nothing about your account has changed.

If this was you, you already have an account, so you can just sign in. If it wasn't you, you can ignore this email.

If anything looks wrong, please reply to this email and we'll help. Thank you!
`,
})
