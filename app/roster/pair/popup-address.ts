import { pairPopupHref, SIDE_FIELD, type PairSide } from '../lists'

/**
 * The old Pair page's addresses, read as the Pair popup's (Manual pairing, recut
 * ticket 05). The page is gone; its address is bookmarked, in old texts and in
 * refusals already in flight, so it redirects into the popup with everything it
 * said. Pure, so that `tests/app` can hold the rule with no server near it.
 *
 * The old page named a Discipler as `leaderId` and a Disciple as `with`. A
 * Discipler it named opens their popup on the Discipler's side, with every Disciple
 * it named ticked; a Disciple named alone, which is the Follow-Up tab's old link,
 * opens theirs on the Disciple's side. An address that names nobody has nobody to
 * open a popup for, and goes to the Roster (a default taken while writing the
 * ticket, which James can overrule).
 *
 * The side it opens on is said in the address on its own (Roles per pairing,
 * ticket 01): a Discipler it named on *Disciples somebody*, and a Disciple on *Is
 * discipled*, whatever the preset would say of them. It opens over the whole
 * Roster, which is one list (ticket 02).
 */

/** Whose popup, and on which side: the first Discipler named, or else the first Disciple. */
export const popupFor = ({
  leaderIds,
  participantIds,
}: {
  readonly leaderIds: readonly string[]
  readonly participantIds: readonly string[]
}): { readonly pair: string; readonly side: PairSide } | null => {
  const discipler = leaderIds.find((id) => id !== '')
  if (discipler !== undefined) return { pair: discipler, side: 'discipler' }
  const disciple = participantIds.find((id) => id !== '')
  if (disciple !== undefined) return { pair: disciple, side: 'disciple' }
  return null
}

/**
 * Where an old Pair address goes. Everything else in it is carried as it was: a
 * refusal's code and every choice it restored are under the names the popup reads,
 * because the popup's refusals took them from the old page's. The one person the
 * popup is for leaves the list they were named in, as the pairing route leaves them
 * out of a refusal it sends back; a `pair` or `side` of the address's own would
 * contradict the popup it opens, and is dropped, and so is the retired toggle's
 * `list`, which names nothing now (Roles per pairing, ticket 02).
 */
export const popupAddressFor = (old: URLSearchParams): string => {
  const popup = popupFor({ leaderIds: old.getAll('leaderId'), participantIds: old.getAll('with') })
  if (popup === null) return '/roster'

  const namedAs = popup.side === 'discipler' ? 'leaderId' : 'with'
  const address = new URL(pairPopupHref(popup.pair, popup.side), 'http://roster')
  let taken = false
  for (const [name, value] of old) {
    if (name === 'list' || name === 'pair' || name === SIDE_FIELD) continue
    if (!taken && name === namedAs && value === popup.pair) {
      taken = true
      continue
    }
    address.searchParams.append(name, value)
  }
  return `${address.pathname}${address.search}`
}
