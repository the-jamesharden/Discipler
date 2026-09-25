import { NextResponse, type NextRequest } from 'next/server'
import { downloadLink } from '~/platform/supabase/material-files'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { signedInUserId } from '~/platform/supabase/session'

/** Long enough to start a download on a slow phone, and no longer. */
const HOW_LONG_A_FILE_LINK_LIVES = 60 * 5

/**
 * One file off a Leader's Resources card (Richer materials, review). The
 * dashboard links here rather than to a signed address, so that drawing it is
 * one read (ADR-0023) and not one storage call per file; the file tapped is
 * signed here, at the moment it is tapped.
 *
 * Everything is asked under the Leader's own session: the item is read under the
 * policy that lets a Leader see the items of the Material their relationship is
 * working through now, and the link is signed under the storage policy that
 * reads the same thing. An item that is not theirs, not a file, or no longer on
 * that Material is the dashboard again, which shows what is there now.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ item: string }> }) {
  const { item } = await params
  const supabase = await createSupabaseServerClient()
  if (!(await signedInUserId(supabase))) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }

  const back = NextResponse.redirect(new URL('/relationships', request.url), { status: 303 })
  // An id that is not a uuid is refused by the database as malformed, which is
  // the same answer as one that names nothing.
  const { data, error } = await supabase
    .from('material_item')
    .select('path, filename')
    .eq('id', item)
    .eq('kind', 'file')
    .maybeSingle()
  if (error || !data?.path || !data.filename) return back

  const url = await downloadLink(supabase, { path: data.path, filename: data.filename }, HOW_LONG_A_FILE_LINK_LIVES)
  return url ? NextResponse.redirect(url, { status: 303 }) : back
}
