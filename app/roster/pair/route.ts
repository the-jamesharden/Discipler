import { NextResponse, type NextRequest } from 'next/server'
import { popupAddressFor } from './popup-address'

/**
 * The old Pair page's address, which opens the Pair popup now (Manual pairing,
 * recut ticket 05). Nothing in the app links here: it serves bookmarks, old texts
 * and refusals already in flight, and where it sends them is `popupAddressFor`'s.
 * Who may see the popup is the Roster's to say, so this asks nobody to sign in.
 *
 * Temporary rather than permanent, so a browser that followed it once does not
 * keep an old address's answer for good.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(popupAddressFor(request.nextUrl.searchParams), request.url), { status: 307 })
}
