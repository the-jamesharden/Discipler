import { type NextRequest, NextResponse } from 'next/server'
import { getCommandService } from '~/service/container'
import type { ChoicesAsTyped } from '~/domain/intake-form'
import { anEditOf, editing, linesOf, typed } from '../editing'

/**
 * One question's Save: its wording, its hint and whether it is required, saved
 * as the form's next version and live at once (Pastor feedback, ticket 11), and
 * the choices of a choice question the Ministry added (ticket 12).
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
  const choices = choicesSent(submitted)

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
        ...(choices ? { choices } : {}),
        editedBy: admin.userId,
      }),
    { params: { formSaved: key }, anchor: `q-${key}` },
    { params: { question: key }, anchor: `q-${key}` },
  )
}

/**
 * The choices of a choice question the Ministry added (ticket 12): a box per
 * choice, named `choice:<id>` so a rewording keeps the choice its answers point
 * at, and the box of new ones under them. Null where the row had neither.
 */
const choicesSent = (submitted: FormData): ChoicesAsTyped | null => {
  const kept = [...submitted.keys()]
    .filter((name) => name.startsWith('choice:'))
    .map((name) => ({ id: name.slice('choice:'.length), wording: typed(submitted, name) }))
  const more = submitted.get('moreChoices')
  if (kept.length === 0 && typeof more !== 'string') return null
  return { kept, added: typeof more === 'string' ? linesOf(more) : [] }
}
