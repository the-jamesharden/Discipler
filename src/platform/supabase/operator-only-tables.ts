/**
 * The tables in `public` that belong to no single church.
 *
 * Every other table is church-scoped: it is `ministry` or carries a `ministry_id`,
 * and row-level security isolates it to the Ministry that owns the row. A table
 * here is the other kind -- a row that exists before any Ministry does, or that
 * spans them -- so there is no Ministry to scope a policy to, and nobody but the
 * trusted connection the operator's commands run on may touch it. It takes the
 * shape `ministry_setup` was given in `20260922000100_the_ministry_setup_link.sql`:
 *
 *   alter table <name> enable row level security;
 *   alter table <name> force  row level security;
 *   revoke all on <name> from anon, authenticated, service_role, discipler_command;
 *
 * with no policy at all, and a column naming a church is not called `ministry_id`
 * (that name is the promise of a policy that scopes the row).
 *
 * To add one, put its name in this list in the same change as the migration that
 * creates it. `tests/integration/rls-coverage.test.ts` lists every table in
 * `public`, fails on one that is neither church-scoped nor named here, and holds
 * every name here to that shape.
 */
export const OPERATOR_ONLY_TABLES: readonly string[] = [
  'ministry_setup',
  // Checking an Admin's own phone with Twilio Verify (Exponential launch, ticket 09).
  'phone_check',
  'phone_check_code',
  // The sign-in guessing limit (Exponential launch, ticket 13).
  'sign_in_attempt',
  // The shared numbers and the capacity watch's history (Exponential launch, ticket 06).
  'shared_number',
  'shared_number_capacity_alert',
]
