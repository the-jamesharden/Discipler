# 01 - Operator-only tables and the coverage test

**What to build:** Every table in `public` is either church-scoped or on an explicit operator-only list, and `tests/integration/rls-coverage.test.ts` proves it.

**Blocked by:** nothing

**Status:** shipped

## Why

The coverage test only finds tables named `ministry` or carrying a `ministry_id` column.
This launch adds tables that belong to no single church: pending sign-ups, referrals and the Stripe event inbox.
Without this ticket, a `SELECT` grant to `authenticated` on one of them would fail no test.

## The rule

- A church-scoped table keeps today's checks: RLS enabled and forced, and isolation by `app.is_member_of`.
- An operator-only table follows the `ministry_setup` shape: RLS forced, no policies, and every grant revoked from `anon`, `authenticated`, `service_role` and `discipler_command`.
- A column that names a church on an operator-only table is not called `ministry_id`.
- A table that is neither fails the test with its name.

## Acceptance

- The test lists every table in `public` and fails on one that is neither church-scoped nor on the operator-only list.
- Each operator-only table is asserted to have RLS forced and zero grants to the four roles.
- `ministry_setup` passes as operator-only with no change to it.
- Adding a scratch table with a grant to `authenticated` makes the test fail.

## Comments

### Built (2026-10-31)

The operator-only list is one exported constant, `OPERATOR_ONLY_TABLES` in `src/platform/supabase/operator-only-tables.ts`, holding `['ministry_setup']`.
A later change adds a table by appending its name there, in the same change as the migration that creates it in the `ministry_setup` shape.
`tests/integration/rls-coverage.test.ts` gains a `coverageViolations` check and a `every table in public` suite.
It lists every relation in `public` and returns one line per thing wrong, naming the table.
A table that is neither church-scoped (`ministry`, or a `ministry_id` column) nor in the list fails, and the message points at the file holding the list.
A listed table must have row-level security enabled and forced, carry no policy, and give `anon`, `authenticated`, `service_role` and `discipler_command` no privilege at all.
A listed name that carries `ministry_id`, or that is no table in `public`, fails.
`ministry_setup` passes unchanged, and every other table today is church-scoped, so nothing was found that is neither.
Nine probes each create a scratch relation inside a transaction that is rolled back and ask the same check about it: a new table granted to `authenticated` and on no list, an operator-only table granted `SELECT` to `authenticated`, a single-column grant, RLS not forced, a policy, a `ministry_id` column, a listed name with no table, a view, and the passing `ministry_setup` shape.
They were run red against a stubbed check (eight failed on their assertions) before the check was written.

### Decisions

- The ticket's "isolation by `app.is_member_of`" for church-scoped tables is kept as today's checks (RLS enabled and forced, at least one policy), not a literal search for `app.is_member_of`.
  Most policies isolate by `app.is_admin_of`, `app.command_ministry_id`, `app.leads_*` or `auth.uid()`, so a literal check would fail nearly every table.
  The alternative, checking each policy against a set of known scoping functions, is a separate hardening.
- Grants are checked as effective privileges (`has_table_privilege` and `has_column_privilege`), not as grant rows, so a grant through `PUBLIC`, through role membership, or on one column all fail.
  The alternative, reading `information_schema.role_table_grants`, misses column grants.
- A view, materialized view or foreign table in `public` fails as neither, because row-level security does not police it; none exists today.
  The alternative was to cover tables only, which would let a view over an operator-only table be granted to `authenticated` unnoticed.
- The church-scoped suite now also finds partitioned tables (`relkind` `p`), not only plain ones; none exists today.
- The list lives in `src/platform/supabase/` beside the adapters that know the schema, not in `tests/support/`, so a migration author finds it next to `ministry-setup.ts`.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2).
