import { type NextRequest, NextResponse } from 'next/server'
import { isFormText } from '~/domain/intake-form'
import { getCommandService } from '~/service/container'
import { anEditOf, backToTheEditor, editing, typed } from '../editing'

/**
 * The intro said on the first page, or the thank-you said after Submit (Pastor
 * feedback, ticket 11). Emptied, it is taken off.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const which = typed(submitted, 'which')
  if (!isFormText(which)) return backToTheEditor(request, form)

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.edit_text',
        ministryId: admin.ministryId,
        form,
        which,
        text: typed(submitted, 'text'),
        editedBy: admin.userId,
      }),
    { params: { formSaved: which }, anchor: `text-${which}` },
    { params: { writing: which }, anchor: `text-${which}` },
  )
}
