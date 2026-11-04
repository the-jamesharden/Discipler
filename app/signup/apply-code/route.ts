import { NextResponse, type NextRequest } from 'next/server'
import { EXPONENTIAL_OFFER } from '~/domain/launch-terms'
import { offerFor } from '~/domain/offers'
import { fieldOf, formOf, whileSignUpIsShut } from '../answer'
import { codeRefusalMessage } from '../payment/copy'

export const dynamic = 'force-dynamic'

/**
 * **Apply**, in "Have a code?" (Exponential launch, ticket 20; mock-up 6). Takes the form
 * field `code`. It records nothing and needs no attempt: the code is printed on a flyer,
 * and the payment step checks it again when it is used.
 *
 * Answers `{ code }`, as the rest of sign-up carries it, or `{ refusal, message }`. An
 * empty box is a code nobody recognizes, as the mock-up has it.
 */
export async function POST(request: NextRequest) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const typed = fieldOf(await formOf(request), 'code')
  const { offer, codeRefusal } = offerFor({ code: typed, invited: false, at: new Date() })

  if (offer === 'exponential') return NextResponse.json({ code: EXPONENTIAL_OFFER.code })

  const refusal = codeRefusal ?? 'offer.code_unknown'
  return NextResponse.json({ refusal, message: codeRefusalMessage(refusal) }, { status: 422 })
}
