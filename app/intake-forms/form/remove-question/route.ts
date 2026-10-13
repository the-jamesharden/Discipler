import { type NextRequest, NextResponse } from 'next/server'
import { getCommandService } from '~/service/container'
import { anEditOf, editing, typed } from '../editing'

/**
 * The second press of *Remove question…* (Pastor feedback, ticket 13): the
 * question comes off the form as its next version, live at once, and every
 * answer given to it is deleted in the same transaction (ADR-0014).
 *
 * Back on the editor at the page it was on, saying it was removed, or on the
 * row still asking, with the reason it was refused. The page is the one the row
 * was drawn on, posted beside the key; it only says where to land.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const key = typed(submitted, 'key')
  const pageId = typed(submitted, 'pageId')

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.remove_question',
        ministryId: admin.ministryId,
        form,
        key,
        editedBy: admin.userId,
      }),
    pageId
      ? { params: { formSaved: `removed:${pageId}` }, anchor: `page-${pageId}` }
      : { params: {}, anchor: 'form-editor' },
    { params: { question: key, removingQuestion: '1' }, anchor: `q-${key}` },
  )
}
