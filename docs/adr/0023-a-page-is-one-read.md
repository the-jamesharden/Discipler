# A Page Is One Read

## Status

accepted

## Decision

**Every signed-in page asks the database one question and gets one document back.**
Each page has a SQL function of its own, named for the page and ending in `_page`, that answers for the session first and then composes exactly the reads the page makes, returning them as one `jsonb` value keyed by the read each part replaces.
Two pages that draw the same document still have two functions, one an alias of the other, so the edge log names the page that was loaded and a page that comes to read differently moves nobody else's document.
The TypeScript readers keep every parsing rule and derivation they had and read rows out of the document instead of out of separate responses.

**A page function adds no privilege.**
Every one is `security invoker`, granted to `authenticated` and revoked from `public`, `anon` and `service_role`.
Inside it a table is read under the same row-level policies as before, and an existing `security definer` function is called as it was called before, so it keeps its own gate.
A read that would have come back empty still comes back empty.

**The session verdict comes first, in the same document.**
A request with no verified token is answered `signed-out` by the reader before any read, because a page function is executable by a signed-in role and nobody else, and a refusal at the door is not a verdict.
If the token verifies but names no held session the document says `signed-out` and carries no ministry data.
If the session administers no Ministry it says `not-an-admin` and carries no ministry data.
The shell's Follow-Up badge is handed in by every page from that document, so the shell never reads on its own.

## Context

A day of measuring production on 2026-09-11 showed that a warm click was 0.6 to 1.0 s of waiting on the network and nothing else.
Resolving the signed-in Admin was three calls in a row on every page, the Overview was eight stages deep, the Roster thirteen, and the shell re-read the whole Care Needed list on three tabs to number a badge.
Each round trip cost 30 to 130 ms between the app's region and the database's while Postgres executed the statement in 2 to 27 ms.
The same shape hurt twice: a click after a quiet minute fired five to ten calls at once, and that burst is what stalled the origin for seconds.

Three other ways to cut the round trips were considered.

- **Fatter PostgREST embeds.**
  They cannot call a definer function such as `roster` or `contact_to_share`, cannot compute the session verdict, and the composite foreign keys already made embeds choose the wrong path once.
- **A direct pooled connection from the app server.**
  It would run outside the session's row-level policies, so every page would carry its own Ministry check in TypeScript, which is the thing the policies exist to make impossible to forget.
- **Caching the reads.**
  Care Needed and the Overview are the surfaces where a stale answer is the wrong answer, and a cache would have to be invalidated by every command.

One function per page keeps the policies and the definer gates where they are, and moves only the number of times the app crosses the network.

## Consequences

A new signed-in page starts with its page function and its reader, and the reader's tests drive the function through a signed-in client.
Changing what a page reads is a migration as well as a code change, and the migration is pushed before the code is merged: old code calls none of the new functions, and new code cannot run without them.
Because old code runs against the new function between the push and the deploy, a change to a page function is additive within one change, and a key is removed only in a following migration, after the code that stopped reading it is live.

SQL batches and TypeScript derives.
A page function returns rows; every rule that turns rows into what a page shows stays in the domain, so the Follow-Up badge and the Needs Follow-Up tile can never disagree because they were computed in two places.
The cost is that a tab which shows only the badge still reads the whole history, and the history is unbounded.
The document size is measured in the edge log after the deploy; a page document over 256 KB is answered by bounding the history to the window the derivation needs, never by a count computed in SQL.

A page function names the functions it composes at runtime, and Postgres records no dependency for a name in a body.
A later migration that drops or re-signatures `roster` applies cleanly, and `roster_page` fails at its first call; a `language sql` body is checked when it is created and never again, so it breaks the same way.
The guard is one loop that finds every page function by its name, executes each as a signed-in Admin inside a transaction it rolls back, and insists on `admin` from each, because a function returns the verdict alone to anybody else and a statement that is not reached is not parsed (`src/platform/supabase/every-page-function-answers.ts`).
It runs as a test after every `db reset`, and by hand against production after `supabase db push` and before the merge (`npm run smoke:pages`), so a broken callee is fixed or reverted while nothing new has shipped.
The same loop asserts that no page function is executable by `anon`, where the hosted platform's default grant has drifted before, and makes one call through the API afterwards to prove its schema cache has seen the functions.
What the loop does not cover stays with the reader tests: a column that changed shape without erroring, a read that came back empty, and a branch the test Admin's data does not reach.

The documents are keyed by the read they replace, with the same columns under the same names, so a reader that lacks a key it needs raises rather than reading it as empty.

A signed URL for a Material's file is minted by the storage API, which has no face in SQL, so a page links each file to a route of its own that signs it when it is tapped (`app/relationships/file/[item]/route.ts`), and drawing the page stays one read.

The rule about privilege is the one to hold when a page function is next touched: a page function that becomes `security definer`, or that is granted to `anon`, has widened what a caller may read without any policy changing.
