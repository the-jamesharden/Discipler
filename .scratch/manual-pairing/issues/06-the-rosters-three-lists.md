# 06 - The Roster's three lists

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** An **All / Disciplers / Disciples** toggle directly under the word Roster, with All the default, and an All list on which each person appears once and every pairing says its direction.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Budget:** ~130k of 250k tokens (reads 35, writes 30, test runs 20, browser check 15, gate 30).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

Today the Roster is two lists and opens on Disciplers, so a pastor looking for one person has to know which side they are on first.
The toggle also becomes what decides which side the Pair popup opens on (ticket 12), so it has to exist before the popup does.

The quieter rows (the chip, the footnote, the tags, the Pair people button) are ticket 07, and nothing in this ticket removes them.

## Acceptance

- [x] Three plain links under the title: **All**, **Disciplers**, **Disciples**, at `?list=all|disciplers|disciples`.
  No script is needed and a refresh keeps the list.
- [x] All is the default: `/roster` with no `list`, or with a value that is none of the three, shows All.
  This changes today's default, which is Disciplers, and the tests that assumed it are updated rather than worked around.
- [x] Who is on which list does not change.
  The one rule that decides it stays the one rule, and a person may be on both.
- [x] On All, each person appears exactly once, including somebody who is on both lists.
- [x] On All, the Paired with cell says the direction of each pairing: *disciples* Emily Davis, *discipled by* Grace Lee.
  Somebody on both sides shows both directions in the one cell.
- [x] On All, the column heading and the count line read for people, not for one side.
- [x] The stats line shows total, paired and unpaired on every list.
  *In groups* is gone from all three.
  On All, paired means in at least one open relationship in either role.
- [x] A plan an import made still shows on the row of each person it is about, on All as on the side lists.
- [x] Receipts (imported, paired, reset) still land and read correctly now that the default list is All.
- [x] Over HTTP: the three lists, the default, the unknown value, and a person on both sides appearing once on All with both directions.
- [x] Looked at in a browser beside the plan's Roster mock; the toggle sits directly under the title and nothing else on the page has shifted.

## Comments

### 2026-09-19 - implemented on `agent/manual-pairing-06-the-rosters-three-lists`

Calls made while building, for the reviewer and for whoever picks up tickets 07 and 12:

- **A plan said its direction on All too**, as first built; see the review below, which took the direction out altogether.
- **All three links name their list**, All included: `/roster?list=all`.
  `/roster` with no `list`, an empty one, or an unknown one shows All.
- **All is not a third rule.**
  `isDisciple` already takes whoever `isDiscipler` does not, so everybody on the Roster is on at least one side and `onList('all', ...)` is simply true.
  `lists.ts` is otherwise untouched in who it puts where, and a unit test pins that the two sides are the same people as before.
- **Order inside the cell on All** is leading first: who they disciple, then who disciples them, then plans in the same order.
  The spec does not say; it is my choice, kept by James in review, and three assertions pin it.
- **On All the heading is "Name" and the count is "N people total"**, from the plan's Roster mock and the acceptance line.
- **Receipts.**
  The paired receipt lands on `/roster?paired=N`, which is now All, so both people it is about are on the page under it; a test asserts both rows.
  The import and the held-row answer still redirect to `?list=disciples` by name, so nothing about them moved.
  A test asserts each: `importing-over-http` for the import, and `resolving-a-shared-number-over-http` for the answer.
  As first written this note claimed both and only the import's was asserted; the second was added in review.
  The password reset receipt is its own page under `/roster/reset/...` and never lands on a list, so there was nothing to change or assert there.
- **The Pair link on All** needed no change: the existing expression already sends a Discipler as `leaderId` and anybody else as `with`, which is what the spec wants from All.
  What the toggle decides for somebody on both lists is ticket 12's.
- **One thing beyond the letter of the ticket:** the size pill (`1:1`, `3 members`) now sits in a `nowrap` span with the last name before it, on every list.
  In a narrow window the pill wrapped onto a line by itself.
  The text of the cell is unchanged; one assertion in `pairing-over-http` that read the raw markup now reads the text.
- `isAGroup` and `RosterStats.inGroups` are deleted, not left unused.
  Nothing else read them.
- `docs/pastor-dashboard.md` said two lists, opening on Disciplers, with four numbers.
  Those two sentences are corrected; the chip and the footnote in the same paragraph are ticket 07's to take out.

### 2026-09-19 - reviewed with James, and the direction words came out

Two reviewers read `integration/manual-pairing...d9a1966`, one against the repo's standards and one against this ticket and the spec, and James went through the result item by item.

**A decision that supersedes this ticket and the spec.**
The criterion "On All, the Paired with cell says the direction of each pairing" and the matching line under `## The Roster` in `spec.md` are reversed.
James, in review: "there is no need for disciples/disciples by in this context, remove", and "there is a toggle for all, disciplers, disciples, at the top so that covers that confusion, anything more would be cluttered".
So on All a row names the other person in each pairing and each plan, exactly as the side lists do, with no word before the name.
Somebody on both sides is still one row with both pairings in the one cell, who they disciple first.
The criterion above stays ticked as it was built and reviewed; this note is what is true now.
`spec.md` still carries the old line and the mock in `.lavish/pair-popup/index.html` still draws it; both are James's to amend, and I have not touched either.
Ticket 12 is not affected: what the toggle decides for somebody on both lists never depended on the words.

The rest, by the review's own IDs:

- D-1 kept: the last name and the size pill share a `nowrap` span.
- D-2 kept: the leading-first order, with the wrong claim about the spec's example corrected above.
- D-3 kept: `fe7f74e`, the wait for Auth in `locked-tests.sh`, integrates with this ticket.
- D-4 kept: the `docs/pastor-dashboard.md` correction, now without the sentence about direction.
- D-5 kept: all three links name their list, `/roster?list=all` included.
- J-1 fixed: `docs/agents/test-environment.md` describes the Auth gap and the wait.
- J-2 fixed: the stale "two lists" comment in `app/roster/copy.ts`.
- S-1 fixed: `plansOn` and `relationshipsOn` share one `heldOn`.
- S-2 moot: `Direction` is deleted, so `PlanLine` and `PairingLine` no longer take a `list`.
- S-3 moot: the `.dir` class is deleted with it.
- S-4 left: per-suite test helpers stay as they are.
- S-5 fixed: the two unit assertions on the absence of `inGroups` are gone; the over-HTTP one that the page never says *in groups* stays.
- E-1 fixed: the held-row answer's landing is asserted, and the note that claimed it is corrected.
- E-2 accepted: the browser check was made in a window 850 px wide, and that stands.
- E-3 fixed: the "directly under the title" assertion now matches the card's head exactly and checks the very next element is the toggle.

### Orchestrator, 2026-09-20: what the implementing session cost

Read from the session's transcript, as the context the session was carrying, which is what the 250k limit is a limit on.

- Estimate on the **Budget** line: ~110k.
- At the first commit, with the ticket built and not yet reviewed: 203k.
- At its peak: 338k, because the same session went on to answer the review and the conversations with James, which `docs/agents/workflow.md` gives to a fresh fixer session.
- The session stood at 51k before it had read the ticket: the system prompt, the tool and skill lists, `CLAUDE.md` and memory.

Across tickets 03, 06 and 08 the build alone came to between 1.3 and 1.8 times the estimate.
The tickets cut on 2026-09-20 (21 to 27) keep the old estimates per stage and say so beside them.
