# 01 - Operator-only tables and the coverage test

**What to build:** Every table in `public` is either church-scoped or on an explicit operator-only list, and `tests/integration/rls-coverage.test.ts` proves it.

**Blocked by:** nothing

**Status:** ready-for-agent

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
