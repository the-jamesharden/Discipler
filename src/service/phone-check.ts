import type { Clock } from '~/domain/clock'
import type { MinistryId } from '~/domain/ids'
import {
  attemptStanding,
  CODE_REQUEST_LOOKBACK_MINUTES,
  codeRequestAllowed,
  isUsPhone,
  readPhoneCode,
  type PhoneCheckAttempt,
} from '~/domain/phone-check'
import type { PhoneNumber } from '~/domain/roster'
import type { PhoneChecks, PhoneVerifier } from './ports'

/**
 * Checking an Admin's own phone with a texted code (Exponential launch, ticket 09),
 * for the test check-in to call before it texts that phone for the first time.
 *
 * The phone is always the one on the Admin's own Roster row, read here from the
 * session's account and never taken from a browser: a phone a request could name
 * would make this a way to text codes to anybody.
 *
 * Twilio is asked only after Discipler has decided the question is worth asking:
 * a number outside the US, a code limit reached, a code that is not six digits, an
 * attempt that is over -- each is answered here without a request. Every
 * refusal is a code; the screen owns the sentences.
 */

/** Who is asking. Both from the session. */
export interface PhoneCheckAdmin {
  readonly userId: string
  readonly ministryId: MinistryId
}

export type PhoneCheckRefusal =
  /** No row on the Admin's own Roster, so no phone to check. */
  | 'phone_check.no_phone'
  /** The phone is not a US number, and the Verify service sends only to those. */
  | 'phone_check.not_us'
  /** Too many codes asked for, by this Admin or to this phone. */
  | 'phone_check.too_many_codes'
  /** Twilio did not send the code. */
  | 'phone_check.not_sent'
  /** What was typed is not six digits. No try is spent. */
  | 'phone_check.malformed_code'
  /** No code has been sent to check against. */
  | 'phone_check.no_code'
  /** The code has stopped working; a new one is needed. */
  | 'phone_check.code_expired'
  /** The code did not match, with tries still left. */
  | 'phone_check.wrong_code'
  /** Five codes were tried and none matched; a new one is needed. */
  | 'phone_check.attempt_ended'
  /** Twilio could not judge the code. The try is given back. */
  | 'phone_check.not_checked'

export interface PhoneCheckStatus {
  /** The phone a test check-in would text, or null where the Admin has no Roster row. */
  readonly phone: PhoneNumber | null
  readonly verified: boolean
}

export type CodeSending =
  | { readonly sent: PhoneNumber }
  /** Already verified, so nothing was sent and nothing needs typing. */
  | { readonly verified: PhoneNumber }
  | {
      readonly refusal: Extract<
        PhoneCheckRefusal,
        'phone_check.no_phone' | 'phone_check.not_us' | 'phone_check.too_many_codes' | 'phone_check.not_sent'
      >
    }

export type CodeChecking =
  | { readonly verified: PhoneNumber }
  | { readonly refusal: 'phone_check.wrong_code'; readonly triesLeft: number }
  | {
      readonly refusal: Exclude<
        PhoneCheckRefusal,
        | 'phone_check.wrong_code'
        | 'phone_check.not_us'
        | 'phone_check.too_many_codes'
        | 'phone_check.not_sent'
      >
    }

export interface PhoneCheck {
  /** Which phone, and whether the Admin has verified it. */
  status(admin: PhoneCheckAdmin): Promise<PhoneCheckStatus>
  /** Texts a code, or resends one while the attempt is still open. */
  sendCode(admin: PhoneCheckAdmin): Promise<CodeSending>
  /** Checks a code as the Admin typed it. */
  confirmCode(admin: PhoneCheckAdmin, typed: string): Promise<CodeChecking>
}

export const createPhoneCheck = ({
  checks,
  verifier,
  clock,
}: {
  readonly checks: PhoneChecks
  readonly verifier: PhoneVerifier
  readonly clock: Clock
}): PhoneCheck => ({
  async status(admin) {
    const phone = await checks.adminPhone(admin.ministryId, admin.userId)
    return { phone, verified: phone !== null && (await checks.isVerified(admin.userId, phone)) }
  },

  async sendCode(admin) {
    const phone = await checks.adminPhone(admin.ministryId, admin.userId)
    if (!phone) return { refusal: 'phone_check.no_phone' }
    if (!isUsPhone(phone)) return { refusal: 'phone_check.not_us' }
    if (await checks.isVerified(admin.userId, phone)) return { verified: phone }

    const now = clock.now()
    // The limits are read and the request recorded under one lock, before Twilio
    // is asked: a request counts whatever Twilio then does with it.
    const attemptId = await checks.transact(admin.userId, phone, async (unit) => {
      const since = new Date(now.getTime() - CODE_REQUEST_LOOKBACK_MINUTES * 60_000)
      if (!codeRequestAllowed(await unit.recentCodeRequests(since), now)) return null

      // A resend joins the open attempt, so the tries it has spent stay spent;
      // an attempt that is over is left over, and the code starts a new one.
      const latest = await unit.latestAttempt()
      const standing = latest && attemptStanding(latest, now)
      let id: string
      if (latest && standing?.kind === 'open') {
        id = latest.id
      } else {
        if (latest && standing?.kind === 'expired') await unit.end(latest.id, 'expired', standing.at)
        id = await unit.startAttempt(now)
      }
      await unit.recordCodeRequest(id, now)
      return id
    })
    if (!attemptId) return { refusal: 'phone_check.too_many_codes' }

    let sending
    try {
      sending = await verifier.sendCode(phone)
    } catch (error) {
      console.error(`Twilio Verify did not send a code for account ${admin.userId}`, error)
      return { refusal: 'phone_check.not_sent' }
    }
    if ('refused' in sending) {
      console.error(`Twilio Verify refused to send a code for account ${admin.userId}: ${sending.refused}`)
      return {
        refusal:
          sending.refused === 'outside_permitted_countries' ? 'phone_check.not_us' : 'phone_check.not_sent',
      }
    }

    const verificationSid = sending.sent
    await checks.transact(admin.userId, phone, (unit) =>
      unit.recordVerificationSid(attemptId, verificationSid),
    )
    return { sent: phone }
  },

  async confirmCode(admin, typed) {
    const code = readPhoneCode(typed)
    if (!code) return { refusal: 'phone_check.malformed_code' }

    const phone = await checks.adminPhone(admin.ministryId, admin.userId)
    if (!phone) return { refusal: 'phone_check.no_phone' }

    const now = clock.now()
    // The try is counted before Twilio is asked, under the lock, so two codes
    // typed at once cannot both be the fifth.
    const taken = await checks.transact(
      admin.userId,
      phone,
      async (unit): Promise<CodeChecking | { attempt: PhoneCheckAttempt; triesLeft: number }> => {
        const latest = await unit.latestAttempt()
        if (!latest) return { refusal: 'phone_check.no_code' }

        const standing = attemptStanding(latest, now)
        switch (standing.kind) {
          case 'ended':
            if (standing.ending === 'verified') return { verified: phone }
            if (standing.ending === 'expired') return { refusal: 'phone_check.code_expired' }
            return { refusal: 'phone_check.attempt_ended' }
          case 'expired':
            await unit.end(latest.id, 'expired', standing.at)
            return { refusal: 'phone_check.code_expired' }
          case 'open':
            if (!latest.verificationSid) return { refusal: 'phone_check.no_code' }
            await unit.recordTry(latest.id)
            return { attempt: latest, triesLeft: standing.triesLeft - 1 }
        }
      },
    )
    if (!('attempt' in taken)) return taken

    const { attempt, triesLeft } = taken
    const verificationSid = attempt.verificationSid!
    const end = (ending: 'verified' | 'wrong_codes' | 'expired') =>
      checks.transact(admin.userId, phone, (unit) => unit.end(attempt.id, ending, clock.now()))

    let verdict
    try {
      verdict = await verifier.checkCode(verificationSid, code)
    } catch (error) {
      console.error(`Twilio Verify did not check a code for account ${admin.userId}`, error)
      await checks.transact(admin.userId, phone, (unit) => unit.returnTry(attempt.id))
      return { refusal: 'phone_check.not_checked' }
    }

    switch (verdict) {
      case 'approved':
        await end('verified')
        return { verified: phone }
      case 'gone':
        await end('expired')
        return { refusal: 'phone_check.code_expired' }
      case 'tries_used_up':
        await end('wrong_codes')
        return { refusal: 'phone_check.attempt_ended' }
      case 'wrong':
        if (triesLeft > 0) return { refusal: 'phone_check.wrong_code', triesLeft }
        await end('wrong_codes')
        // Twilio stops a verification at its own fifth check, so this is belt and
        // braces: nothing about it is worth failing the answer over.
        await verifier.cancel(verificationSid).catch((error: unknown) => {
          console.error(`Could not cancel Twilio verification ${verificationSid}`, error)
        })
        return { refusal: 'phone_check.attempt_ended' }
    }
  },
})
