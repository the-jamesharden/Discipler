import { NextResponse, type NextRequest } from 'next/server'
import { RosterFileUnreadable, RosterImportRefused } from '~/domain/errors'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { encodeImportReport, type ImportFailure } from '../report'

/**
 * The upload arrives as an ordinary form POST, so it works before JavaScript has
 * loaded, and the result comes back on the Roster itself rather than on a page of
 * its own -- an Admin importing a spreadsheet wants to see the Roster it landed on.
 */

/** A congregation is a few thousand rows. Anything much past that is not one. */
const LARGEST_FILE = 2 * 1024 * 1024

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  // Not an error page: a signed-out visitor has no Roster, and a Leader has no
  // Roster to import into. Both land where the page itself would send them.
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const back = (params: URLSearchParams) =>
    NextResponse.redirect(new URL(`/roster?${params}`, request.url), { status: 303 })

  const failed = (reason: ImportFailure) => back(new URLSearchParams({ error: reason }))

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File) || file.size === 0) return failed('no_file')
  if (file.size > LARGEST_FILE) return failed('too_large')

  try {
    const outcome = await getCommandService().execute({
      type: 'person.import',
      ministryId: admin.ministryId,
      csv: await file.text(),
    })

    const added = outcome.effects.filter((effect) => effect.kind === 'person.create').length

    return back(encodeImportReport(added, outcome.rejections))
  } catch (error) {
    // A file whose columns cannot be identified is refused whole rather than
    // half-read, and so is an import overtaken by another write.
    if (error instanceof RosterFileUnreadable) return failed(error.problem)
    if (error instanceof RosterImportRefused) return failed('roster_changed')
    throw error
  }
}
