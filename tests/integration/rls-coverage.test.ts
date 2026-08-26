import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localSupabase } from '../support/local-supabase'

/**
 * Row-level security scopes every ministry-owned table -- not just the ones that
 * existed when the policies were first written. A later ticket adding a table with
 * a `ministry_id` and forgetting its policy is exactly the silent failure this
 * checks for, so these tests are derived from the live schema rather than from a
 * hand-maintained list.
 */

interface TableFacts {
  table_name: string
  rls_enabled: boolean
  rls_forced: boolean
  policy_count: number
}

describe('every ministry-owned table', () => {
  let pool: pg.Pool
  let tables: TableFacts[]

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    const { rows } = await pool.query<TableFacts>(`
      select c.relname                                  as table_name,
             c.relrowsecurity                           as rls_enabled,
             c.relforcerowsecurity                      as rls_forced,
             (select count(*)::int
                from pg_policy p
               where p.polrelid = c.oid)                as policy_count
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and (
           c.relname = 'ministry'
           or exists (
             select 1 from pg_attribute a
              where a.attrelid = c.oid
                and a.attname = 'ministry_id'
                and a.attnum > 0
                and not a.attisdropped
           )
         )
       order by c.relname
    `)

    tables = rows
  })

  afterAll(async () => {
    await pool.end()
  })

  it('is actually discovered by this test', () => {
    expect(tables.map((t) => t.table_name)).toEqual([
      'ministry',
      'ministry_event',
      'ministry_member',
      'outbound_message',
      'person',
    ])
  })

  it('has row-level security enabled', () => {
    const unprotected = tables.filter((t) => !t.rls_enabled).map((t) => t.table_name)

    expect(unprotected, `these tables carry Ministry data with no RLS: ${unprotected}`).toEqual([])
  })

  it('forces row-level security, so the table owner is policed too', () => {
    const unforced = tables.filter((t) => !t.rls_forced).map((t) => t.table_name)

    expect(unforced, `RLS is enabled but not forced on: ${unforced}`).toEqual([])
  })

  it('carries at least one policy, so enabling RLS did not simply deny everything', () => {
    const policyless = tables.filter((t) => t.policy_count === 0).map((t) => t.table_name)

    expect(policyless).toEqual([])
  })

  it('grants a signed-out visitor nothing', async () => {
    const { rows } = await pool.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type
        from information_schema.role_table_grants
       where grantee = 'anon'
         and table_schema = 'public'
    `)

    expect(rows).toEqual([])
  })

  it('grants a signed-in session no way to write', async () => {
    const { rows } = await pool.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type
        from information_schema.role_table_grants
       where grantee = 'authenticated'
         and table_schema = 'public'
         and privilege_type <> 'SELECT'
    `)

    expect(
      rows,
      `browser sessions must not write directly; writes go through the command boundary: ${JSON.stringify(rows)}`,
    ).toEqual([])
  })

  it('never lets history be updated or deleted, by anyone', async () => {
    const { rows } = await pool.query<{ grantee: string; privilege_type: string }>(`
      select grantee, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name = 'ministry_event'
         and privilege_type in ('UPDATE', 'DELETE')
         and grantee <> 'postgres'
    `)

    expect(rows).toEqual([])
  })
})

describe('history', () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  it('cannot be erased by truncating the table', async () => {
    // TRUNCATE is filtered by neither row-level security nor a delete trigger.
    await expect(pool.query('truncate table ministry_event')).rejects.toThrow(/append-only/)
  })
})
