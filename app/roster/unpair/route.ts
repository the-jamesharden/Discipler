import { NextResponse, type NextRequest } from 'next/server'
import { CancellationRefused, DepartureRefused, EndingRefused, InvitationRefused } from '~/domain/errors'
import { personId as asPersonId } from '~/domain/ids'
import { isRelationshipOutcome } from '~/domain/relationships'
import { getCommandService, getRosterReader } from '~/service/container'
import { UNPAIRED_BLANK_REASON, type Unpaired } from '../copy'
import { unpairFor } from '../unpair'

/**
 * Unpair, pressed on one line of a person's Pairings card (James, 2026-09-21).
 *
 * The form says which pairing and whose page. It does not say which act: that is
 * read here, off the Roster as it stands now and by the rule the page drew the
 * button from (`../unpair`), so a page that has gone stale cannot ask for an act
 * its line no longer gets. Each command then refuses for itself what the Roster
 * cannot see, inside its own transaction, and a refusal comes back as one sentence:
 * every one of them means the pairing changed while the Admin was looking at it.
 *
 * Nobody is sent anything by any of the four, which is the commands' own rule and
 * not something this route arranges.
 */

export async function POST(request: NextRequest) {
  const read = await getRosterReader().readRosterPage('person')
  if (read.status !== 'admin') return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  const { admin, page } = read

  const form = await request.formData()
  const field = (name: string): string | null => {
    const value = form.get(name)
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  }

  const person = page.roster.find((entry) => entry.personId === field('personId'))
  if (!person) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })

  const back = (unpair: Unpaired | 'refused') =>
    NextResponse.redirect(
      new URL(`/roster/${encodeURIComponent(person.personId)}?${new URLSearchParams({ unpair })}`, request.url),
      { status: 303 },
    )

  const relationship = person.relationships.find((held) => held.relationshipId === field('relationshipId'))
  const unpair = relationship ? unpairFor(page.roster, person, relationship) : null
  if (!relationship || !unpair) return back('refused')

  const about = { ministryId: admin.ministryId, relationshipId: relationship.relationshipId }

  try {
    if (unpair.act === 'cancel') {
      await getCommandService().execute({ type: 'relationship.cancel', ...about, cancelledBy: admin.userId })
      return back('cancelled')
    }

    if (unpair.act === 'withdraw') {
      // Theirs is an invitation and no leading. The service finds it: its token is
      // a credential, and no page or form ever carries one.
      const taken = await getCommandService().withdrawInvitationOf(
        admin.ministryId,
        relationship.relationshipId,
        asPersonId(person.personId),
        admin.userId,
      )
      return back(taken ? 'withdrawn' : 'refused')
    }

    if (unpair.act === 'leave') {
      await getCommandService().execute({
        type: 'relationship.depart',
        ...about,
        personId: asPersonId(person.personId),
        departedBy: admin.userId,
      })
      return back('left')
    }

    // An ending records how it ended, and the two buttons are the only way to say
    // it. A reason is the Admin's to give or not: the database requires one, so a
    // blank one is recorded in the product's own sentence.
    const outcome = field('outcome')
    if (!isRelationshipOutcome(outcome)) return back('refused')
    await getCommandService().execute({
      type: 'relationship.end',
      ...about,
      outcome,
      reason: field('reason') ?? UNPAIRED_BLANK_REASON,
      endedBy: admin.userId,
    })
    return back('ended')
  } catch (error) {
    if (
      error instanceof CancellationRefused ||
      error instanceof EndingRefused ||
      error instanceof DepartureRefused ||
      error instanceof InvitationRefused
    ) {
      return back('refused')
    }
    throw error
  }
}
