import { NextResponse } from 'next/server'
import type { PhoneNumber } from '~/domain/roster'
import type { PhoneCheckRefusal } from '~/service/phone-check'
import { phoneCheckRefusalMessage, phoneShown, SIGN_IN_TO_CHECK_YOUR_PHONE } from './copy'

/**
 * How the two phone-check routes answer. Always JSON: they are called by the test
 * check-in's card (ticket 28) with `fetch`, the code box and the buttons staying
 * on screen whatever comes back.
 *
 * A refusal carries its code, for the card to act on, and its sentence, for the
 * card to show. The status says which kind of no it is, so a refusal is never a
 * 200 for anything that only looks at the status.
 */

const STATUS: Record<PhoneCheckRefusal, number> = {
  'phone_check.no_phone': 409,
  'phone_check.not_us': 422,
  'phone_check.too_many_codes': 429,
  'phone_check.not_sent': 502,
  'phone_check.malformed_code': 422,
  'phone_check.no_code': 409,
  'phone_check.code_expired': 409,
  'phone_check.wrong_code': 422,
  'phone_check.attempt_ended': 409,
  'phone_check.not_checked': 502,
}

export const signedOut = () =>
  NextResponse.json({ refusal: 'phone_check.signed_out', message: SIGN_IN_TO_CHECK_YOUR_PHONE }, { status: 401 })

export const refused = (refusal: PhoneCheckRefusal, triesLeft?: number) =>
  NextResponse.json(
    {
      refusal,
      message: phoneCheckRefusalMessage(refusal, triesLeft),
      ...(triesLeft === undefined ? {} : { triesLeft }),
    },
    { status: STATUS[refusal] },
  )

/** A phone that has a code on its way, or that is verified already. */
export const answered = (outcome: 'sent' | 'verified', phone: PhoneNumber) =>
  NextResponse.json({ [outcome]: true, phone, phoneShown: phoneShown(phone) })
