import { NextResponse, type NextRequest } from 'next/server'
import { IntakeFormRefused } from '~/domain/errors'
import { getCommandService } from '~/service/container'
import { anEditOf, backToTheEditor, linesOf, typed } from '../editing'

/**
 * A question of the Ministry's own, added at the foot of a page (Pastor
 * feedback, ticket 12): short text, long text, one choice, several choices or
 * yes/no, worded in the row that opened for it and live at once as the form's
 * next version.
 *
 * Back on the editor with the new row closed and *Saved, live now* beside it, or
 * still open with the reason it was refused and what was typed into it put back:
 * an Admin who wrote out ten choices and forgot the question loses none of them.
 */
export async function POST(request: NextRequest) {
  const edit = await anEditOf(request)
  if (edit instanceof NextResponse) return edit
  const { admin, submitted, form } = edit

  const pageId = typed(submitted, 'pageId')
  const kind = typed(submitted, 'kind')
  const wording = typed(submitted, 'wording')
  const hint = typed(submitted, 'hint')
  const required = typed(submitted, 'required') === 'yes'
  const choices = typed(submitted, 'choices')

  try {
    const { effects } = await getCommandService().execute({
      type: 'intake_form.add_question',
      ministryId: admin.ministryId,
      form,
      pageId,
      kind,
      wording,
      hint,
      required,
      choices: linesOf(choices),
      editedBy: admin.userId,
    })
    // The key the boundary minted, off the history it recorded the question in.
    const added = effects.flatMap((effect) =>
      effect.kind === 'history.append' && effect.event.type === 'intake_form.question_added'
        ? [String(effect.event.payload.key)]
        : [],
    )[0]
    return added
      ? backToTheEditor(request, form, { formSaved: added }, `q-${added}`)
      : backToTheEditor(request, form, {}, `page-${pageId}`)
  } catch (error) {
    if (error instanceof IntakeFormRefused) {
      return backToTheEditor(
        request,
        form,
        {
          adding: kind,
          addTo: pageId,
          formError: error.refusal,
          draftWording: wording,
          draftHint: hint,
          draftRequired: required ? 'yes' : 'no',
          draftChoices: choices,
        },
        'new-question',
      )
    }
    throw error
  }
}
