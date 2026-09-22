import type { RosterSide } from '../copy'
import { LIST_OF_SIDE, pairPopupHref } from '../lists'

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
 */

/** Whose popup, over which list: the first Discipler named, or else the first Disciple. */
export const popupFor = ({
  leaderIds,
  participantIds,
}: {
  readonly leaderIds: readonly string[]
  readonly participantIds: readonly string[]
}): { readonly list: RosterSide; readonly pair: string } | null => {
  const discipler = leaderIds.find((id) => id !== '')
  if (discipler !== undefined) return { list: LIST_OF_SIDE.discipler, pair: discipler }
  const disciple = participantIds.find((id) => id !== '')
  if (disciple !== undefined) return { list: LIST_OF_SIDE.disciple, pair: disciple }
  return null
}

/**
 * Where an old Pair address goes. Everything else in it is carried as it was: a
 * refusal's code and every choice it restored are under the names the popup reads,
 * because the popup's refusals took them from the old page's. The one person the
 * popup is for leaves the list they were named in, as the pairing route leaves them
 * out of a refusal it sends back; a `list` or `pair` of the address's own would
 * contradict the popup it opens, and is dropped.
 */
export const popupAddressFor = (old: URLSearchParams): string => {
  const popup = popupFor({ leaderIds: old.getAll('leaderId'), participantIds: old.getAll('with') })
  if (popup === null) return '/roster'

  const namedAs = popup.list === LIST_OF_SIDE.discipler ? 'leaderId' : 'with'
  const address = new URL(pairPopupHref(popup.list, popup.pair), 'http://roster')
  let taken = false
  for (const [name, value] of old) {
    if (name === 'list' || name === 'pair') continue
    if (!taken && name === namedAs && value === popup.pair) {
      taken = true
      continue
    }
    address.searchParams.append(name, value)
  }
  return `${address.pathname}${address.search}`
}
