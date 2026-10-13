import { type NextRequest, NextResponse } from 'next/server'
import { getCommandService } from '~/service/container'
import { anEditOf, editing, typed } from '../editing'

/**
 * One question's Save: its wording, its hint and whether it is required, saved
 * as the form's next version and live at once (Pastor feedback, ticket 11).
 * Reworded in place, because a question is its key and the answers point at the
 * key: a Ministry that rewords *Gender* has not asked anybody a new question.
 *
 * Back on the editor with the row closed and *Saved, live now* beside it, or
 * still open with the reason it was refused.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const key = typed(submitted, 'key')
  const menteeWording = submitted.get('menteeWording')

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.edit_question',
        ministryId: admin.ministryId,
        form,
        key,
        wording: typed(submitted, 'wording'),
        menteeWording: typeof menteeWording === 'string' ? menteeWording : null,
        hint: typed(submitted, 'hint'),
        required: typed(submitted, 'required') === 'yes',
        editedBy: admin.userId,
      }),
    { params: { formSaved: key }, anchor: `q-${key}` },
    { params: { question: key }, anchor: `q-${key}` },
  )
}
