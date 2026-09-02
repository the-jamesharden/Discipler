import { NextResponse, type NextRequest } from 'next/server'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { backToFollowUp, field } from '../actions'

/**
 * *See contact details*, which is the whole of Nudge (ADR-0010): it reveals one
 * Person's number on their care item and sends nothing.
 *
 * It writes nothing and reads nothing itself. The Person travels back on the
 * query string and the page reads the number through `contactToShare`, which
 * answers only where the Person currently agrees to share it -- so the number is
 * read at the moment of display and never carried in a URL. A POST rather than a
 * link so a prefetch cannot walk the Roster's numbers, and because a reveal is a
 * thing an Admin does rather than a place they go.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const person = field(form, 'personId')
  const relationship = field(form, 'relationshipId')
  if (!person) return backToFollowUp(request)

  const params = new URLSearchParams({ reveal: person })
  return NextResponse.redirect(
    new URL(
      `/follow-up?${params}${relationship ? `#relationship-${encodeURIComponent(relationship)}` : ''}`,
      request.url,
    ),
    { status: 303 },
  )
}
