import { NextResponse, type NextRequest } from 'next/server'
import { askDisciplerIsOn } from '~/platform/ask-discipler-switch'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getAskDiscipler } from '~/service/container'

export const dynamic = 'force-dynamic'

/**
 * The minus on the bubble and the tab that brings it back (Exponential launch, ticket
 * 31), stored on this Admin and read through the page session on every page. Who it is
 * about comes from the session, and all a form can say is `tucked` or not.
 */
export async function POST(request: NextRequest) {
  if (!askDisciplerIsOn(process.env)) return new NextResponse(null, { status: 404 })

  const admin = await currentAdmin()
  if (!admin) return new NextResponse(null, { status: 401 })

  const form = await request.formData().catch(() => null)
  await getAskDiscipler().setTucked({
    ministryId: admin.ministryId,
    userId: admin.userId,
    tucked: form?.get('tucked') === 'true',
  })

  return new NextResponse(null, { status: 204 })
}
