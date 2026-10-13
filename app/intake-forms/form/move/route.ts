import { type NextRequest, NextResponse } from 'next/server'
import { isMoveDirection } from '~/domain/intake-form'
import { getCommandService } from '~/service/container'
import { anEditOf, backToTheEditor, editing, typed } from '../editing'

/**
 * One question, one place up or down: the editor's buttons before its script has
 * run (Pastor feedback, ticket 11). Off the top of a page it goes to the bottom of
 * the page before, so a question can be walked onto any page.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const key = typed(submitted, 'key')
  const direction = typed(submitted, 'direction')
  if (!isMoveDirection(direction)) return backToTheEditor(request, form)

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.move_question',
        ministryId: admin.ministryId,
        form,
        key,
        direction,
        editedBy: admin.userId,
      }),
    { params: {}, anchor: `q-${key}` },
    { params: {}, anchor: `q-${key}` },
  )
}
