import { type NextRequest, NextResponse } from 'next/server'
import type { PageLayout } from '~/domain/intake-form'
import { getCommandService } from '~/service/container'
import { anEditOf, editing } from '../editing'

/**
 * The whole form in the order an Admin dragged it into, posted by the editor's
 * script the moment a question is let go (Pastor feedback, ticket 11). The order
 * arrives as one `layout` field per page and per question, top to bottom --
 * `page:<id>` followed by that page's `question:<key>`s -- so a page left empty is
 * still in it.
 *
 * Whether that is this form's pages and questions, and whether each question may
 * be asked where it was dropped, is the boundary's to say.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const layout: { pageId: string; keys: string[] }[] = []
  for (const entry of submitted.getAll('layout')) {
    if (typeof entry !== 'string') continue
    if (entry.startsWith('page:')) layout.push({ pageId: entry.slice('page:'.length), keys: [] })
    else if (entry.startsWith('question:')) layout.at(-1)?.keys.push(entry.slice('question:'.length))
  }

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.arrange',
        ministryId: admin.ministryId,
        form,
        layout: layout as readonly PageLayout[],
        editedBy: admin.userId,
      }),
    { params: { formSaved: 'order' }, anchor: 'form-editor' },
    { params: {}, anchor: 'form-editor' },
  )
}
