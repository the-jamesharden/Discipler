import { NextResponse, type NextRequest } from 'next/server'
import { GroupJoinRefused, PairingRefused, ReinvitationRefused } from '~/domain/errors'
import { personIdFrom, relationshipIdFrom } from '~/domain/ids'
import { invitationLink } from '~/domain/outbound-copy'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { escapeHtml, htmlDocument } from '../../document'
import { backToFollowUp, field, FOLLOW_UP, refused } from '../actions'
import {
  careRefusalMessage,
  COPY_IT_BY_HAND,
  COPY_LINK_TO_REINVITE,
  SIGN_IN_AGAIN,
} from '../copy'

export const dynamic = 'force-dynamic'

/**
 * **Copy link to re-invite leader**, on the item the two weeks raise (Manual
 * pairing, recut ticket 06; decided by James on 2026-09-21). It puts her back on
 * the relationship as somebody invited, makes a fresh invitation for another
 * fortnight, and sends her nothing: the Admin carries the link by hand.
 *
 * The link is a credential -- it alone lets its holder set the account's password
 * -- so it never travels in a query string, into browser history and server logs.
 * The button's script asks for it as JSON and puts it on the clipboard. With no
 * script this is an ordinary form post, and it answers with a page showing the
 * link in a field to copy by hand, as a password reset does. A refresh of that
 * page makes another link and records another copy, which is true, and the one
 * on screen is always the one that works.
 */
export async function POST(request: NextRequest) {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json')
  const refuse = (code: string) =>
    wantsJson
      ? NextResponse.json({ error: careRefusalMessage(code) }, { status: 409 })
      : refused(request, code)

  const admin = await currentAdmin()
  if (!admin) {
    return wantsJson
      ? NextResponse.json({ error: SIGN_IN_AGAIN }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }

  const form = await request.formData()
  const relationship = relationshipIdFrom(field(form, 'relationshipId') ?? undefined)
  const person = personIdFrom(field(form, 'personId') ?? undefined)
  if (!relationship || !person) return wantsJson ? refuse('reinvite.not_found') : backToFollowUp(request)

  let link: string
  try {
    const { effects } = await getCommandService().execute({
      type: 'invitation.copy_link',
      // From the session and never from the form, like every other Admin action.
      ministryId: admin.ministryId,
      relationshipId: relationship,
      personId: person,
      copiedBy: admin.userId,
    })
    const minted = effects.flatMap((effect) =>
      effect.kind === 'invitation.issue' || effect.kind === 'invitation.reissue'
        ? [effect.invitation]
        : [],
    )[0]
    if (!minted) throw new Error('invitation.copy_link minted no invitation')
    link = invitationLink(appBaseUrl(), minted.token)
  } catch (error) {
    if (
      error instanceof ReinvitationRefused ||
      error instanceof GroupJoinRefused ||
      error instanceof PairingRefused
    ) {
      return refuse(error.refusal)
    }
    throw error
  }

  if (wantsJson) return NextResponse.json({ link })

  return htmlDocument(
    '<div class="container narrow">'
      + '<header class="header"><div>'
      + `<h1>${escapeHtml(COPY_LINK_TO_REINVITE)}</h1>`
      + `<p>${escapeHtml(admin.ministryName)}</p>`
      + `</div><div class="header-actions"><a href="${FOLLOW_UP}">Back to Follow-Up</a></div></header>`
      + '<main><div class="card">'
      + `<p class="notice">${escapeHtml(COPY_IT_BY_HAND)}</p>`
      + '<div class="field">'
      + `<input type="text" readonly value="${escapeHtml(link)}" aria-label="The invitation link">`
      + '</div>'
      + '</div></main>'
      + '</div>',
  )
}
