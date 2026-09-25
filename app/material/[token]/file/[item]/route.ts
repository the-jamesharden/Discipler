import { NextResponse, type NextRequest } from 'next/server'
import { downloadLinkForAnybody } from '~/platform/supabase/material-files'
import { getMaterialPageReader } from '~/service/container'

/** Long enough to start a download on a slow phone, and no longer. */
const HOW_LONG_A_FILE_LINK_LIVES = 60 * 5

/**
 * One file off a Disciple's Material page (Richer materials, ticket 04). The link
 * is checked again here -- still open, and this item on the Material running now
 * -- and only then is a link to the object minted, for a few minutes, and the
 * browser sent to it. A file taken off the Material, or a link that has ended,
 * is not found.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; item: string }> },
) {
  const { token, item } = await params
  const file = await getMaterialPageReader().fileOnMaterialPage(token, item)
  if (!file) return new NextResponse('Not found', { status: 404 })

  const url = await downloadLinkForAnybody(file, HOW_LONG_A_FILE_LINK_LIVES)
  if (!url) return new NextResponse('That file could not be opened just now.', { status: 503 })
  return NextResponse.redirect(url, { status: 303 })
}
