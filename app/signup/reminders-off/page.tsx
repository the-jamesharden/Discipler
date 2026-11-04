import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { churchOfRemindersOffToken } from '~/platform/reminder-link'
import { getChurchSignups } from '~/service/container'
import { Centred } from '../../shell'
import { REMINDERS_OFF_PAGE } from '../payment/copy'
import type { SearchParams } from '../parts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: REMINDERS_OFF_PAGE.title, robots: { index: false, follow: false } }

/**
 * The page behind "Don't send me reminders" (Exponential launch, ticket 18). Opening it
 * changes nothing, so an email scanner following the link does not press it, and only
 * the button does. It works signed out and signs nobody in.
 *
 * Not behind sign-up's switch, because an email already sent has promised it. A link
 * that is not signed is a 404, which says nothing about sign-up being here at all.
 */
export default async function RemindersOffPage({ searchParams }: { searchParams: SearchParams }) {
  const { t } = await searchParams
  const token = typeof t === 'string' ? t : null
  const church = churchOfRemindersOffToken(token)
  if (!church || !token) notFound()

  const signup = await getChurchSignups().of(church)
  if (!signup) notFound()

  return (
    <Centred botanical>
      {signup.remindersOff ? (
        <p className="reminders-off-said" role="status">
          {REMINDERS_OFF_PAGE.done}
        </p>
      ) : (
        <form method="post" action="/signup/reminders-off/stop">
          <input type="hidden" name="t" value={token} />
          <p className="reminders-off-said">{REMINDERS_OFF_PAGE.asking}</p>
          <button type="submit" className="full">
            {REMINDERS_OFF_PAGE.press}
          </button>
        </form>
      )}
    </Centred>
  )
}
