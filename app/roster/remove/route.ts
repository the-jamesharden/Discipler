import { NextResponse, type NextRequest } from 'next/server'
import { CancellationRefused, DepartureRefused, EndingRefused, InvitationRefused, RemovalRefused } from '~/domain/errors'
import { personId as asPersonId, relationshipId as asRelationshipId } from '~/domain/ids'
import type { RemovalRefusal } from '~/domain/removal'
import { getCommandService, getRosterReader } from '~/service/container'
import { unpairFor } from '../unpair'

/**
 * Remove, on the card at the foot of a person's page (Remove from the Roster,
 * ticket 01; James, 2026-09-22).
 *
 * This route removes nothing on its own. Without the confirmation it reopens the
 * page with the question open, and the button inside that is the only thing that
 * carries it -- the way removing a Material works, so a stale form, a copied link
 * or a second tab lands on the question rather than on the removal.
 *
 * Their pairings go with them, each by the act Unpair would take on that line of
 * their page, read here off the Roster as it stands now by the rule the page drew
 * Unpair from (`../unpair`). The one line Unpair offers nothing on -- the last
 * Disciple of a group nobody has accepted -- is that group withdrawn, which is
 * the only way it can lose them. The removal and every one of those acts are one
 * transaction: a pairing that changed while the Admin was looking refuses its
 * act, and nothing at all happens.
 *
 * Nobody is sent anything.
 */
export async function POST(request: NextRequest) {
  const read = await getRosterReader().readRosterPage('person')
  if (read.status !== 'admin') return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  const { admin, page } = read

  const form = await request.formData()
  const said = form.get('personId')
  const person = page.roster.find((entry) => entry.personId === said)
  // Nobody on the Roster by that id: never here, or removed a moment ago. The
  // Roster is where either leaves the Admin.
  if (!person) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const back = (query: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/roster/${encodeURIComponent(person.personId)}?${new URLSearchParams(query)}`, request.url),
      { status: 303 },
    )
  const refused = (refusal: RemovalRefusal) =>
    refusal === 'removal.not_on_the_roster'
      ? NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
      : back({ remove: refusal })

  if (form.get('confirm') !== 'yes') return back({ removing: 'yes' })
  if (person.isAdmin) return refused('removal.person_is_an_admin')

  const pairings = person.relationships.map((relationship) => ({
    relationshipId: asRelationshipId(relationship.relationshipId),
    act: unpairFor(page.roster, person, relationship)?.act ?? ('cancel' as const),
  }))

  try {
    await getCommandService().removePerson({
      ministryId: admin.ministryId,
      personId: asPersonId(person.personId),
      removedBy: admin.userId,
      pairings,
    })
  } catch (error) {
    if (error instanceof RemovalRefused) return refused(error.refusal)
    // One of their pairings changed under the page, and its own act refused.
    if (
      error instanceof CancellationRefused ||
      error instanceof EndingRefused ||
      error instanceof DepartureRefused ||
      error instanceof InvitationRefused
    ) {
      return refused('removal.still_in_a_pairing')
    }
    throw error
  }

  // The Roster, which no longer lists them, says who went. The address carries
  // the id and the page names them from its own read.
  return NextResponse.redirect(
    new URL(`/roster?${new URLSearchParams({ removed: person.personId })}`, request.url),
    { status: 303 },
  )
}
