import type { Clock } from '~/domain/clock'
import { asEmailAddress, type EmailAddress } from '~/domain/email'
import { EMAIL_CODE } from '~/domain/launch-terms'
import { isUsPhone } from '~/domain/phone-check'
import { asPhoneNumber, type PhoneNumber } from '~/domain/roster'
import {
  codeEmail,
  emailKeyOf,
  HUMAN_CHECK_ACTIONS,
  readAttemptToken,
  readSignUpCode,
  SEND_CAP_WINDOW_MINUTES,
  sendAllowed,
  signUpAttemptNotice,
  SignUpCodeSecretMissing,
  standingOf,
  type SignUpAttemptToken,
  type SignUpStanding,
} from '~/domain/sign-up-attempt'
import { whyNotSent } from './email-sender'
import type { EmailSender, HumanCheck, PendingSignups, SignUpCodeKeeper } from './ports'

/**
 * The server side of sign-up's first three steps: the human check, the email code
 * and proving the address (Exponential launch, ticket 11). The pages are tickets 15
 * and 16, and "Set up your account" is ticket 17; the routes under `app/signup/` and
 * `readyToOpen` below are what they call.
 *
 * **The two answers to "send me a code" are one answer.** Whether or not the address
 * has an account, the same steps run in the same order, a code is made and sealed,
 * one email goes through the same sender, and the caller gets the same value back.
 * The only difference is which email it is. An address with an account has no code
 * kept for it, so its attempt can never be proven, and from then on it reads the
 * same as any other: the same tries left, the same expiry, the same resend.
 *
 * **Nothing logs a code.** A code exists in this file between being made and being
 * handed to the sender, and what is logged around it is an attempt's row ID and the
 * vendor's status: never the error's message, which is the vendor's own words about
 * a request that held the code, and never an address, a phone or a token.
 *
 * Every refusal is a code; the screen owns the sentences.
 */

export type SignUpRefusal =
  /** Cloudflare did not pass the token, or a secret is unset. */
  | 'signup.not_human'
  /** No live attempt, or this attempt's pass was spent on another address: page one. */
  | 'signup.human_check_needed'
  | 'signup.bad_email'
  | 'signup.bad_phone'
  /** A real phone number, outside the United States. */
  | 'signup.phone_not_us'
  /** A code went less than a minute ago. */
  | 'signup.resend_too_soon'
  /** The hourly cap on this address or this network. */
  | 'signup.too_many_codes'
  /** The email did not go. Nothing is waiting, so asking again is right. */
  | 'signup.not_sent'
  /** What was typed is not six digits. No try is spent. */
  | 'signup.malformed_code'
  /** Nothing has been sent to check against. */
  | 'signup.no_code'
  | 'signup.code_expired'
  /** The code did not match, with tries still left. */
  | 'signup.wrong_code'
  /** Five wrong tries, so this code is dead, even if the right one is typed now. */
  | 'signup.too_many_tries'
  /** This address is already proven: the code is used, and `standing` says go on. */
  | 'signup.already_verified'
  /** The server could not judge the code. No try is spent. */
  | 'signup.not_checked'
  /** Ticket 17 asked to open a church on an attempt that has not proven an address. */
  | 'signup.not_verified'

export type HumanCheckPassing =
  | { readonly attempt: SignUpAttemptToken }
  | { readonly refusal: Extract<SignUpRefusal, 'signup.not_human'> }

export type CodeSending =
  | { readonly sent: EmailAddress; readonly resendInSeconds: number }
  | { readonly refusal: 'signup.resend_too_soon'; readonly resendInSeconds: number }
  | {
      readonly refusal: Extract<
        SignUpRefusal,
        | 'signup.human_check_needed'
        | 'signup.bad_email'
        | 'signup.bad_phone'
        | 'signup.phone_not_us'
        | 'signup.too_many_codes'
        | 'signup.not_sent'
        | 'signup.no_code'
        | 'signup.already_verified'
      >
    }

export type CodeConfirming =
  | { readonly verified: EmailAddress }
  | { readonly refusal: 'signup.wrong_code'; readonly triesLeft: number }
  | {
      readonly refusal: Extract<
        SignUpRefusal,
        | 'signup.human_check_needed'
        | 'signup.malformed_code'
        | 'signup.no_code'
        | 'signup.code_expired'
        | 'signup.too_many_tries'
        | 'signup.already_verified'
        | 'signup.not_checked'
      >
    }

export type OpeningReadiness =
  | { readonly ready: ProvenSignUp }
  | { readonly refusal: Extract<SignUpRefusal, 'signup.not_verified' | 'signup.not_human'> }

/** What ticket 17 opens a church with. `pendingSignupId` is what it spends. */
export interface ProvenSignUp {
  readonly pendingSignupId: string
  readonly email: EmailAddress
  readonly phone: PhoneNumber
  /** When "Email me a code" was pressed for this phone: the time of the consent. */
  readonly agreedAt: Date
}

export interface SignUp {
  /** Page one: spends a Turnstile token, and starts an attempt if it passes. */
  passHumanCheck(humanToken: string): Promise<HumanCheckPassing>
  /** Page two's "Email me a code", with what was typed. */
  sendCode(request: {
    readonly attempt: string | null | undefined
    readonly email: string
    readonly phone: string
    readonly network: string | null
  }): Promise<CodeSending>
  /** The code page's "Send a new code", to the address already on the attempt. */
  resendCode(request: {
    readonly attempt: string | null | undefined
    readonly network: string | null
  }): Promise<CodeSending>
  /** The code page's "Continue", with what was typed. */
  confirmCode(request: {
    readonly attempt: string | null | undefined
    readonly typed: string
  }): Promise<CodeConfirming>
  /** Which page this visitor belongs on, and what it needs to show. */
  standing(attempt: string | null | undefined): Promise<SignUpStanding>
  /** Whether this attempt has opened its church, which `standing` reads as no attempt at all. */
  attemptIsSpent(attempt: string | null | undefined): Promise<boolean>
  /**
   * For ticket 17, before it opens a church: the proven address and the phone, after
   * a second Turnstile token from "Set up your account" has passed. The token is not
   * spent on an attempt that could not go on anyway.
   */
  readyToOpen(request: {
    readonly attempt: string | null | undefined
    readonly humanToken: string
  }): Promise<OpeningReadiness>
}

/** What `issue` has decided to send, once its transaction has committed. */
interface CodeToSend {
  readonly rowId: string
  readonly once: string
  readonly hasAccount: boolean
  readonly code: string
}

export const createSignUp = ({
  signUps,
  humanCheck,
  keeper,
  sender,
  clock,
}: {
  readonly signUps: PendingSignups
  readonly humanCheck: HumanCheck
  readonly keeper: SignUpCodeKeeper
  readonly sender: EmailSender
  readonly clock: Clock
}): SignUp => {
  /**
   * Makes a code and sends the one email, under the locks that hold the caps. The
   * address's own standing decides first, so a refusal costs nothing and counts
   * against nothing.
   */
  const issue = async (
    attempt: SignUpAttemptToken,
    email: EmailAddress,
    phone: PhoneNumber,
    network: string | null,
  ): Promise<CodeSending> => {
    const now = clock.now()

    let decided: Extract<CodeSending, { refusal: unknown }> | CodeToSend
    try {
      decided = await signUps.sending(attempt, email, network, async (unit): Promise<typeof decided> => {
        const standing = standingOf(unit.pending, now)
        if (standing.step === 'human_check' || !unit.pending) {
          return { refusal: 'signup.human_check_needed' }
        }
        if (standing.step === 'account') return { refusal: 'signup.already_verified' }

        const onAttempt = unit.pending.email
        if (onAttempt && emailKeyOf(onAttempt) !== emailKeyOf(email)) {
          return { refusal: 'signup.human_check_needed' }
        }
        if (standing.step === 'code' && standing.resendInSeconds > 0) {
          return { refusal: 'signup.resend_too_soon', resendInSeconds: standing.resendInSeconds }
        }

        const since = new Date(now.getTime() - SEND_CAP_WINDOW_MINUTES * 60_000)
        if (!sendAllowed(await unit.recentSends(since))) return { refusal: 'signup.too_many_codes' }

        const hasAccount = await unit.emailHasAccount()
        const code = keeper.newCode()
        const sealed = keeper.seal(unit.pending.id, code)
        const sendNumber = await unit.issue({ phone, codeDigest: hasAccount ? null : sealed, at: now })
        return { rowId: unit.pending.id, once: `${unit.pending.id}/${sendNumber}`, hasAccount, code }
      })
    } catch (error) {
      if (!(error instanceof SignUpCodeSecretMissing)) throw error
      console.error(error.message)
      return { refusal: 'signup.not_sent' }
    }
    if ('refusal' in decided) return decided

    try {
      await sender.send(
        decided.hasAccount
          ? { kind: 'signUpAttemptNotice', to: email, once: decided.once, ...signUpAttemptNotice() }
          : { kind: 'emailCode', to: email, once: decided.once, ...codeEmail(decided.code) },
      )
    } catch (error) {
      // No wait and no live code are left behind, so asking again works at once. The
      // send still counted: a failing send is the one likeliest to be repeated.
      console.error(`A sign-up email for attempt ${decided.rowId} did not go: ${whyNotSent(error)}`)
      await signUps.codeNotSent(attempt)
      return { refusal: 'signup.not_sent' }
    }

    return { sent: email, resendInSeconds: EMAIL_CODE.resendAfterSeconds }
  }

  return {
    async passHumanCheck(humanToken) {
      if (!(await humanCheck.verify(humanToken, HUMAN_CHECK_ACTIONS.startSignUp))) {
        return { refusal: 'signup.not_human' }
      }
      const attempt = keeper.newAttemptToken()
      await signUps.begin(attempt, clock.now())
      return { attempt }
    },

    async sendCode({ attempt, email: typedEmail, phone: typedPhone, network }) {
      const email = asEmailAddress(typedEmail)
      if (!email) return { refusal: 'signup.bad_email' }
      const phone = asPhoneNumber(typedPhone)
      if (!phone) return { refusal: 'signup.bad_phone' }
      if (!isUsPhone(phone)) return { refusal: 'signup.phone_not_us' }

      const token = readAttemptToken(attempt)
      if (!token) return { refusal: 'signup.human_check_needed' }
      return issue(token, email, phone, network)
    },

    async resendCode({ attempt, network }) {
      const token = readAttemptToken(attempt)
      if (!token) return { refusal: 'signup.human_check_needed' }

      const pending = await signUps.read(token)
      const standing = standingOf(pending, clock.now())
      if (standing.step === 'human_check') return { refusal: 'signup.human_check_needed' }
      if (standing.step === 'account') return { refusal: 'signup.already_verified' }
      if (!pending?.email || !pending.phone) return { refusal: 'signup.no_code' }
      return issue(token, pending.email, pending.phone, network)
    },

    async confirmCode({ attempt, typed }) {
      const token = readAttemptToken(attempt)
      if (!token) return { refusal: 'signup.human_check_needed' }

      const code = readSignUpCode(typed)
      if (!code) return { refusal: 'signup.malformed_code' }

      const now = clock.now()
      return signUps.trying(token, async (unit): Promise<CodeConfirming> => {
        const standing = standingOf(unit.pending, now)
        switch (standing.step) {
          case 'human_check':
            return { refusal: 'signup.human_check_needed' }
          case 'account':
            return { refusal: 'signup.already_verified' }
          case 'email_and_phone':
            return { refusal: 'signup.no_code' }
          case 'code':
            break
        }
        if (standing.code === 'tries_used') return { refusal: 'signup.too_many_tries' }
        if (standing.code === 'expired') return { refusal: 'signup.code_expired' }

        let matched: boolean
        try {
          matched = keeper.matches(unit.pending!.id, code, unit.pending!.codeDigest)
        } catch (error) {
          if (!(error instanceof SignUpCodeSecretMissing)) throw error
          console.error(error.message)
          return { refusal: 'signup.not_checked' }
        }

        if (matched) {
          await unit.markVerified(now)
          return { verified: standing.email }
        }

        await unit.recordWrongTry()
        const triesLeft = standing.triesLeft - 1
        return triesLeft > 0 ? { refusal: 'signup.wrong_code', triesLeft } : { refusal: 'signup.too_many_tries' }
      })
    },

    async standing(attempt) {
      const token = readAttemptToken(attempt)
      return standingOf(token && (await signUps.read(token)), clock.now())
    },

    async attemptIsSpent(attempt) {
      const token = readAttemptToken(attempt)
      const pending = token && (await signUps.read(token))
      return Boolean(pending && pending.spentAt)
    },

    async readyToOpen({ attempt, humanToken }) {
      const token = readAttemptToken(attempt)
      const pending = token && (await signUps.read(token))
      const standing = standingOf(pending, clock.now())
      if (standing.step !== 'account' || !pending) return { refusal: 'signup.not_verified' }

      if (!(await humanCheck.verify(humanToken, HUMAN_CHECK_ACTIONS.openChurch))) {
        return { refusal: 'signup.not_human' }
      }
      return {
        ready: {
          pendingSignupId: pending.id,
          email: standing.email,
          phone: standing.phone,
          agreedAt: pending.agreedAt!,
        },
      }
    },
  }
}
