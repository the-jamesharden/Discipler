import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { smokeThePages } from '~/platform/supabase/every-page-function-answers'
import { createMinistryWithAdmin, localSupabase, signInAs } from '../support/local-supabase'

/**
 * The smoke loop over every page function, and the three ways it must fail.
 *
 * The loop is the guard against a hazard the migration cannot see: a page
 * function names its callees at runtime, so a later migration that drops one
 * applies cleanly and the page fails at first click. The first case proves the
 * loop finds every page function by name and gets `admin` from each. The other
 * three plant a function that matches the naming rule and is wrong in one of the
 * ways the loop exists to catch -- executable by anon, naming a callee that is
 * gone, and returning before the statement that names its callees -- and prove
 * the loop refuses each rather than passing over it.
 */

const PAGE_FUNCTIONS = [
  'check_ins_page',
  'follow_up_page',
  'intake_forms_page',
  'material_page',
  'materials_page',
  'new_material_page',
  'overview_page',
  'pair_page',
  'person_page',
  'relationships_page',
  'roster_page',
  'settings_page',
  'signed_in_admin',
  'suggested_pairs_page',
]

describe('every page function answers', () => {
  let pool: pg.Pool
  let databaseUrl: string

  beforeAll(async () => {
    databaseUrl = localSupabase().databaseUrl
    pool = new pg.Pool({ connectionString: databaseUrl })
  })

  afterAll(async () => {
    await pool.query(`
      drop function if exists public.decoy_page();
      drop function if exists public.broken_page();
      drop function if exists public.silent_page();
    `)
    await pool.end()
  })

  it('executes every page function as an Admin and the API sees them', async () => {
    const ministry = await createMinistryWithAdmin('Riverside Chapel')

    const smoked = await smokeThePages(databaseUrl, await signInAs(ministry))

    expect(smoked.checked).toEqual(PAGE_FUNCTIONS)
    expect(smoked.ministryName).toBe('Riverside Chapel')
  })

  it('refuses a page function that anon may execute', async () => {
    const ministry = await createMinistryWithAdmin('Northgate Community Church')
    await pool.query(`
      create function public.decoy_page() returns jsonb language sql stable security invoker
        set search_path = '' as $$ select public.signed_in_admin(); $$;
      grant execute on function public.decoy_page() to anon;
    `)

    try {
      await expect(smokeThePages(databaseUrl, await signInAs(ministry))).rejects.toThrow(
        /Executable by anon.*decoy_page/,
      )
    } finally {
      await pool.query('drop function public.decoy_page()')
    }
  })

  it('refuses a page function whose callee is gone', async () => {
    const ministry = await createMinistryWithAdmin('Hillside Fellowship')

    // The body names a function that does not exist. The migration would apply
    // this cleanly: a plpgsql body is parsed statement by statement on first
    // execution, and nothing checks the name before then.
    await pool.query(`
      create function public.broken_page() returns jsonb language plpgsql stable security invoker
        set search_path = '' as $$
        declare doc jsonb := app.page_session();
        begin
          if doc ->> 'session' <> 'admin' then return doc; end if;
          return doc || jsonb_build_object('gone', public.a_function_that_was_dropped());
        end; $$;
      revoke execute on function public.broken_page() from public, anon, service_role;
      grant execute on function public.broken_page() to authenticated;
    `)

    try {
      await expect(smokeThePages(databaseUrl, await signInAs(ministry))).rejects.toThrow(
        /broken_page did not answer.*a_function_that_was_dropped/,
      )
    } finally {
      await pool.query('drop function public.broken_page()')
    }
  })

  it('refuses a page function that returns before naming its callees', async () => {
    const ministry = await createMinistryWithAdmin('Lakeside Church')

    // Answers signed-out to everybody. Nothing errors, and the statement that
    // would name the callees is never reached, so "no error" is no guard: the
    // verdict is what the loop must insist on.
    await pool.query(`
      create function public.silent_page() returns jsonb language sql stable security invoker
        set search_path = '' as $$ select jsonb_build_object('session', 'signed-out'); $$;
      revoke execute on function public.silent_page() from public, anon, service_role;
      grant execute on function public.silent_page() to authenticated;
    `)

    try {
      await expect(smokeThePages(databaseUrl, await signInAs(ministry))).rejects.toThrow(
        /silent_page answered "signed-out" rather than admin/,
      )
    } finally {
      await pool.query('drop function public.silent_page()')
    }
  })
})
