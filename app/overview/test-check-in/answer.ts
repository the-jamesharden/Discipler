import { NextResponse } from 'next/server'
import type { TestCheckInRefusal } from '~/domain/test-check-in'
import type { PhoneCheckRefusal } from '~/service/phone-check'
import type { TestCheckInAnswer } from '~/service/test-check-in'
import { phoneShown, SIGN_IN_TO_CHECK_YOUR_PHONE } from '../../account/phone/copy'
import { testCheckInRefusalMessage } from './copy'

/**
 * How the card's two routes answer. Always JSON, called with `fetch`, the card staying on
 * screen whatever comes back. A refusal carries its code for the card to act on and its
 * sentence for the card to show, and is never a 200.
 */

const STATUS: Record<TestCheckInRefusal, number> = {
  'test_check_in.no_phone': 409,
  'test_check_in.opted_out': 409,
  'test_check_in.declined': 409,
  'test_check_in.agreement_needed': 422,
  'test_check_in.limit_reached': 429,
  'test_check_in.real_question_open': 409,
  'test_check_in.church_has_no_access': 402,
}

const statusOf = (refusal: TestCheckInRefusal | PhoneCheckRefusal): number =>
  refusal.startsWith('test_check_in.') ? STATUS[refusal as TestCheckInRefusal] : 422

export const signedOut = () =>
  NextResponse.json({ refusal: 'test_check_in.signed_out', message: SIGN_IN_TO_CHECK_YOUR_PHONE }, { status: 401 })

export const answering = (answer: TestCheckInAnswer) => {
  if ('sent' in answer) return NextResponse.json({ sent: true, left: answer.left })
  if ('verify' in answer) return NextResponse.json({ verify: true, phoneShown: phoneShown(answer.phone) })
  return NextResponse.json(
    {
      refusal: answer.refusal,
      message: testCheckInRefusalMessage(answer.refusal, answer.triesLeft),
      ...(answer.triesLeft === undefined ? {} : { triesLeft: answer.triesLeft }),
    },
    { status: statusOf(answer.refusal) },
  )
}
