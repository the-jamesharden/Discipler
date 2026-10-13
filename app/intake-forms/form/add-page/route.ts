import { type NextRequest, NextResponse } from 'next/server'
import { getCommandService } from '~/service/container'
import { anEditOf, editing, typed } from '../editing'

/**
 * A new, empty page, just before the last one (Pastor feedback, ticket 11). The
 * wizard skips it until a question is moved onto it.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.add_page',
        ministryId: admin.ministryId,
        form,
        name: typed(submitted, 'name'),
        editedBy: admin.userId,
      }),
    { params: { formSaved: 'page' }, anchor: 'add-page' },
    { params: { addingPage: '1' }, anchor: 'add-page' },
  )
}
