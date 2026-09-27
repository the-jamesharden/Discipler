import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days } from '~/domain/clock'
import { sweepUnsavedUploads } from '~/platform/supabase/material-files'
import {
  addMaterial,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The tick's sweep of files a browser uploaded and no Material came to name
 * (Richer materials, ticket 01). A file is uploaded the moment an Admin chooses
 * it, and the form may never be saved; a day later, if nothing names it, it goes.
 * Nothing a Material names goes, however old, and nothing in another Ministry's
 * folder is touched.
 */
describe('sweeping the uploads nobody saved', () => {
  let ministry: MinistryFixture
  let neighbour: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    neighbour = await createMinistryWithAdmin('The Chapel Next Door')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const put = async (folder: string) => {
    const path = `${folder}/${crypto.randomUUID()}.pdf`
    const { error } = await serviceRoleClient()
      .storage.from('material')
      .upload(path, new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
    if (error) throw new Error(error.message)
    return path
  }

  /** Storage stamps the upload's own time; a day's wait is written back onto the row. */
  const landedDaysAgo = async (path: string, ago: number) => {
    await pool.query(
      `update storage.objects set created_at = now() - make_interval(days => $2) where bucket_id = 'material' and name = $1`,
      [path, ago],
    )
  }

  const inTheBucket = async (folder: string) => {
    const { data, error } = await serviceRoleClient().storage.from('material').list(folder)
    if (error) throw new Error(error.message)
    return (data ?? []).map((object) => `${folder}/${object.name}`)
  }

  it('deletes an old file nothing names, and keeps a named one, a fresh one and another Ministry’s', async () => {
    const named = await put(ministry.id)
    const abandoned = await put(ministry.id)
    const fresh = await put(ministry.id)
    const theirs = await put(neighbour.id)
    await addMaterial(ministry, 'Galatians', { body: null, files: [{ path: named, filename: 'galatians.pdf' }] })
    for (const path of [named, abandoned, theirs]) await landedDaysAgo(path, 3)

    const swept = await sweepUnsavedUploads(ministry.id, createTestClock(new Date()))

    expect(swept).toBe(1)
    const left = await inTheBucket(ministry.id)
    expect(left).toContain(named)
    expect(left).toContain(fresh)
    expect(left).not.toContain(abandoned)
    expect(await inTheBucket(neighbour.id)).toContain(theirs)
  })

  it('leaves a file alone until a full day has passed', async () => {
    const recent = await put(ministry.id)
    // A day less a minute after Storage stamped it, read off its own row. Storage
    // stamps with the database container's clock, which on a loaded host has been
    // seen more than a minute behind this process (the whole suite three times, on
    // 2026-09-25), and then a day counted from `Date.now()` had already passed for
    // this file and for the fresh one the test above left beside it.
    const { rows } = await pool.query<{ created_at: Date }>(
      `select created_at from storage.objects where bucket_id = 'material' and name = $1`,
      [recent],
    )
    const clock = createTestClock(new Date(rows[0]!.created_at.getTime() + days(1) - 60_000))
    expect(await sweepUnsavedUploads(ministry.id, clock)).toBe(0)
    expect(await inTheBucket(ministry.id)).toContain(recent)
  })
})
