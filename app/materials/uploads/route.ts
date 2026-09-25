import { NextResponse, type NextRequest } from 'next/server'
import { readUpload } from '~/domain/materials'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { mintUploadAddress } from '~/platform/supabase/material-files'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { uploadRefusal } from '../copy'

/**
 * Where the browser sends one file an Admin chose on the create or edit page
 * (Richer materials, ticket 01). The file never comes here: this answers with a
 * one-time address in the Ministry's folder, and the browser sends the bytes
 * straight to Storage, because a hosted function refuses a body over a few
 * megabytes.
 *
 * The name and size the browser gives are checked first, so an Admin who chose
 * a 200 MB video is told at once rather than after it has uploaded. They are
 * the browser's word, and the save route checks again against what Storage
 * says it holds.
 */
export async function POST(request: NextRequest) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.json({ refused: 'Sign in as an Admin to add files.' }, { status: 403 })

  const asked = (await request.json().catch(() => null)) as {
    filename?: unknown
    bytes?: unknown
  } | null
  const filename = typeof asked?.filename === 'string' ? asked.filename : ''
  const bytes = typeof asked?.bytes === 'number' ? asked.bytes : Number.NaN
  if (filename.trim() === '' || !Number.isFinite(bytes) || bytes < 0) {
    return NextResponse.json({ refused: 'That file could not be read.' }, { status: 400 })
  }

  const refusal = readUpload({ filename, bytes })
  if (refusal) {
    return NextResponse.json({ refused: uploadRefusal(refusal, filename) }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const address = await mintUploadAddress(supabase, admin.ministryId, filename)
  return NextResponse.json(address)
}
