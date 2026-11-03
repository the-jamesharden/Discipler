import { NextResponse } from 'next/server'
import { getSearchReader } from '~/service/container'
import { searchNames } from './names'

export const dynamic = 'force-dynamic'

/**
 * The names behind search (Exponential launch, ticket 24), read when an Admin opens it
 * and at no other time, so a page that is only looked at makes no extra call.
 *
 * One read through the signed-in Admin's session, like every page, and never kept by
 * anything between here and their browser: it is a church's names.
 */
const PRIVATE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const page = await getSearchReader().readSearchPage()

  if (page.status === 'signed-out') {
    return NextResponse.json({ refused: 'signed-out' }, { status: 401, headers: PRIVATE })
  }
  if (page.status === 'not-an-admin') {
    return NextResponse.json({ refused: 'not-an-admin' }, { status: 403, headers: PRIVATE })
  }

  return NextResponse.json(searchNames(page.page, page.admin.personId, new Date()), {
    headers: PRIVATE,
  })
}
