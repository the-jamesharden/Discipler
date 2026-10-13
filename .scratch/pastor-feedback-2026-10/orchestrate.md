# Orchestrate: build Pastor feedback tickets 01 to 13 concurrently

You are the orchestrator.
Your job is to get tickets 01 to 13 in `.scratch/pastor-feedback-2026-10/issues/` built, verified and integrated by running subagents in parallel, one ticket per subagent, in the order the dependencies allow.
You do not write product code yourself except to resolve merge conflicts and integration failures.
You finish with one integration branch that holds every ticket, green, and a report to James of what needs his eye.

James has approved these tickets for implementation by handing you this prompt.
Set a ticket's `**Status:**` line to `ready-for-agent` when its builder starts, and to `shipped` only when James has merged it to `main`.

## Read before you start

1. `CLAUDE.md` (repo) and `~/.claude/CLAUDE.md` (James's own rules). The ones builders break most often: never use the em dash, use a plain dash; never add an agent co-author line to a commit; never edit a CHANGELOG or a generated file; in long Markdown put each sentence on its own line.
2. `docs/agents/test-environment.md`. Every subagent must follow it. Do not believe a red or green run until you have checked it against that file.
3. `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
4. `.scratch/pastor-feedback-2026-10/spec.md` and all thirteen tickets. The tickets are the scope. The spec records why. Do not reopen a decision the spec records as James's.
5. Your auto memory index (`MEMORY.md`). These entries matter most here: *Main checkout is the integration branch*, *Shared-checkout git ops are denied*, *Another checkout resets the shared database*, *Concurrent test runs cause hook timeouts*, *Stale next-server causes phantom test failures*, *pkill next start kills its own shell*, *Ticket files move under you*, *Another session builds the same ticket*, *Implement means all the way through*, *Pinned test clocks are date bombs*, *Visual check without browser sign-in*, *Headless Chrome screenshots*, *Supabase db push hangs on a keychain dialog*, *db push from a worktree*, *no-mistakes gate workflow*.

## The dependency graph

| Ticket | Blocked by | Notes |
|---|---|---|
| 01 Flower in the margins | - | CSS and `public/botanical/` only |
| 02 Overview cards coloured by need | - | Same Overview card markup as 07 |
| 03 Four answers, A to D | - | Migration. Real-phone wording |
| 04 A readable link per church | - | Migration. New `/join` routes |
| 05 The growth chart | PR #27 merged to `main` | PR #27 is another session's (Overview rates over last week). Do not touch it. Rebase onto `main` once it merges |
| 06 Other on the Intake goal | - | Migration. James asked for it last of 01 to 06, but 11 needs it |
| 07 The pair card | - | Run after 02 in the same stream: both rewrite the Overview relationship cards |
| 08 The group card | 07 | |
| 09 Check-Ins opens the card | 03, 07, 08 | |
| 10 Follow-Up items are buttons | 07, 08 | Can run beside 09 |
| 11 The form editor | 06, 04 | 04 changes the Intake Forms page that 11 rewrites |
| 12 Custom questions | 07, 11 | |
| 13 Removing a question | 11, 12 | |

Waves, as soon as their blockers are integrated:

- **Wave 1, five subagents at once:** 01; 02 then 07 (one subagent, two tickets, in that order); 03; 04; 06.
- **Wave 2:** 08 when 07 is integrated; 05 when PR #27 is on `main` and 02 and 07 are integrated; 11 when 04 and 06 are integrated.
- **Wave 3:** 09 and 10 together, once 08 (and, for 09, 03) is integrated; 12 after 11.
- **Wave 4:** 13.

Start a ticket the moment its blockers are integrated. Do not wait for a whole wave to finish.

## Branches and worktrees

The main checkout at `/Users/jamesharden/Downloads/discipler-grill-baseline-v2` is shared with other sessions and sits on `ship/waves-2026-09-22`.
That branch diverges from production on a Suggested Pairs migration.
Never build from it.
Never switch, merge, revert or reset in the main checkout. The permission classifier denies it, and it breaks the other sessions.

- Create `integration/pastor-feedback` from `origin/main` in a worktree of your own.
- Each ticket gets its own worktree under `/Users/jamesharden/Downloads/discipler-worktrees/pf-<NN>-<slug>`, on branch `pf/<NN>-<slug>`, cut from the current tip of `integration/pastor-feedback`.
- In each worktree, symlink `node_modules` to the main checkout's, which is listed in `.git/info/exclude`, and copy `.env.local`.
- Give every worktree its own `LOCKED_TESTS_PORT` (3141, 3142, 3143 and up) and its own browser-check ports. Check a port is free with `lsof` before using it. Never use 3000, and never stop a server you did not start.
- The ticket and spec files live on `ship/waves-2026-09-22` and are not on `origin/main`. Commit `.scratch/pastor-feedback-2026-10/` onto `integration/pastor-feedback` first, so every worktree has its ticket.
- The mock-ups are gitignored and exist only in the main checkout: `/Users/jamesharden/Downloads/discipler-grill-baseline-v2/.lavish/pastor-feedback/`. Give subagents that absolute path. The tickets name the files.
- Before launching a ticket, check nobody else is building it: `git worktree list`, `git branch -a`, `gh pr list`, and the ticket's own status. If you find another build, stop and tell James.

## The shared database

There is one local Supabase stack.
`scripts/locked-tests.sh` serialises every integration run behind one lock, and resets the database whenever the caller's migrations differ from what is applied.
Tickets 03, 04 and 06 each add a migration, so while they run in parallel, nearly every lock handover resets the database.
That is expected and costs minutes, not correctness.

- Tell each subagent to write and commit its migration early, and to run `locked-tests.sh` for the integration files it touched, not the whole suite, while building.
- Migration timestamps must not collide. Give 03, 04 and 06 distinct timestamp prefixes up front: for example 03 takes `20261013000100`, 04 takes `20261013000200`, 06 takes `20261013000300`.
- Nobody runs `npm test`, `supabase db reset` or anything on port 3000 directly.
- A broadly red run with `Hook timed out in 10000ms` is contention. Check `pgrep -f "[v]itest"`, `docker ps` and `uptime` before believing it.
- No seed script runs while a vitest run is in progress. A seed script must live inside the worktree while it runs (`scripts/tmp-*.ts`) and is deleted afterwards.

## What each subagent is told

Give each builder one ticket (02 then 07 are one builder's pair), the worktree path, its branch, its ports, its migration timestamp if any, and this brief:

> Build `.scratch/pastor-feedback-2026-10/issues/<NN>-<slug>.md` all the way through, in the worktree `<path>` on branch `<branch>`.
> The ticket is your scope. Read it, the spec section it names, and the mock-ups it names under `/Users/jamesharden/Downloads/discipler-grill-baseline-v2/.lavish/pastor-feedback/`.
> Follow `CLAUDE.md`, `~/.claude/CLAUDE.md` and `docs/agents/test-environment.md`.
> Work test-first, matching the surrounding code's style, naming and comment density.
> Where the ticket leaves a gap, take the conservative reading, write it under `## Comments` in the ticket as a decision made with the alternative, and keep going. Do not stop to ask.
> Do not stop at a migration: write it, apply it locally through `scripts/locked-tests.sh`, and list it for James. Never push to the production database.
> Words sent by SMS must be exactly the ticket's wording. List every changed text for James to see on a real phone.
> Before calling the ticket built: run the whole `npx vitest run tests/domain tests/app`, the whole typecheck and lint; run `LOCKED_TESTS_PORT=<port> scripts/locked-tests.sh` for every integration file you touched, and `--times 3` once at the end; check the result has 0 skipped files; and check every screen you changed by eye in a real browser against the mock-up, at desktop and at phone width (a 390x844 iframe). Use the cookie-proxy and headless Chrome recipes in memory, never a password typed into a browser.
> Fix any lint failure, test failure or flake you meet, even one you did not cause, and say so.
> Update every doc the ticket names. Do not touch `CONTEXT.md` beyond what the ticket says.
> Commit by named path, never `git add -A`. Use messages like `feat(overview): ... (Pastor feedback, ticket 02)`. No co-author line. No em dash.
> Tick each acceptance box in the ticket as it is met, with the commit that met it.
> Finish with a report: commits, test evidence (the summary lines), screenshots you checked, decisions written under `## Comments`, and the list for James (migrations, SMS wording, anything material).

Subagents run in the background. Keep a status table: ticket, worktree, branch, state, last report.
Never quote a subagent's result before it arrives.

## Integrating

When a builder reports done:

1. Read its report and its diff. Check the boxes it ticked against the ticket, and spot-check its screenshots yourself.
2. Merge its branch into `integration/pastor-feedback`. Resolve conflicts yourself, keeping both tickets' intent. `public/discipler.css`, `app/overview/page.tsx`, `src/domain/outbound-copy.ts`, `app/intake-forms/page.tsx` and the migrations folder are the likely collisions.
3. Run `scripts/locked-tests.sh` on the integration worktree, plus the whole domain and app suites and the typecheck. If it goes red, fix it or send it back to the builder with the failure.
4. Rebase or merge `integration/pastor-feedback` into any running builder's branch whose ticket depends on what just landed, and tell that builder.
5. Start whatever the merge unblocked.

When all thirteen are integrated, run `scripts/locked-tests.sh --times 3` on the integration branch and confirm three green runs with 0 skipped files.

## What you must not do

- Do not push migrations to production, merge to `main`, or run `npm run smoke:pages` against production. Those are James's.
- Do not open a PR to `main` without telling James first. Do not merge PR #27 or touch its branch.
- Do not widen a ticket. Something real outside a ticket goes in your final report, or in `docs/open-questions.md` if it is a product question.
- Do not reopen a decision the spec records: the broadcast to Disciplers was declined, the Materials overhaul and church self-signup are out of this round, and only D is a concern.

## Your final report to James

Write it once, at the end, in plain language:

- What is built, ticket by ticket, with the integration branch's tip sha.
- The three green locked runs.
- Every migration, in the order production must receive it, and the exact push command from the integration worktree (see the *db push from a worktree* memory).
- Every changed SMS text, before and after, for him to see on a real phone. Ticket 03 is the big one.
- Every decision builders wrote under `## Comments`.
- Anything you found and fixed outside the tickets, and anything you found and did not fix.
- How he ships it: whether the integration branch goes as one PR through the no-mistakes gate, or ticket by ticket. Recommend one and wait for him.

Save anything future sessions need into memory before you finish.
