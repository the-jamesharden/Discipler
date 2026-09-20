# Several agents, one repository

How more than one coding agent works on an effort's tickets at the same time without overwriting each other, and how their work reaches the integration branch only after review.
The tooling is `scripts/agents/`; the prompts are `docs/agents/prompts/`.

## The rules the tooling holds

| Rule | Held by |
| --- | --- |
| A ticket is named by its full path, never a bare number | every script refuses anything that is not `.scratch/<effort>/issues/<NN>-<slug>.md` |
| One ticket, one branch, one worktree, and one fresh session for each of its stages | `start-ticket.sh`; git refuses to check one branch out twice; the ticket's `## Stages` |
| Agents cannot overwrite each other | a worktree per ticket outside the main checkout, with its own `node_modules`, `.env.local`, build output and read-only design copies; nothing is symlinked |
| A ticket starts only when its blockers' work is on the integration branch | `start-ticket.sh` reads `Blocked by:` and the `Ticket-Path:` trailers of the merges |
| Two tickets that edit the same component are not open together | the `Touches:` line; `start-ticket.sh` refuses the second |
| Review before integration, of the exact commit | a receipt keyed by commit sha in `.git/agent-workflow/reviews/`; `integrate.sh` refuses a head without a PASS |
| A commit after a review voids it | the receipt is for a sha; the new head has none |
| One full review per ticket | after a failed review the orchestrator checks the fix against the findings and records the receipt; see *After a failed review* |
| One whole-suite run per ticket | the implementer and the reviewer run the files the ticket touches; `integrate.sh` runs the whole suite, once, on the merged tree |
| Implementers do not merge | the prompts; and a pre-commit hook refuses commits on `integration/*` and `main` |
| A red combination never becomes history | `integrate.sh` merges with `--no-commit`, runs the whole suite once, and only then commits |
| Shared-state tests run one at a time, against the right server | `locked-tests.sh`: one `lockf` lock around reset, build, serve, test, stop; a port per worktree |

These stop accidents.
They do not stop an agent that sets out to forge a receipt or bypass a script; the prompts forbid that, and the person reads the reports.

## Where state lives

Nothing is tracked twice.

| Fact | Source |
| --- | --- |
| What a ticket needs first | `Blocked by:` in the ticket, as the integration branch holds it |
| What it must not overlap | `Touches:` in the ticket |
| Whether it may be picked up at all | `Status: ready-for-agent` in the ticket |
| In progress | the branch `agent/<effort>-<NN>-<slug>` exists |
| Reviewed, and how | `.git/agent-workflow/reviews/<sha>.json` and `<sha>.md`, for the branch's head |
| Integrated | a merge on `integration/<effort>` with `Ticket-Path: <path>` in its trailers; true after the branch is deleted |
| Shipped | `Status: shipped` in the ticket, which still means merged to `main` (`triage-labels.md`) |

`scripts/agents/status.sh <effort>` prints all of it: SHIPPED, INTEGRATED, APPROVED, CHANGES REQUIRED, IN PROGRESS, READY, HELD, BLOCKED, NOT READY.
A ticket's `Status:` line is not touched while it moves through this workflow.
It changes once, to `shipped`, in the pull request that promotes the integration branch to `main`.

## The roles

**Orchestrator.** Works in the main checkout. Decides what is eligible, creates worktrees, hands out prompts. Never writes product code. `prompts/orchestrator.md`.

**Implementer.** Owns one ticket's worktree and branch. Implements that ticket, tests it, reads its own diff, commits. Never merges. A fresh session per ticket. `prompts/implementer.md`.

**Reviewer.** Reads the ticket and the branch's diff, edits nothing, reports BLOCKING, NON-BLOCKING, TESTS MISSING and a VERDICT, and records a receipt for the commit it read. `prompts/reviewer.md`.

**Fixer.** A fresh implementer session on the same branch, handed the review. About 80k tokens. `prompts/fixer.md`.

**Integrator.** Works in the main checkout. Merges PASSed branches one at a time, resolves conflicts keeping both tickets' behaviour, runs the whole suite once on the merged tree, commits only on green. `prompts/integrator.md`.

## After a failed review

A ticket gets one full review.
When it says CHANGES REQUIRED, the fixer answers the findings in new commits, and the orchestrator does a fix check in place of a second review.
The fix check reads `git diff <reviewed sha>..<branch>` beside the review's BLOCKING and TESTS MISSING items, and nothing else.
Every item met, and nothing in the diff beyond them, is a PASS: the orchestrator writes a short file in the review's shape, naming each finding and the commit that answers it, and records it with `record-review.sh` for the new head.
An item not met, or a fix that widened the ticket, is CHANGES again and another fix session.
Decided by James on 2026-09-19, after the second full review of `.scratch/manual-pairing/issues/07-quieter-roster-rows.md` cost as much as the first and found nothing.

## How much is tested, and when

| Who | Runs |
| --- | --- |
| Implementer, fixer | typecheck, `tests/domain tests/app`, and the integration files the ticket touches or that read what it changed |
| Reviewer | the same, for the files the diff adds or changes |
| Orchestrator's fix check | nothing |
| Integrator | the whole suite, once, on the merged tree (`integrate.sh`, `--times 1` by default) |
| Promotion to `main` | the whole suite three times back to back with no reset between (`locked-tests.sh --times 3`), then the no-mistakes gate |

The three back-to-back runs exist to catch a query whose order flips as the tables grow (`test-environment.md`).
That is a property of the integration branch as a whole, so it is checked once, before promotion, and not once per ticket.

Implementers, fixers and reviewers are started by the person in their own terminal, with the worktree as the working directory.
That is deliberate: a session whose working directory is the worktree cannot mistake the main checkout for its own.
A subagent launched from the main checkout would have to remember to work by absolute path, and the one that forgot would be writing where the integrator works.
A reviewer may be a subagent, because it writes nothing.

## The life of a ticket

```
scripts/agents/status.sh manual-pairing
scripts/agents/start-ticket.sh .scratch/manual-pairing/issues/<NN>-<slug>.md
        prints:  cd '<worktree>' && claude "$(cat .agent/implementer-prompt.md)"

   implementer commits on agent/manual-pairing-<NN>-<slug>, reports, stops
   a ticket with stages: the same command again, a new session, until the last stage is ticked

cd '<worktree>' && claude "$(scripts/agents/prompt.sh reviewer .scratch/manual-pairing/issues/<NN>-<slug>.md)"
        reviewer records PASS or CHANGES for the head commit

   CHANGES REQUIRED:
cd '<worktree>' && claude "$(scripts/agents/prompt.sh fixer .scratch/manual-pairing/issues/<NN>-<slug>.md)"
        new commits on the SAME branch; the old receipt no longer matches
        the orchestrator's fix check, not a second review, records the receipt for the new head

   PASS, from the main checkout:
claude "$(scripts/agents/prompt.sh integrator .scratch/manual-pairing/issues/<NN>-<slug>.md)"
        or directly: scripts/agents/integrate.sh .scratch/manual-pairing/issues/<NN>-<slug>.md

scripts/agents/remove-worktree.sh .scratch/manual-pairing/issues/<NN>-<slug>.md
scripts/agents/status.sh manual-pairing          what that unblocked; new worktrees start from the new integration head
```

## Tokens

The limit is 250k tokens for one implementing session, and each ticket carries its own estimate on its `Budget:` line.
The workflow keeps a ticket inside it by never letting one session do two jobs: implementation, review and each round of fixes are separate sessions with separate contexts.
A session cannot measure its own use, so the stop line on each ticket is a soft guard.
Where the runtime reports what a finished session cost, the orchestrator writes it under `## Comments` in the ticket; if the early tickets run well over, the later ones are split before they start.
Nothing in the workflow's correctness depends on that number being available.

### Stages

A ticket is one branch, one worktree, one review and one integration, and those are what a ticket costs beyond its building.
A session is 250k tokens, and that is what bounds how much one agent builds well.
The two are not the same size, so a ticket may say `## Stages` and be built in more than one session.

- A stage is a section of the ticket with acceptance criteria of its own, and it fits one session.
- A session does the first stage that still has an unticked criterion, commits, reports and stops.
  The person starts the next one with the same command, `cd '<worktree>' && claude "$(cat .agent/implementer-prompt.md)"`, and it reads what the last one committed, not what it remembered.
- A session that reaches the stop line inside a stage commits what is coherent, writes `.agent/handoff.md`, and stops; the next session finishes that stage before it starts another.
- The review is of the whole branch, once, after the last stage, and the fixer and the fix check are unchanged.
- A stage never waits on another ticket that its ticket's `Blocked by:` does not name.
  If it would, it is a ticket and not a stage.

Introduced on 2026-09-20, when James asked for `.scratch/manual-pairing/` to be condensed and its thirteen unstarted tickets became eight.
The first tickets had shown two things: a build came to between 1.3 and 1.8 times its estimate, so no two of them fitted one session; and each ticket cost a worktree, a full review and a whole-suite run whatever its size.

## Where parallel work is unsafe

Eligibility is by blockers, not by waves: a ticket may start the moment its own blockers are integrated.

- **The popup.** It has two sides, and `.scratch/manual-pairing/issues/23-…` leaves each in a file of its own. A ticket carries `Touches: popup-disciple`, `Touches: popup-discipler`, or both, for the side it edits. That is what lets `24-…` (the Discipler's side) and `25-…` (the Disciple's side) be open together; `23-…` and `27-…` carry both tags, and `26-…` follows `24-…` on the Discipler's side. `12-…` carries the older `Touches: popup`, from when the popup was one file, and everything else waits on it through `Blocked by:`.
- **Not tagged, on purpose.** `21-…` and `22-…` both add to the pairing route, and several tickets add lines to the Roster's copy, its rules, its styles and the refusal codes. These are additive and small, and serialising them would serialise two whole tracks. The integrator keeps both sides.
- **Migrations.** After `08-…`, only `22-…` adds them, both of its stages on one branch, so no two open branches pick the same timestamp. `11-…` follows it. A future effort with parallel migrations needs a `Touches: migrations` tag.
- **The machine.** 24 GB, one Supabase stack, and a history of out-of-memory kills. Two or three open worktrees; more buys nothing, because shared tests run one at a time anyway.

## The integration branch and `main`

`integration/<effort>` is cut from `main` and carries the effort's tickets as its first commit.
Ticket branches are never rebased and never merge the integration branch into themselves: either would change their sha and void their review.
Drift is the integrator's to absorb, at merge time.

At a milestone worth shipping, the person promotes the integration branch: merge `main` into it if `main` has moved, run `scripts/agents/locked-tests.sh --times 3`, run the no-mistakes gate, open a pull request, and merge it with a merge commit, never a squash, so the branch and `main` do not diverge.
That pull request flips the promoted tickets to `Status: shipped`, and migrations still go to production by hand.
No script here touches `main`, pushes, forces, resets or stashes.

## Setting up a clone

```
scripts/agents/install-hooks.sh
```

Hooks live in `.git/` and are not cloned, so this is once per clone.
Everything else needs only `git`, `bash`, `lockf` (ships with macOS), `npm` and the Supabase CLI.
