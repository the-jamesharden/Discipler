# Spec: A page is one read

Status: ready-for-agent

Raised by James on 2026-09-11 after a day of measuring production.
His words: collapse each page into one rpc.

## Problem Statement

Every signed-in page pays for its data as a chain of PostgREST round trips from the Vercel function to Supabase.
Resolving the signed-in Admin is three calls in a row on every page, the Overview is eight stages deep, the Roster is thirteen, and the Admin shell re-reads the whole Care Needed list on three tabs only to number the Follow-Up badge.
Each round trip costs 30 to 130 ms from iad1 to ca-central-1 while Postgres executes the statement in 2 to 27 ms, so a warm click is 0.6 to 1.0 s of waiting on the network and nothing else.
The same shape hurts twice: a click after a quiet minute fires five to ten parallel calls, which is the burst that stalls the Supabase origin for seconds (measured on both the production and the prototype project on 2026-09-11).
The inventory of every call, per page, is in `issues/00-the-inventory.md`.

## Solution

Each signed-in page asks the database one question and gets one document back.
A SQL function per page composes exactly the reads the page makes today, including who is signed in and whether their session is still held, and returns them as one `jsonb` value.
The TypeScript readers keep every parsing rule, every derivation and every domain function they have now; they read rows out of the document instead of out of separate responses.
The Admin shell's badge is handed in by every page from the same document, so the shell never reads on its own again.

Nothing about what a page shows changes, and nothing about who may see it changes.

## The rule that keeps access unchanged

Every page function is `security invoker`.
Inside it, a table is read under the same row-level policies as today, and an existing `security definer` function is called as it is called today, so it keeps its own gate.
A page function adds no privilege: it is a batching of reads that were each already allowed to the caller, and a read that would have come back empty still comes back empty.
It is granted to `authenticated` and revoked from `public`, `anon` and `service_role`, the three-role revoke `session_is_live` established.

A page function answers for the session first.
If `public.session_is_live()` is false the document says `signed-out` and carries no ministry data, so a revoked session cannot read a page through a token that still verifies (`docs/adr/0016-a-password-change-ends-every-session.md`).
If the session administers no Ministry the document says `not-an-admin` and carries no ministry data.
Otherwise the document names the Admin the way `resolveAdmin` does today: the earliest `admin` membership by `created_at`, the Ministry's name, and the Admin's own row on the Roster or null.

## The functions

All in `public`, all arg-less unless stated, all returning `jsonb`, all `stable`, `security invoker`, `set search_path = ''`.

- `signed_in_admin()`: the session verdict and the Admin alone. For `/`, `/account`, and any page that needs nothing else.
- `overview_page()`: the Admin, the Ministry's timezone, the relationship rows, and the history inputs the Overview and Care Needed both derive from (memberships, names, weeks, concerns, pauses, answers, open follow-up items with their people and relationship dates).
- `check_ins_page()`: the Admin, the timezone, the week answers and memberships, and the Care Needed inputs for the badge.
- `suggested_pairs_page()`: the Admin and the Care Needed inputs for the badge.
- `follow_up_page(reveal_person_id uuid default null)`: the Admin, the Care Needed inputs, and the contact to share for the one Person a reveal names, or null.
- `roster_page()`: the Admin, the roster rows, the open memberships, the relationships they name, the intended pairings, the held import rows, and the Care Needed inputs.
- `person_page()` and `pair_page()`: the Roster's document under the person page's and the Pair page's own names.
- `relationships_page()`: the session verdict, the Admin or null, and everything the Leader Dashboard reads: the caller's own Person rows, the leaderships, the members of those relationships, the Ministry names, material periods and pauses per Ministry, names, availability per relationship, material bodies, and the contact to share for every person in every relationship. A signed PDF URL is the one thing that stays a separate call, and only when a material carries a PDF.
- `settings_page()`: the Admin and the Ministry settings row.
- `intake_forms_page()`: the Admin, the groups, the open join requests, the Discipleship Goal options, and the names of the people the query string may refer to.

The document is keyed by the read it replaces so a reader's parsing moves without changing: the same columns, the same names, the same nulls.

## What the TypeScript does

- `resolveAdmin()` reads `signed_in_admin()` once. It keeps its three answers.
- Each reader in `src/platform/supabase/` splits into a pure part that derives from a document and a thin part that fetches the document. The pure part carries the field-by-field checking the readers already do; a document that lacks a key the page needs is raised, not read as empty, for the reason the readers already give.
- `relationship-history.ts` keeps its helpers but takes rows rather than a client.
- Every Admin tab passes `followUpCount` to `AdminShell`; the shell's fallback read is removed, so the badge cannot be a second read again.
- Pages call one reader and get the session verdict and the data together, so the page does not resolve the Admin and then read.
- The domain and the ports keep their shapes where a shape is public; a port whose only purpose was to be called after `resolveAdmin` becomes a page reader.

## Tests

- One integration file per page function, driven with a signed-in client the way `the-overview.test.ts` drives `readOverview`: an Admin gets a document whose rows equal the individual reads; a Leader who administers nothing gets `not-an-admin` and no ministry data; an ended session gets `signed-out`; a signed-out visitor cannot execute it at all; an Admin of one Ministry sees nothing of another.
- The existing direct reader tests keep passing through the new readers. `the-overview.test.ts` asserts isolation by signing in as another Ministry's Admin and checking that none of the first Ministry's rows appear, because a page function answers for the session's own Ministry rather than for a Ministry id the caller names.
- The over-HTTP suites are the proof that nothing on a screen changed.

## Acceptance

- A warm signed-in page makes one PostgREST call, two when a material PDF needs a signed URL, verified by counting `/rest/v1/` calls in the local PostgREST log while loading each page once.
- A request with no token or a junk token is answered signed-out with no read, and redirects to sign in rather than failing.
- Every over-HTTP suite and every existing test passes, including `every-page-function-answers.test.ts`.
- On production, after `supabase db push` and the deploy, the Supabase edge log shows one `/rest/v1/rpc/*_page` call per page load.
- On production, a warm signed-in page is under 200 ms of server time, read as the Vercel function duration for the page route, measured the afternoon of the deploy the way 2026-09-11 was measured. If a warm page is still slow with one call, this ticket says so and names the quiet-minute stall as the next problem rather than being judged by it.
- On production, the largest page document is measured as the RPC response body in the edge log and the number is written into `issues/02-the-admin-tabs-read-once.md`. Over 256 KB, the next ticket bounds the history to the window Care Needed derives from.

## Deploy order

The migration is pushed to production before the code is merged: the old code calls none of the new functions, so the push is safe, and the new code cannot run without them.
Immediately after the push and before the merge, `npm run smoke:pages` is run against production as the test Ministry's Admin; it executes every page function once and asserts each answers, so a broken callee is fixed or reverted while nothing new has shipped.
A change to a page function is additive within one change; a key is removed only in a following migration, after the code that stopped reading it is live.

## Settled

- The person page and the Pair page read the Roster's document under names of their own, `person_page()` and `pair_page()`; a single-Person reader is a later refinement, not this ticket.
- A request with no verified token is answered signed-out by the reader before any read; the document's `signed-out` is for a token that verifies but names a session that has ended. A page function is executable by a signed-in role only, so a visitor's request would be refused at the door, and a refusal is not a verdict.
- SQL batches and TypeScript derives. The badge's over-fetch on the thin tabs is accepted and measured; a large document is answered by bounding the history, never by a count in SQL.
- The Roster's memberships appear under both `history` and `roster`, each as the read it replaces; collapsing them is for the single-Person reader refinement.
- The change-password route keeps its own two-part session check and does not read `signed_in_admin`: a route that must never learn about Ministries is not handed a document that names one.
- Migrations stay pushed by hand; ordering a CI push ahead of Vercel's auto-deploy is its own decision.
- A reveal on Follow-Up is an argument of the page function rather than a second call.
- Material PDFs keep a second call for the signed URL; the storage API has no SQL face.
