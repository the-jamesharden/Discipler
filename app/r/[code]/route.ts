import { NextResponse, type NextRequest } from 'next/server'
import { whileSignUpIsShut } from '../../signup/answer'
import { carriedValue, signUpHref } from '../../signup/flow'

export const dynamic = 'force-dynamic'

/**
 * A church's referral link, `app.trydiscipler.com/r/<code>` (Exponential launch, ticket
 * 20), here because `trydiscipler.com` is on GitHub Pages, which has no redirects by path.
 *
 * It asks nothing about the code, so its answer and its time say nothing about whether
 * one is live. Only the banner on the email and phone page does. Something that could not
 * be a code goes to plain sign-up, and is not repeated into a link.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const shut = whileSignUpIsShut()
  if (shut) return shut

  const ref = carriedValue((await params).code)
  return NextResponse.redirect(new URL(signUpHref('human_check', ref ? `ref=${ref}` : ''), request.url), { status: 307 })
}
