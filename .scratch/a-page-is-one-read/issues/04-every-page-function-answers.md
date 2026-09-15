# 04 - Every page function answers

**What to build:** One loop that finds every page function by the naming rule (`%_page` in `public`, plus `signed_in_admin`), executes each once as a signed-in Admin inside a transaction it rolls back, asserts each answers `admin`, asserts none is executable by `anon`, refuses an empty set, and makes one call through the API afterwards. It runs as an integration test after every `db reset` and as `npm run smoke:pages` against production after `supabase db push` and before the merge.

**Blocked by:** 01

**Status:** shipped

## Acceptance

- `every-page-function-answers.test.ts` passes, and proves the loop refuses a page function anon may execute, one whose callee is gone, and one that returns before naming its callees.
- `npm run smoke:pages` against production prints the count of functions checked and the Ministry the API answered for.
- The ADR names the hazard, the guard and what the guard does not cover.

## Comments

Raised on 2026-09-12 from the grilling of the design, together with the fault it found: `readPageDocument` sent a request with no token to PostgREST as `anon`, which cannot execute a page function, so every guarded page returned 500 to a visitor instead of redirecting. The reader now answers signed-out from the absence of a verified token before any read (`src/platform/supabase/page.ts`), and the ten over-HTTP files that were red are green.

Written on 2026-09-12: `src/platform/supabase/every-page-function-answers.ts` holds the loop; the test and `scripts/smoke-pages.ts` both call it. The person and Pair pages got `person_page()` and `pair_page()` in the same migration so the naming rule holds without exception. Not verified on this machine: local ports are exhausted (14,075 sockets in TIME_WAIT at 163 days of uptime), so the new test and the full suite need a reboot before they can run. Types are clean.

Verified on 2026-09-12 after the reboot: `every-page-function-answers.test.ts` passed in each of three consecutive full runs at `b423817`; see the verification note on ticket 02.

**2026-09-15, shipped.**
Merged to `main` in PR #10, which carries the `a-page-is-one-read` branch.
