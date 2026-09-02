import { NextResponse, type NextRequest } from 'next/server'
import { concernId as asConcernId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCareNeededReader, getCommandService } from '~/service/container'
import { escapeHtml, htmlDocument } from '../../../document'
import { backToFollowUp, refusalCodeOf, refused } from '../../actions'
import { RESOLVE, whoIsInIt } from '../../copy'

export const dynamic = 'force-dynamic'

/**
 * The Concern's words, on a page of their own, one relationship at a time.
 *
 * A POST that renders, and the one screen besides the reset result that does.
 * Reading a Concern is an audited act: `CommandService.openConcern` records the
 * viewing in the same transaction that returns the text, and the authenticated
 * role holds no grant on the column, so there is no page a GET could read the
 * words from. A redirect would have to carry them in a URL. So the form posts the
 * Concerns it is about, each viewing is recorded, and the words render here with
 * Resolve beside each one. A refresh re-posts and records a second viewing, which
 * is true: the text was read again.
 *
 * Every Concern posted is checked against Care Needed as the signed-in Admin, so
 * a body naming a Concern this Ministry does not hold opens nothing.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const asked = form
    .getAll('concernId')
    .filter((value): value is string => typeof value === 'string' && value !== '')
  if (asked.length === 0) return backToFollowUp(request)

  // Which relationship these are about, and who is in it, read from the same list
  // the page was drawn from -- so the heading names the people the Admin pressed
  // the button under, and a Concern of somebody else's is not opened.
  const items = await getCareNeededReader().listCareNeeded(admin.ministryId)
  const item = items.find(
    (each) => each.source === 'concern' && each.concerns.some((concern) => asked.includes(concern.id)),
  )
  if (!item || item.source !== 'concern') return refused(request, 'concern.not_found')

  const concerns = item.concerns.filter((concern) => asked.includes(concern.id))

  const opened: { readonly id: string; readonly raisedAt: Date; readonly raisedBy: string | null; readonly text: string | null }[] = []
  for (const concern of concerns) {
    try {
      const text = await getCommandService().openConcern({
        type: 'concern.view',
        ministryId: admin.ministryId,
        concernId: asConcernId(concern.id),
        viewedBy: admin.userId,
      })
      opened.push({ id: concern.id, raisedAt: concern.raisedAt, raisedBy: concern.raisedByName, text })
    } catch (error) {
      const code = refusalCodeOf(error)
      if (code) return refused(request, code)
      throw error
    }
  }

  const viewedAt = new Date()
  const heading = `Concern · ${whoIsInIt(
    item.members.filter((member) => member.role === 'leader').map((member) => member.fullName),
    item.participantNames,
  )}`

  const blocks = opened
    .map(
      (concern) =>
        '<div class="mentee-card">'
        + `<p class="muted">Raised ${escapeHtml(concern.raisedAt.toISOString().slice(0, 10))}${
          concern.raisedBy ? ` by ${escapeHtml(concern.raisedBy)}` : ''
        }</p>`
        + `<div class="sms">${concern.text === null ? '(text cleared)' : escapeHtml(concern.text)}</div>`
        + '<form method="post" action="/follow-up/concern/resolve" style="margin-top:.75rem">'
        + `<input type="hidden" name="concernId" value="${escapeHtml(concern.id)}">`
        + `<button type="submit">${escapeHtml(RESOLVE)} and clear</button>`
        + '</form>'
        + '</div>',
    )
    .join('')

  return htmlDocument(
    '<div class="container narrow">'
      + '<header class="header"><div>'
      + `<h1>${escapeHtml(heading)}</h1>`
      + `<p>${escapeHtml(admin.ministryName)}</p>`
      + '</div><div class="header-actions"><a href="/follow-up">Back to Follow-Up</a></div></header>'
      + '<main><div class="card">'
      + '<p class="card-lead">Raised in the weekly check-in. Resolving clears this text, so the ministry does not accumulate a permanent file of someone’s hardest weeks.</p>'
      + blocks
      + `<p class="audit">This view was recorded: concern text viewed by you, ${escapeHtml(viewedAt.toISOString().replace('T', ' ').slice(0, 16))} UTC.</p>`
      + '</div></main>'
      + '</div>',
  )
}
