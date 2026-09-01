import { NextResponse, type NextRequest } from 'next/server'
import { MinistrySettingsRefused } from '~/domain/errors'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * The one save, behind the one form. An ordinary form POST like every other Admin
 * action here, so the whole screen works before JavaScript has loaded.
 *
 * Nothing about what a timezone is, what a whole hour is, or what counts as a word
 * for a role is decided here. A check in this route would be a second definition of
 * those rules, in the one place that cannot be driven without a browser -- and the
 * database holds a third, which is the one that catches the settings a pilot writes
 * by SQL.
 */

const SETTINGS = '/settings'

const back = (request: NextRequest, params?: Record<string, string>) => {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  return NextResponse.redirect(new URL(`${SETTINGS}${query}`, request.url), {
    status: 303,
  })
}

/** A field as it arrives, or null. Never coerced: `readMinistrySettings` decides. */
const typed = (form: FormData, field: string): string | null => {
  const value = form.get(field)
  return typeof value === 'string' ? value : null
}

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  // Not an error page: a signed-out visitor has no settings, and a Leader has none
  // to change. Both land where the page itself would send them.
  if (!admin) return back(request)

  const form = await request.formData()

  try {
    await getCommandService().execute({
      type: 'settings.update',
      // From the session and never from the form, like every other Admin action.
      ministryId: admin.ministryId,
      changedBy: admin.userId,
      fields: {
        name: typed(form, 'name'),
        fromName: typed(form, 'fromName'),
        timezone: typed(form, 'timezone'),
        leaderNoun: typed(form, 'leaderNoun'),
        participantNoun: typed(form, 'participantNoun'),
        // An unchecked box sends nothing at all, which is the browser saying *no*
        // -- the one field on this form where absent and false really are the same
        // fact, and the reason this one is read here rather than passed through as
        // a string for the domain to interpret.
        suggestGenderMatch: typed(form, 'suggestGenderMatch') !== null,
        suggestMaxAgeBandGap: typed(form, 'suggestMaxAgeBandGap'),
        checkinDay: typed(form, 'checkinDay'),
        checkinHour: typed(form, 'checkinHour'),
      },
    })
  } catch (error) {
    // Every problem at once, as codes, in the order the form asks the questions.
    // The screen owns the sentences; anything else is thrown, because a database
    // that is down is not something to render as *pick a day of the week*.
    if (error instanceof MinistrySettingsRefused) {
      return back(request, { error: error.refusals.join(',') })
    }
    throw error
  }

  return back(request, { saved: 'yes' })
}
