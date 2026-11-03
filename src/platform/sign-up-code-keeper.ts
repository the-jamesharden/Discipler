import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { EMAIL_CODE } from '~/domain/launch-terms'
import { SignUpCodeSecretMissing, type SignUpAttemptToken } from '~/domain/sign-up-attempt'
import type { SignUpCodeKeeper } from '~/service/ports'

/**
 * The randomness and the HMAC behind sign-up's email code (Exponential launch,
 * ticket 11).
 *
 * Six digits are a million possibilities, so a plain hash of a code could be
 * reversed from a copy of the table in no time. Under a server secret it cannot,
 * and keyed to the attempt as well, one attempt's seal says nothing about another's.
 *
 * The secret is read per use, so a deployment without one runs every other page,
 * and refuses here. It is never the same as anything else, and changing it only
 * ends the codes in flight: a person presses "Send a new code".
 */

const SECRET_SHORTEST = 32

export const signUpCodeSecret = (): string => {
  const secret = process.env.SIGN_UP_CODE_SECRET?.trim() ?? ''
  if (secret.length < SECRET_SHORTEST) throw new SignUpCodeSecretMissing()
  return secret
}

export const createSignUpCodeKeeper = (secret: () => string = signUpCodeSecret): SignUpCodeKeeper => {
  const seal = (attemptId: string, code: string): string =>
    createHmac('sha256', secret()).update(`${attemptId}:${code}`).digest('hex')

  return {
    newAttemptToken: () => randomBytes(32).toString('base64url') as SignUpAttemptToken,

    newCode: () => String(randomInt(0, 10 ** EMAIL_CODE.digits)).padStart(EMAIL_CODE.digits, '0'),

    seal,

    matches(attemptId, typed, sealed) {
      // Sealed either way, and compared either way, so an attempt with no code to
      // match takes as long to say no as one with a code.
      const given = Buffer.from(seal(attemptId, typed), 'hex')
      const held = sealed === null ? randomBytes(given.length) : Buffer.from(sealed, 'hex')
      return held.length === given.length && timingSafeEqual(held, given) && sealed !== null
    },
  }
}
