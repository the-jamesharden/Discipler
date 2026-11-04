import { NextResponse, type NextRequest } from 'next/server'
import { systemClock } from '~/domain/clock'
import { referralLinkShown } from '~/domain/referrals'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getReferralLinks } from '~/service/container'

/**
 * "Get a new link" (Exponential launch, ticket 32): the old code is retired, so the old link
 * opens sign-up at the normal price with no free month and no credit, and another is issued.
 * No question is asked. Which church comes from the session and never from the request.
 *
 * The page's script asks for JSON and puts the new link in place. With no script the form
 * posts, and this goes back to the page, which reads the new one.
 */
const wantsJson = (request: NextRequest): boolean =>
  request.headers.get('accept')?.includes('application/json') === true

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'not-an-admin' }, { status: 403 })
      : NextResponse.redirect(new URL('/refer', request.url), { status: 303 })
  }

  const code = await getReferralLinks().getANewCode(admin.ministryId, systemClock.now())

  return wantsJson(request)
    ? NextResponse.json({ link: referralLinkShown(appBaseUrl(), code) })
    : NextResponse.redirect(new URL('/refer', request.url), { status: 303 })
}
