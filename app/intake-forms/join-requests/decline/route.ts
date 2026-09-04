import { NextResponse, type NextRequest } from 'next/server'
import { FollowUpRefused } from '~/domain/errors'
import { followUpItemId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * Declining is resolving the item alone: the request is closed, nobody is added
 * to anything, and nobody is told -- that is a conversation the Admin has, per
 * ADR-0010, and they have the number on the Roster. So it is the one command that
 * already existed for closing an item, reached from a surface for the first time.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/intake-forms', request.url), { status: 303 })

  const form = await request.formData()
  const item = form.get('itemId')
  const person = form.get('personId')
  if (typeof item !== 'string' || item === '') {
    return NextResponse.redirect(new URL('/intake-forms', request.url), { status: 303 })
  }

  try {
    await getCommandService().execute({
      type: 'follow_up.resolve',
      ministryId: admin.ministryId,
      itemId: followUpItemId(item),
      resolvedBy: admin.userId,
    })
  } catch (error) {
    if (error instanceof FollowUpRefused) {
      const params = new URLSearchParams({ joinError: error.refusal })
      return NextResponse.redirect(new URL(`/intake-forms?${params}`, request.url), { status: 303 })
    }
    throw error
  }

  const params = new URLSearchParams()
  if (typeof person === 'string' && person !== '') params.set('declined', person)
  return NextResponse.redirect(new URL(`/intake-forms?${params}`, request.url), { status: 303 })
}
