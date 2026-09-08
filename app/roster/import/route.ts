import { NextResponse, type NextRequest } from 'next/server'
import { RosterFileUnreadable, RosterImportRefused } from '~/domain/errors'
import { isImportMode } from '~/domain/roster-csv'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService, settlePlannedPairings } from '~/service/container'
import { encodeImportReport, type ImportFailure } from '../report'

/**
 * The pasted rows arrive as an ordinary form POST, so the import works before
 * JavaScript has loaded and with it off, and the result comes back on the Roster
 * itself rather than on a page of its own -- an Admin importing their congregation
 * wants to see the Roster it landed on. With script, the dialog has already shown
 * them the same review this produces; without it, this is the review.
 */

/** A congregation is a few thousand rows. Anything much past that is not one. */
const LARGEST_PASTE = 2 * 1024 * 1024

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  // Not an error page: a signed-out visitor has no Roster, and a Leader has no
  // Roster to import into. Both land where the page itself would send them.
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const back = (params: URLSearchParams) =>
    // To the Disciples list, where everyone an import adds lands: an imported
    // Person has led nobody and offered nothing on any form yet, and the ones a
    // pair was planned for are on it as the Disciple or waiting for one.
    NextResponse.redirect(new URL(`/roster?${new URLSearchParams([['list', 'disciples'], ...params])}`, request.url), { status: 303 })

  const failed = (reason: ImportFailure) => back(new URLSearchParams({ error: reason }))

  const form = await request.formData()
  const mode = form.get('mode')
  const rows = form.get('rows')

  // A submission naming no layout did not come from the dialog, which always says
  // one. It goes back unchanged rather than reaching the boundary as a guess.
  if (!isImportMode(mode)) return back(new URLSearchParams())
  if (typeof rows !== 'string' || rows.trim() === '') return failed('nothing_pasted')
  if (new TextEncoder().encode(rows).length > LARGEST_PASTE) return failed('too_large')

  try {
    const outcome = await getCommandService().execute({
      type: 'person.import',
      ministryId: admin.ministryId,
      mode,
      text: rows,
    })

    const added = outcome.effects.filter((effect) => effect.kind === 'person.create').length
    const planned = outcome.effects.filter((effect) => effect.kind === 'intendedPairing.plan').length

    // Whatever this import planned is settled at once: two people already past
    // Intake are paired on the spot (ADR-0022).
    await settlePlannedPairings(admin.ministryId)

    return back(encodeImportReport(added, planned, outcome.rejections))
  } catch (error) {
    // Rows whose columns cannot be identified are refused whole rather than
    // half-read, and so is an import overtaken by another write.
    if (error instanceof RosterFileUnreadable) return failed(error.problem)
    if (error instanceof RosterImportRefused) return failed('roster_changed')
    throw error
  }
}
