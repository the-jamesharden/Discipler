import { NextResponse, type NextRequest } from 'next/server'
import { systemClock } from '~/domain/clock'
import { churchOfRemindersOffToken } from '~/platform/reminder-link'
import { getChurchSignups } from '~/service/container'
import { fieldOf, formOf } from '../../answer'

export const dynamic = 'force-dynamic'

/**
 * The button on the page behind "Don't send me reminders" (Exponential launch, ticket
 * 18): a plain form, so it works with no script, and it goes back to that page, which
 * then says it is done. The signature says which church, and nothing else is read. It
 * signs nobody in.
 */
export async function POST(request: NextRequest) {
  const token = fieldOf(await formOf(request), 't')
  const church = churchOfRemindersOffToken(token)
  if (!church) return new NextResponse(null, { status: 404 })

  await getChurchSignups().turnRemindersOff(church, systemClock.now())

  const page = new URL('/signup/reminders-off', request.nextUrl)
  page.searchParams.set('t', token)
  return NextResponse.redirect(page, { status: 303 })
}
