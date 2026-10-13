import { type NextRequest, NextResponse } from 'next/server'
import { getCommandService } from '~/service/container'
import { anEditOf, editing, typed } from '../editing'

/** One page's name, which is the line at the top of its screen (Pastor feedback, ticket 11). */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const pageId = typed(submitted, 'pageId')

  return editing(
    request,
    form,
    () =>
      getCommandService().execute({
        type: 'intake_form.rename_page',
        ministryId: admin.ministryId,
        form,
        pageId,
        name: typed(submitted, 'name'),
        editedBy: admin.userId,
      }),
    { params: { formSaved: `page:${pageId}` }, anchor: `page-${pageId}` },
    { params: { renaming: pageId }, anchor: `page-${pageId}` },
  )
}
