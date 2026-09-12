# 01 - The page functions

**What to build:** One migration, `supabase/migrations/20260926000100_a_page_is_one_read.sql`, defining the nine `jsonb` page functions in `spec.md` and the `app`-schema helpers they share, with the session verdict first, `security invoker` throughout, and the three-role revoke on each.
One integration test file per public function under `tests/integration/`, named for what it proves, driving the function through a signed-in client.

**Blocked by:** nothing

**Status:** claimed

## Acceptance

- Each function returns the same rows the page's separate reads return today, keyed as the spec says.
- A revoked session reads `signed-out` and no ministry data; a Leader who administers nothing reads `not-an-admin` and no ministry data; `anon` cannot execute any of them; an Admin of Ministry B sees nothing of Ministry A.
- `supabase db reset` applies cleanly and the RLS coverage suite still passes.

## Comments

Done on 2026-09-12.
`supabase/migrations/20260926000100_a_page_is_one_read.sql` defines the nine page functions and three `app`-schema helpers they share: `app.page_session` for the verdict and the Admin, `app.names_of` for the names the `person` policies allow, and `app.history_inputs` for the rows the Overview, Care Needed and Check-Ins all derive from.
`check_ins_page` and `suggested_pairs_page` return the Overview's document, because the badge needs the same history and nothing is built behind Suggested Pairs yet.
Every function is `security invoker` with `search_path = ''`, granted to `authenticated` and revoked from `public`, `anon` and `service_role`.
Five integration files drive them through signed-in clients: `the-admin-tabs-answer-in-one-read`, `the-signed-in-admin-answers-in-one-read`, `the-settings-page-answers-in-one-read`, `the-intake-forms-page-answers-in-one-read` and `the-relationships-page-answers-in-one-read`, each covering the Admin, the Leader who administers nothing, the ended session, the visitor with no session and the Admin of another Ministry.
The decision and its privilege rule are recorded in `docs/adr/0023-a-page-is-one-read.md`.
