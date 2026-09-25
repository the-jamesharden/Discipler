import { NextResponse, type NextRequest } from 'next/server'
import { downloadLinkForAnybody } from '~/platform/supabase/material-files'
import { getMaterialPageReader } from '~/service/container'

/** Long enough to start a download on a slow phone, and no longer. */
const HOW_LONG_A_FILE_LINK_LIVES = 60 * 5

/**
 * One file off a Disciple's Material page (Richer materials, ticket 04). The link
 * is checked again here -- still open, and this item on the Material running now
 * -- and only then is a link to the object minted, for a few minutes, and the
 * browser sent to it.
 *
 * Anything else is the page again, which says what is true now: a link that has
 * ended, no Material, or today's Material without the file that was taken off
 * it. A page left open for a week is tapped long after it was drawn, and the
 * answer to that is the page as it stands, not a bare *Not found*. A token that
 * names nothing gets the page's own not-found, the same as opening it directly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; item: string }> },
) {
  const { token, item } = await params
  const page = NextResponse.redirect(new URL(`/material/${encodeURIComponent(token)}`, request.url), {
    status: 303,
  })
  const file = await getMaterialPageReader().fileOnMaterialPage(token, item)
  if (!file) return page

  // Storage not answering: the page again, where the tap can simply be tried
  // once more, rather than a sentence on a blank screen.
  const url = await downloadLinkForAnybody(file, HOW_LONG_A_FILE_LINK_LIVES)
  return url ? NextResponse.redirect(url, { status: 303 }) : page
}
