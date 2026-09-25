import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { materialId, materialItemId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * `material.pdf_path` while it still stands (Richer materials, ticket 01).
 *
 * The migration is pushed before its code merges, so for a while the code that
 * only knows the old column is still serving Admins against the new tables. What
 * it writes has to land as items, and what the new code does to an item that was
 * the old PDF has to reach the column, or the two disagree: a PDF replaced in
 * that window invisible after the merge, a removed one still counted as content,
 * and the migration that finally drops the column resurrecting a file an Admin
 * deleted. The writes below are the old code's own statements, on the command
 * connection's role.
 */
describe('the old PDF column, kept in step with the items', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let store: ReturnType<typeof createPostgresEffectStore>

  const ids: IdSource = { next: () => crypto.randomUUID() }

  /** One statement as the code on `main` runs it: the command role, inside this Ministry. */
  const asTheOldCode = async (sql: string, values: unknown[]) => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministry.id])
      const result = await client.query<{ id: string }>(sql, values)
      await client.query('commit')
      return result.rows
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  const uploadAPdf = async (): Promise<string> => {
    const path = `${ministry.id}/${crypto.randomUUID()}.pdf`
    const { error } = await serviceRoleClient()
      .storage.from('material')
      .upload(path, new Blob(['%PDF-1.4 twelve bytes'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      })
    if (error) throw new Error(error.message)
    return path
  }

  const itemsOf = async (material: string) =>
    (
      await pool.query<{ position: number; path: string; filename: string; bytes: string }>(
        `select position, path, filename, bytes from material_item where material_id = $1 order by position`,
        [material],
      )
    ).rows.map((row) => ({ ...row, bytes: Number(row.bytes) }))

  const pdfOf = async (material: string) =>
    (
      await pool.query<{ pdf_path: string | null; pdf_filename: string | null }>(
        `select pdf_path, pdf_filename from material where id = $1`,
        [material],
      )
    ).rows[0]

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    store = createPostgresEffectStore(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  it('makes a PDF the old code creates a Material with into its first item, with its size', async () => {
    const pdf = await uploadAPdf()
    const [made] = await asTheOldCode(
      `insert into material (id, ministry_id, title, body, pdf_path, pdf_filename, created_at)
       values (gen_random_uuid(), $1, 'Galatians', null, $2, 'galatians.pdf', now()) returning id`,
      [ministry.id, pdf],
    )

    expect(await itemsOf(made!.id)).toEqual([
      { position: 0, path: pdf, filename: 'galatians.pdf', bytes: 21 },
    ])
  })

  it('puts a PDF the old code replaces where the old one was, and drops one it removes', async () => {
    const first = await uploadAPdf()
    const material = await addMaterial(ministry, 'Ephesians', {
      body: 'Six weeks.',
      pdfPath: first,
      pdfFilename: 'ephesians.pdf',
      links: [{ url: 'https://bibleproject.com/ephesians' }],
    })
    // The fixture writes items, as the new code does; the old code would have
    // written the column. Both, as a Material migrated from one PDF stands.
    await pool.query(`update material set pdf_path = $2, pdf_filename = 'ephesians.pdf' where id = $1`, [
      material,
      first,
    ])
    expect((await itemsOf(material)).map((item) => item.path)).toEqual([first, null])

    const second = await uploadAPdf()
    await asTheOldCode(
      `update material set title = 'Ephesians', body = 'Six weeks.', pdf_path = $2, pdf_filename = 'ephesians-2.pdf'
        where id = $1`,
      [material, second],
    )
    expect((await itemsOf(material)).map((item) => [item.position, item.path, item.filename])).toEqual([
      [0, second, 'ephesians-2.pdf'],
      [1, null, null],
    ])

    await asTheOldCode(
      `update material set title = 'Ephesians', body = 'Six weeks.', pdf_path = null, pdf_filename = null
        where id = $1`,
      [material],
    )
    expect((await itemsOf(material)).map((item) => item.path)).toEqual([null])
  })

  it('clears the old column when the new code removes the item that was the old PDF', async () => {
    const pdf = await uploadAPdf()
    const [made] = await asTheOldCode(
      `insert into material (id, ministry_id, title, body, pdf_path, pdf_filename, created_at)
       values (gen_random_uuid(), $1, 'Philippians', 'Four weeks.', $2, 'philippians.pdf', now()) returning id`,
      [ministry.id, pdf],
    )
    const [item] = (
      await pool.query<{ id: string }>(`select id from material_item where material_id = $1`, [made!.id])
    ).rows

    await createCommandService({ clock: createTestClock(new Date()), ids, store, appBaseUrl: 'https://discipler.test' })
      .execute({
        type: 'material.edit',
        ministryId: ministry.id,
        materialId: materialId(made!.id),
        title: 'Philippians',
        body: 'Four weeks.',
        removeItems: [materialItemId(item!.id)],
        files: [],
        links: [],
        changedBy: ministry.adminUserId,
      })

    expect(await itemsOf(made!.id)).toEqual([])
    expect(await pdfOf(made!.id)).toEqual({ pdf_path: null, pdf_filename: null })
  })

  it('does not count the old column as content once its item is gone', async () => {
    const pdf = await uploadAPdf()
    const [made] = await asTheOldCode(
      `insert into material (id, ministry_id, title, body, pdf_path, pdf_filename, created_at)
       values (gen_random_uuid(), $1, 'Colossians', null, $2, 'colossians.pdf', now()) returning id`,
      [ministry.id, pdf],
    )

    // The one item, removed on its own: a Material with no text and nothing else.
    await expect(
      pool.query(`delete from material_item where material_id = $1`, [made!.id]),
    ).rejects.toThrow(/material_carries_something/)
  })
})
