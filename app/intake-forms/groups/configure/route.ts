import { NextResponse, type NextRequest } from 'next/server'
import { GroupRefused } from '~/domain/errors'
import { relationshipId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An Admin naming a group and choosing whether joining it asks. One form and one
 * save, like the settings form: both fields arrive together and land together.
 * An ordinary form POST, like everything on Intake forms, so it works before
 * JavaScript has loaded.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/intake-forms', request.url), { status: 303 })

  const form = await request.formData()
  const relationship = form.get('relationshipId')
  const name = form.get('name')
  // A checkbox is sent when ticked and absent when not, so its absence is the
  // answer *open* rather than a missing field.
  const joinRequiresApproval = form.get('joinRequiresApproval') === 'yes'

  if (typeof relationship !== 'string' || relationship === '') {
    return NextResponse.redirect(new URL('/intake-forms', request.url), { status: 303 })
  }

  try {
    await getCommandService().execute({
      type: 'group.configure',
      ministryId: admin.ministryId,
      relationshipId: relationshipId(relationship),
      name: typeof name === 'string' ? name : null,
      joinRequiresApproval,
      changedBy: admin.userId,
    })
  } catch (error) {
    if (error instanceof GroupRefused) {
      const params = new URLSearchParams({ groupError: error.refusal })
      return NextResponse.redirect(new URL(`/intake-forms?${params}`, request.url), { status: 303 })
    }
    throw error
  }

  return NextResponse.redirect(
    new URL(`/intake-forms?${new URLSearchParams({ configured: relationship })}`, request.url),
    { status: 303 },
  )
}
