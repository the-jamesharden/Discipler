import type { SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'

/**
 * Every page function answers as an Admin, checked in one loop.
 *
 * A page function names the definer functions it composes inside its body, and
 * Postgres records no dependency for a name in a body: a later migration that
 * drops or re-signatures `roster` applies cleanly, and `roster_page` fails at
 * its first call. That is true of a `language sql` body too, whose creation-time
 * check never runs again. So this loop finds every page function by the naming
 * rule the migration states -- ends in `_page`, plus `signed_in_admin` -- and
 * executes each once as a signed-in Admin, which is the one condition under which
 * the statement that names the callees is reached: every page function returns
 * the verdict alone for anybody else, and a statement that is not reached is not
 * parsed. A call with no session is a green light that proves the function
 * exists and nothing more, which is why the loop asserts `session = 'admin'` on
 * every answer rather than only the absence of an error.
 *
 * The loop is a naming rule and not a list, so it stays complete as pages are
 * added without anyone extending it. The same fact means it executes whatever
 * somebody names `_page` in a year, so it runs inside one transaction that is
 * rolled back, and it refuses to pass over an empty set: a wrong schema or a
 * drifted convention must be a failure, not a run that checked nothing.
 *
 * Two things ride along because the loop can reach them and nothing else on
 * production can. No page function may be executable by `anon`, which the hosted
 * platform grants by default and which has drifted before. And the direct
 * connection bypasses PostgREST, so one call through the API afterwards proves
 * its schema cache has seen the new functions.
 *
 * Run as a test after every `db reset` and, by hand, against production after
 * `supabase db push` and before the merge (`scripts/smoke-pages.ts`).
 */

export interface PagesSmoked {
  /** Every page function that answered, in name order. */
  readonly checked: readonly string[]
  /** The Ministry the API said the session administers. */
  readonly ministryName: string
}

interface HeldSession {
  readonly userId: string
  readonly sessionId: string
}

/**
 * Whose session a signed-in client holds, read off its own token: the two
 * claims `auth.uid()` and `session_is_live()` read.
 */
const heldSessionOf = async (client: SupabaseClient): Promise<HeldSession> => {
  const { data, error } = await client.auth.getSession()
  if (error) throw new Error(`Could not read the session to smoke the pages with: ${error.message}`)
  const token = data.session?.access_token
  if (!token) throw new Error('The client handed in holds no session; the loop needs a signed-in Admin')

  const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
    readonly sub?: string
    readonly session_id?: string
  }
  if (!claims.sub || !claims.session_id) {
    throw new Error('The session token names no subject or no session id')
  }
  return { userId: claims.sub, sessionId: claims.session_id }
}

interface PageFunction {
  readonly name: string
  readonly arg_types: readonly string[]
  readonly anon_may_execute: boolean
}

/**
 * A throwaway value for one argument, so a function with a parameter is still
 * exercised. A text argument is passed as null: the one page function that takes
 * one, `materials_page(gender)`, carries it for the edge log and reads nothing off
 * it, and null is what a page loaded with no filter sends.
 */
const throwawayFor = (fn: string, type: string): string => {
  if (type === 'uuid') return 'gen_random_uuid()'
  if (type === 'text') return 'null::text'
  throw new Error(`${fn} takes a ${type}, and the loop knows no throwaway value for that type`)
}

/**
 * Executes every page function once as the held session, in one transaction
 * that is rolled back, and raises on the first that does not answer `admin`.
 */
const everyPageFunctionAnswers = async (
  databaseUrl: string,
  session: HeldSession,
): Promise<readonly string[]> => {
  const db = new pg.Client({ connectionString: databaseUrl })
  await db.connect()

  try {
    await db.query('begin')

    const { rows: functions } = await db.query<PageFunction>(`
      select p.proname as name,
             array(select format_type(t, null) from unnest(p.proargtypes::oid[]) as t) as arg_types,
             has_function_privilege('anon', p.oid, 'execute') as anon_may_execute
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (p.proname like '%\\_page' or p.proname = 'signed_in_admin')
       order by p.proname
    `)

    if (functions.length === 0) {
      throw new Error(
        'No page functions were found: nothing in public ends in _page, so nothing was checked',
      )
    }

    const open = functions.filter((f) => f.anon_may_execute).map((f) => f.name)
    if (open.length > 0) {
      throw new Error(`Executable by anon, which no page function may be: ${open.join(', ')}`)
    }

    await db.query('set local role authenticated')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: session.userId, role: 'authenticated', session_id: session.sessionId }),
    ])

    for (const fn of functions) {
      if (!/^[a-z_]+$/.test(fn.name)) throw new Error(`A page function is named oddly: ${fn.name}`)
      const args = fn.arg_types.map((type) => throwawayFor(fn.name, type)).join(', ')

      let doc: unknown
      try {
        const { rows } = await db.query<{ doc: unknown }>(`select public.${fn.name}(${args}) as doc`)
        doc = rows[0]?.doc
      } catch (error) {
        throw new Error(`${fn.name} did not answer: ${(error as Error).message}`)
      }

      const verdict =
        doc !== null && typeof doc === 'object' && !Array.isArray(doc)
          ? (doc as { session?: unknown }).session
          : undefined
      if (verdict !== 'admin') {
        throw new Error(
          `${fn.name} answered ${JSON.stringify(verdict)} rather than admin, so the statement that names its callees was never reached`,
        )
      }
    }

    return functions.map((f) => f.name)
  } finally {
    await db.query('rollback').catch(() => undefined)
    await db.end()
  }
}

/** One call through PostgREST as the same session, so the API's schema cache is proven to see the functions. */
const theApiSeesThem = async (client: SupabaseClient): Promise<string> => {
  const { data, error } = await client.rpc('signed_in_admin')
  if (error) throw new Error(`The API could not answer signed_in_admin: ${error.message}`)

  const doc = data as { session?: unknown; admin?: { ministry_name?: unknown } } | null
  if (doc?.session !== 'admin') {
    throw new Error(`The API answered ${JSON.stringify(doc?.session)} rather than admin`)
  }
  return typeof doc.admin?.ministry_name === 'string' ? doc.admin.ministry_name : 'an unnamed Ministry'
}

/**
 * The whole check: every page function executed as the Admin the client is
 * signed in as, rolled back, then one call through the API.
 */
export const smokeThePages = async (
  databaseUrl: string,
  admin: SupabaseClient,
): Promise<PagesSmoked> => {
  const session = await heldSessionOf(admin)
  const checked = await everyPageFunctionAnswers(databaseUrl, session)
  const ministryName = await theApiSeesThem(admin)
  return { checked, ministryName }
}
