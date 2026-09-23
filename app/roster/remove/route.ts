import { NextResponse, type NextRequest } from 'next/server'
import { CancellationRefused, DepartureRefused, EndingRefused, InvitationRefused, RemovalRefused } from '~/domain/errors'
import { personId as asPersonId } from '~/domain/ids'
import type { RemovalRefusal } from '~/domain/removal'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService, getRosterReader } from '~/service/container'
import { whatARemovalLetsGo } from '../removal'

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
 * its question from (`../removal`). The removal and every one of those acts are one
 * transaction: a pairing that changed while the Admin was looking refuses its
 * act, and nothing at all happens.
 *
 * Nobody is sent anything.
 */
export async function POST(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { status: 303 })
  const pageOf = (id: string, query: Record<string, string>) =>
    `/roster/${encodeURIComponent(id)}?${new URLSearchParams(query)}`

  const form = await request.formData()
  const said = form.get('personId')

  // The first press only asks, so it reads nothing but the session: the page it
  // reopens reads the Roster itself, and is a 404 for anybody no longer on it. At
  // `#remove`, because the card is at the foot of a long page.
  if (form.get('confirm') !== 'yes') {
    if (!(await currentAdmin())) return to('/login')
    return typeof said === 'string' && said !== '' ? to(`${pageOf(said, { removing: 'yes' })}#remove`) : to('/roster')
  }

  const read = await getRosterReader().readRosterPage('person')
  if (read.status !== 'admin') return to('/login')
  const { admin, page } = read

  const person = page.roster.find((entry) => entry.personId === said)
  // Nobody on the Roster by that id: never here, or removed a moment ago. The
  // Roster is where either leaves the Admin.
  if (!person) return to('/roster')

  const refused = (refusal: RemovalRefusal) =>
    refusal === 'removal.not_on_the_roster' ? to('/roster') : to(pageOf(person.personId, { remove: refusal }))

  if (person.isAdmin) return refused('removal.person_is_an_admin')

  const pairings = whatARemovalLetsGo(page.roster, person).map(({ relationshipId, act }) => ({ relationshipId, act }))

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
      // Most often because another Admin removed them first, whose removal ended
      // the same pairings: then there is no page left to say it on.
      const now = await getRosterReader().readRosterPage('person')
      const stillHere = now.status === 'admin' && now.page.roster.some((entry) => entry.personId === person.personId)
      return refused(stillHere ? 'removal.still_in_a_pairing' : 'removal.not_on_the_roster')
    }
    throw error
  }

  // The Roster, which no longer lists them, says who went. The address carries
  // the id and the page names them from its own read.
  return to(`/roster?${new URLSearchParams({ removed: person.personId })}`)
}
