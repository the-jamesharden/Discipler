import { NextResponse, type NextRequest } from 'next/server'
import { FollowUpRefused, GroupRefused, PairingRefused } from '~/domain/errors'
import { followUpItemId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An Admin admitting somebody who asked to join a group. The body names the item
 * and nothing else the command acts on: who and which group are read off the item
 * inside the transaction. The Person's id travels only so Intake forms can say whose
 * admission just landed, and is looked up there rather than rendered.
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

  // Whether anybody actually joined, read off what the command decided: a request
  // from somebody already in the group is closed and joins nobody, and the page
  // must not say a Leader was told when nobody was.
  let joined = false
  try {
    const { effects } = await getCommandService().execute({
      type: 'relationship.admit',
      ministryId: admin.ministryId,
      itemId: followUpItemId(item),
      admittedBy: admin.userId,
    })
    joined = effects.some((effect) => effect.kind === 'relationship.join')
  } catch (error) {
    // Three ways it can refuse and all of them are sentences for the Admin: the
    // request is gone or its group has ended, somebody else closed it first, or
    // the membership itself was refused by the same rules formation is held to.
    if (
      error instanceof GroupRefused
      || error instanceof FollowUpRefused
      || error instanceof PairingRefused
    ) {
      const params = new URLSearchParams({ joinError: error.refusal })
      return NextResponse.redirect(new URL(`/intake-forms?${params}`, request.url), { status: 303 })
    }
    throw error
  }

  const params = new URLSearchParams()
  if (typeof person === 'string' && person !== '') {
    params.set(joined ? 'admitted' : 'alreadyIn', person)
  }
  return NextResponse.redirect(new URL(`/intake-forms?${params}`, request.url), { status: 303 })
}
