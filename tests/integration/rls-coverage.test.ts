import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OPERATOR_ONLY_TABLES } from '~/platform/supabase/operator-only-tables'
import { localSupabase } from '../support/local-supabase'

/**
 * Row-level security scopes every ministry-owned table -- not just the ones that
 * existed when the policies were first written. A later ticket adding a table with
 * a `ministry_id` and forgetting its policy is exactly the silent failure this
 * checks for, so these tests are derived from the live schema rather than from a
 * hand-maintained list.
 *
 * A table with no `ministry_id` is found too, further down: the few that belong
 * to no church are named in `OPERATOR_ONLY_TABLES` and held to a shape of their
 * own, and any other is a failure that names it.
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
         and c.relkind in ('r', 'p')
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
      'billing_event',
      'checkin_prompt',
      'checkin_sequence',
      'church_plant_application',
      'church_signup',
      'concern',
      'concern_viewing',
      'consent_record',
      'discipleship_goal',
      'follow_up_item',
      'held_import_row',
      'held_short_name',
      'intake_answer',
      'intake_availability',
      'intake_form_version',
      'intake_link',
      'intake_submission',
      'intended_pairing',
      'invitation',
      'keyword_exchange',
      'material',
      'material_assignment',
      'material_item',
      'material_link',
      'material_notice',
      'ministry',
      'ministry_billing',
      'ministry_event',
      'ministry_member',
      'outbound_message',
      'person',
      'person_opt_out',
      'person_removal',
      'referral_code',
      'relationship',
      'relationship_member',
      'sending_number_assignment',
      'support_submission',
      'trial_opening',
      'whats_new_dismissal',
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
         and table_name in ('ministry_event', 'billing_event')
         and privilege_type in ('UPDATE', 'DELETE')
         and grantee <> 'postgres'
    `)

    expect(rows).toEqual([])
  })
})

// The roles a request can arrive as, and the one a command drops into. None may
// touch an operator-only table: the trusted connection the operator's commands
// run on is the only thing that reads or writes one.
const API_ROLES = ['anon', 'authenticated', 'service_role', 'discipler_command']

interface RelationFacts {
  name: string
  kind: string
  church_scoped: boolean
  rls_enabled: boolean
  rls_forced: boolean
  policy_count: number
  access: string[]
}

/**
 * Every relation in `public`, held to one of two shapes. A table is church-scoped
 * -- `ministry`, or carrying a `ministry_id`, which the suite above holds to its
 * policies -- or it is named in `OPERATOR_ONLY_TABLES` and shut to every API role
 * the way `ministry_setup` is. A table that is neither is the silent failure: a
 * pending sign-up or a Stripe event granted to `authenticated` would otherwise
 * fail nothing, because nothing above would even find it.
 *
 * Returns one line per thing wrong, naming the table, so a failure says what to
 * fix. Takes the list as an argument so the probes below can name a scratch table
 * as operator-only without touching the real list.
 */
const coverageViolations = async (
  db: pg.Pool | pg.PoolClient,
  operatorOnly: readonly string[],
): Promise<string[]> => {
  // Effective privileges rather than the grant rows, so a grant through PUBLIC,
  // through a role one of these is a member of, or on a single column all count.
  const { rows } = await db.query<RelationFacts>(
    `
    select c.relname                                  as name,
           case c.relkind
             when 'v' then 'view'
             when 'm' then 'materialized view'
             when 'f' then 'foreign table'
             else 'table'
           end                                        as kind,
           c.relname = 'ministry'
             or exists (
               select 1 from pg_attribute a
                where a.attrelid = c.oid
                  and a.attname = 'ministry_id'
                  and a.attnum > 0
                  and not a.attisdropped
             )                                        as church_scoped,
           c.relrowsecurity                           as rls_enabled,
           c.relforcerowsecurity                      as rls_forced,
           (select count(*)::int
              from pg_policy p
             where p.polrelid = c.oid)                as policy_count,
           array(
             select r.role || ' ' || p.privilege
               from unnest($1::text[]) as r(role)
              cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                                      'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'])
                      as p(privilege)
              where has_table_privilege(r.role, c.oid, p.privilege)
             union all
             select r.role || ' ' || p.privilege || ' (' || a.attname || ')'
               from unnest($1::text[]) as r(role)
              cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'])
                      as p(privilege)
               join pg_attribute a
                 on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
              where has_column_privilege(r.role, c.oid, a.attnum, p.privilege)
                and not has_table_privilege(r.role, c.oid, p.privilege)
             order by 1
           )                                          as access
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
     order by c.relname
    `,
    [API_ROLES],
  )

  const violations: string[] = []

  for (const relation of rows) {
    const { name } = relation
    const listed = operatorOnly.includes(name)

    if (relation.kind !== 'table') {
      violations.push(
        `${name}: a ${relation.kind}, which row-level security does not police, so it can be neither church-scoped nor operator-only`,
      )
    } else if (relation.church_scoped) {
      if (listed) {
        violations.push(
          `${name}: named in OPERATOR_ONLY_TABLES but carries ministry_id, which promises a policy scoping it to one church`,
        )
      }
    } else if (!listed) {
      violations.push(
        `${name}: neither church-scoped (no ministry_id) nor named in OPERATOR_ONLY_TABLES (src/platform/supabase/operator-only-tables.ts)`,
      )
    } else {
      if (!relation.rls_enabled) violations.push(`${name}: row-level security is not enabled`)
      if (!relation.rls_forced) violations.push(`${name}: row-level security is not forced`)
      if (relation.policy_count > 0) {
        violations.push(
          `${name}: carries ${relation.policy_count} ${relation.policy_count === 1 ? 'policy' : 'policies'}, where an operator-only table carries none`,
        )
      }
      if (relation.access.length > 0) violations.push(`${name}: grants ${relation.access.join(', ')}`)
    }
  }

  const present = new Set(rows.map((relation) => relation.name))
  for (const name of operatorOnly) {
    if (!present.has(name)) {
      violations.push(`${name}: named in OPERATOR_ONLY_TABLES but there is no such table in public`)
    }
  }

  return violations
}

describe('every table in public', () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  it('is church-scoped, or operator-only and shut to every API role', async () => {
    expect(await coverageViolations(pool, OPERATOR_ONLY_TABLES)).toEqual([])
  })

  /**
   * The check above passing proves nothing unless it can fail. Each probe makes a
   * scratch relation inside a transaction that is rolled back, so the schema every
   * other suite sees is never changed, and asks the same check about it.
   */
  describe('fails', () => {
    const probe = async (ddl: string, operatorOnly: readonly string[]): Promise<string[]> => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        if (ddl) await client.query(ddl)
        return await coverageViolations(client, operatorOnly)
      } finally {
        await client.query('rollback').catch(() => undefined)
        client.release()
      }
    }

    // The `ministry_setup` shape, on a table nothing else will ever be called.
    const SHUT = `
      create table coverage_probe (id int);
      alter table coverage_probe enable row level security;
      alter table coverage_probe force  row level security;
      revoke all on coverage_probe from anon, authenticated, service_role, discipler_command;
    `
    const listed = [...OPERATOR_ONLY_TABLES, 'coverage_probe']

    it('on a new table granted to authenticated that is on no list, naming it', async () => {
      const violations = await probe(
        `create table coverage_probe (id int);
         grant select on coverage_probe to authenticated;`,
        OPERATOR_ONLY_TABLES,
      )

      expect(violations).toEqual([
        'coverage_probe: neither church-scoped (no ministry_id) nor named in OPERATOR_ONLY_TABLES (src/platform/supabase/operator-only-tables.ts)',
      ])
    })

    it('on an operator-only table granted to authenticated', async () => {
      const violations = await probe(
        `${SHUT} grant select on coverage_probe to authenticated;`,
        listed,
      )

      expect(violations).toEqual(['coverage_probe: grants authenticated SELECT'])
    })

    it('on an operator-only table with a grant on one column', async () => {
      const violations = await probe(`${SHUT} grant select (id) on coverage_probe to anon;`, listed)

      expect(violations).toEqual(['coverage_probe: grants anon SELECT (id)'])
    })

    it('on an operator-only table whose row-level security is not forced', async () => {
      const violations = await probe(
        `${SHUT} alter table coverage_probe no force row level security;`,
        listed,
      )

      expect(violations).toEqual(['coverage_probe: row-level security is not forced'])
    })

    it('on an operator-only table that carries a policy', async () => {
      const violations = await probe(
        `${SHUT} create policy coverage_probe_read on coverage_probe
                   for select to authenticated using (true);`,
        listed,
      )

      expect(violations).toEqual([
        'coverage_probe: carries 1 policy, where an operator-only table carries none',
      ])
    })

    it('on an operator-only table whose church column is called ministry_id', async () => {
      const violations = await probe(
        `${SHUT} alter table coverage_probe add column ministry_id uuid;`,
        listed,
      )

      expect(violations).toEqual([
        'coverage_probe: named in OPERATOR_ONLY_TABLES but carries ministry_id, which promises a policy scoping it to one church',
      ])
    })

    it('on a name in the list that is no table', async () => {
      expect(await probe('', listed)).toEqual([
        'coverage_probe: named in OPERATOR_ONLY_TABLES but there is no such table in public',
      ])
    })

    it('on a view, which row-level security does not police', async () => {
      const violations = await probe('create view coverage_probe as select 1 as x;', OPERATOR_ONLY_TABLES)

      expect(violations).toEqual([
        'coverage_probe: a view, which row-level security does not police, so it can be neither church-scoped nor operator-only',
      ])
    })

    it('on nothing, for a table in the ministry_setup shape once it is named', async () => {
      expect(await probe(SHUT, listed)).toEqual([])
    })
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
    await expect(pool.query('truncate table billing_event')).rejects.toThrow(/append-only/)
  })
})
