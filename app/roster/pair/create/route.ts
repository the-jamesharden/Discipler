import { NextResponse, type NextRequest } from 'next/server'
import { PairingRefused } from '~/domain/errors'
import { personId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'

/**
 * An ordinary form POST, like the import, so pairing works before JavaScript has
 * loaded. All three pairing routes arrive here: the command does not know which
 * screen the Admin came from, and nothing branches on whether a suggestion was
 * involved.
 */

export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const form = await request.formData()
  const leaderId = form.get('leaderId')
  const participantIds = form
    .getAll('participantId')
    .filter((value): value is string => typeof value === 'string' && value !== '')

  const refused = (code: string) =>
    NextResponse.redirect(
      new URL(`/roster/pair?${new URLSearchParams({ error: code })}`, request.url),
      { status: 303 },
    )

  if (typeof leaderId !== 'string' || leaderId === '') {
    return refused('pairing.no_leader_chosen')
  }

  try {
    await getCommandService().execute({
      type: 'relationship.create',
      ministryId: admin.ministryId,
      leaderId: personId(leaderId),
      participantIds: participantIds.map(personId),
    })
  } catch (error) {
    // Every refusal an Admin can act on travels as a code and lands back on the form
    // they submitted, with their selection still on screen to correct. A refusal
    // that reached them as nothing at all is the silent no-op this ticket rules out.
    if (error instanceof PairingRefused) return refused(error.refusal)
    throw error
  }

  // Back to the Roster, where the new relationship is now visible on both rows. It
  // reads as Awaiting Leader Acceptance and has sent nobody anything.
  return NextResponse.redirect(
    new URL(`/roster?${new URLSearchParams({ paired: String(participantIds.length) })}`, request.url),
    { status: 303 },
  )
}
