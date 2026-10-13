import { type NextRequest, NextResponse } from 'next/server'
import { getCommandService } from '~/service/container'
import { anEditOf, editing, typed } from '../editing'

/**
 * One of Discipler's own questions the form no longer asks, put back at the
 * foot of a page from *Add a question* (Pastor feedback, ticket 13), in the
 * words the preset asks it in. Its old answers do not come back with it: they
 * were deleted when it was removed.
 *
 * Back on the editor at the question, saying it is live, or at the page with the
 * reason it was refused.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const pageId = typed(submitted, 'pageId')
  const key = typed(submitted, 'key')

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.add_back_question',
        ministryId: admin.ministryId,
        form,
        pageId,
        key,
        editedBy: admin.userId,
      }),
    { params: { formSaved: key }, anchor: `q-${key}` },
    { params: {}, anchor: `page-${pageId}` },
  )
}
