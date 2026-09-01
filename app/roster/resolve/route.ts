import { NextResponse, type NextRequest } from 'next/server'
import { ImportRowResolutionRefused } from '~/domain/errors'
import { importRowId, personId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An ordinary form POST, like the import and the pairing above it, so answering a
 * row works before JavaScript has loaded.
 *
 * One route for both answers, and the answer arrives as the button that was
 * pressed. There is no default and nothing preselected: a form that could be
 * submitted without saying which answer it meant would be the guess the importer
 * refused to make, wearing a submit button.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  // Not an error page: a signed-out visitor has no Roster, and a Leader has no
  // import rows to answer. Both land where the page itself would send them.
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const back = (params?: URLSearchParams) =>
    NextResponse.redirect(new URL(params ? `/roster?${params}` : '/roster', request.url), {
      status: 303,
    })

  const form = await request.formData()
  const row = form.get('rowId')
  const answer = form.get('answer')
  const person = form.get('personId')

  // A submission naming no row is not a refusal an Admin can act on -- it is a form
  // that did not come from the Roster -- so it goes back unchanged rather than
  // reaching the boundary as a command about nothing.
  if (typeof row !== 'string' || row === '') return back()

  // Read as the two answers and nothing else. Treating *anything but same_person*
  // as *add a second congregant* would let a mangled field file somebody nobody
  // decided to file, so a broken form falls out rather than into either answer.
  if (answer !== 'same_person' && answer !== 'someone_else') return back()
  if (answer === 'same_person' && (typeof person !== 'string' || person === '')) return back()

  try {
    await getCommandService().execute({
      type: 'import_row.resolve',
      ministryId: admin.ministryId,
      rowId: importRowId(row),
      // The Admin's account, which is what every judgement this product records
      // names. Taken from the session and never from the form.
      resolvedBy: admin.userId,
      answer:
        answer === 'same_person'
          ? { kind: 'same_person', personId: personId(person as string) }
          : { kind: 'someone_else' },
    })
  } catch (error) {
    // The Roster moved under the answer -- somebody else answered first, or the
    // name landed on the number in between. The Admin is told which, in the
    // screen's own words, from a code that carries no name and no number.
    if (error instanceof ImportRowResolutionRefused) {
      return back(new URLSearchParams({ rowError: error.refusal }))
    }
    throw error
  }

  return back()
}
