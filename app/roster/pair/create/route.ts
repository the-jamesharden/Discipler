import { NextResponse, type NextRequest } from 'next/server'
import { PairingRefused } from '~/domain/errors'
import { materialId, personId } from '~/domain/ids'
import type { Gender } from '~/domain/intake'
import { readPairingMode } from '~/domain/separate-pairings'
import { DEFAULT_LIST, isRosterList } from '../../copy'
import { declaredGenderFromField, declaredGenderToField } from '../../declared-gender'
import { SHAPE_FIELD, postedByAGroup, wasPostedByAGroup } from '../../pair-shape'
import { materialFieldFor, readMaterialPerDisciple } from '../material-per-disciple'
import { popupFor } from '../popup-address'
import { encodeSeparateReceipt } from '../receipt'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getCommandService } from '~/service/container'
import { formSeparately } from '~/service/separate-pairings'

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
  const chosen = (field: string): string[] =>
    form.getAll(field).filter((value): value is string => typeof value === 'string' && value !== '')

  const leaderIds = chosen('leaderId')
  const participantIds = chosen('participantId')

  /**
   * Whose Pair popup this came from, and the list it was drawn over (Manual
   * pairing, ticket 12). A refusal reopens the popup, and the receipt lands on the
   * list the Admin was on. Whether `pair` names anybody is the Roster's to say.
   *
   * The popup always says. A form that does not, which nothing in the app draws
   * since the old Pair page retired (recut ticket 05), is answered as that page's
   * address is: its first Discipler's popup, or else its first Disciple's. One that
   * names nobody at all has no popup to return to, and goes to the Roster.
   */
  const rawList = form.get('list')
  const posted = chosen('pair')[0]
  const popup =
    posted === undefined
      ? popupFor({ leaderIds, participantIds })
      : { pair: posted, list: isRosterList(rawList) ? rawList : DEFAULT_LIST }

  /**
   * One relationship of everybody chosen, or a one-to-one with each Disciple
   * (Manual pairing, ticket 21). Absent, or anything that is not `separate`, is
   * `together`, which is what this route did before it was asked.
   */
  const mode = readPairingMode(form.get('mode'))

  /**
   * What the Admin said this relationship is. `undefined` is passed through rather
   * than folded to mixed, because the domain has to be able to tell *nobody answered*
   * from *somebody answered mixed*, and a route that guessed would answer a
   * safeguarding question on the Admin's behalf.
   */
  const declaredGender: Gender | null | undefined = declaredGenderFromField(
    form.get('declaredGender'),
  )

  /**
   * What the Admin called it, as typed, and whether joining it through the group
   * link asks first. Both passed through unread: what counts as a name is the
   * boundary's, and a checkbox is sent when ticked and absent when not.
   */
  const rawName = form.get('name')
  const name = typeof rawName === 'string' ? rawName : null
  const joinRequiresApproval = form.get('joinRequiresApproval') === 'yes'

  /**
   * The Material the Admin chose, or nothing. An empty value is the select's own
   * *none* and is no choice at all; anything else is passed through unread, and
   * whether this Ministry holds it is the boundary's to say.
   */
  const rawMaterial = form.get('materialId')
  const chosenMaterial = typeof rawMaterial === 'string' && rawMaterial !== '' ? rawMaterial : null

  /**
   * Whether the popup posted this as a Group (Manual pairing, recut ticket 04).
   * Nothing is formed differently for it: `together` is a 1:2 pair and a Group
   * alike, and what either is called and declares is above. It is read only for the
   * way back, so a refused Group reopens as the Group it was.
   */
  const asAGroup = wasPostedByAGroup(form.get(SHAPE_FIELD))

  /**
   * The Material chosen for each Disciple of a set of separate one-to-ones (Manual
   * pairing, recut ticket 02), for the Disciples submitted and nobody else: a
   * choice for anybody not among them is ignored here as the split ignores it, so
   * it neither forms anything nor travels back. `together` never reads these, as
   * `separate` never reads the one Material above.
   */
  const materialPerDisciple = new Map(
    [...readMaterialPerDisciple(form.entries())].filter(([id]) => participantIds.includes(id)),
  )

  /** Every Material chosen, under the field it was posted as: the one, and one per Disciple. */
  const withMaterials = (params: URLSearchParams): URLSearchParams => {
    if (chosenMaterial) params.set('materialId', chosenMaterial)
    for (const [id, chosen] of materialPerDisciple) params.set(materialFieldFor(id), chosen)
    return params
  }

  /**
   * Back to the form with the selection intact. An Admin who picked five people for a
   * group and hit a refusal should be correcting one choice, not making all five
   * again -- and a refusal that costs more than the mistake did teaches people to
   * avoid the screen.
   */
  const refused = (code: string, about: string | null = null) => {
    if (popup === null) return NextResponse.redirect(new URL('/roster', request.url), { status: 303 })
    // Every choice the popup holds: from a Disciple the one Discipler, and from a
    // Discipler whoever was ticked (Manual pairing, ticket 23). Never the person
    // the popup is for, who is in the address already as `pair`.
    const params = new URLSearchParams({ list: popup.list, pair: popup.pair, error: code })
    // And what two or more ticks were to become (Manual pairing, recut ticket 02):
    // who of several the refusal is about, the shape, and every Material chosen,
    // each under the name the old Pair page's refusals gave it, so that its old
    // addresses still read.
    if (about !== null) params.set('about', about)
    if (mode === 'separate') params.set('mode', mode)
    for (const id of leaderIds) if (id !== popup.pair) params.append('leaderId', id)
    for (const id of participantIds) if (id !== popup.pair) params.append('with', id)
    // And what a Group was asked: that it was one, what it declared and what it
    // was called, under the names the old Pair page's refusals gave the last two.
    // Only a Group's: a 1:2 pair's name and declaration are generated, and would
    // come back as something the Admin had typed.
    if (asAGroup) {
      for (const [field, value] of Object.entries(postedByAGroup)) params.set(field, value)
      if (declaredGender !== undefined) params.set('declaredGender', declaredGenderToField(declaredGender))
      if (name) params.set('name', name)
    }
    return NextResponse.redirect(new URL(`/roster?${withMaterials(params)}`, request.url), { status: 303 })
  }

  /**
   * A one-to-one with each Disciple, all of them or none. The set is checked whole
   * before any of it is formed, and the group's properties -- its declaration, its
   * name, its door -- are left behind rather than applied to each pairing: a
   * one-to-one has nothing a name is for, and its gender is its two people's. They
   * still travel back on a refusal, as part of what the Admin had on screen.
   *
   * Each Disciple carries their own Material (Manual pairing, recut ticket 02), and
   * the one Material a `together` submission takes is not theirs.
   */
  if (mode === 'separate') {
    const outcome = await formSeparately(getCommandService(), {
      ministryId: admin.ministryId,
      leaderIds: leaderIds.map(personId),
      participantIds: participantIds.map(personId),
      materialIds: new Map(
        [...materialPerDisciple].map(([id, chosen]) => [personId(id), materialId(chosen)]),
      ),
    })

    if (outcome.status === 'refused') return refused(outcome.refusal, outcome.about)

    // Some of it landed, which is the outcome the check exists to prevent and cannot
    // rule out. A fault cannot be thrown without losing the count of what landed, so
    // it is logged here and the receipt says the rest.
    if (outcome.status === 'partly_formed' && outcome.refusal === null) {
      console.error(
        `A set of one-to-ones in ministry ${admin.ministryId} stopped partway on a fault`,
        outcome.fault,
      )
    }

    // To the Roster either way, where what landed is on the rows. The receipt counts
    // the one-to-ones formed, and where that is not all of them, says who was not.
    const receipt = encodeSeparateReceipt(outcome)
    // On the list the popup was drawn over, as one pairing's receipt is.
    if (popup !== null) receipt.set('list', popup.list)
    return NextResponse.redirect(new URL(`/roster?${receipt}`, request.url), { status: 303 })
  }

  // An empty selection is refused by the domain rather than here. The route once
  // checked for a missing leader itself, which made one refusal a bare string on this
  // side of the boundary while every other one was a `PairingRefusal` -- so a typo in
  // either the code or its wording fell through to the generic message instead of
  // failing the build.
  try {
    await getCommandService().execute({
      type: 'relationship.create',
      ministryId: admin.ministryId,
      leaderIds: leaderIds.map(personId),
      participantIds: participantIds.map(personId),
      ...(declaredGender === undefined ? {} : { declaredGender }),
      name,
      joinRequiresApproval,
      ...(chosenMaterial === null ? {} : { materialId: materialId(chosenMaterial) }),
    })
  } catch (error) {
    // Every refusal an Admin can act on travels as a code and lands back on the form
    // they submitted, with their selection still on screen to correct. A refusal that
    // reached them as nothing at all is the silent no-op this ticket rules out.
    if (error instanceof PairingRefused) return refused(error.refusal)
    throw error
  }

  // Back to the Roster, where the new relationship is now visible on both rows. It
  // reads as Awaiting Leader Acceptance, and each Discipler's invitation is sent
  // once this response has gone.
  const receipt = new URLSearchParams({
    ...(popup === null ? {} : { list: popup.list }),
    paired: String(participantIds.length),
  })
  return NextResponse.redirect(new URL(`/roster?${receipt}`, request.url), { status: 303 })
}
