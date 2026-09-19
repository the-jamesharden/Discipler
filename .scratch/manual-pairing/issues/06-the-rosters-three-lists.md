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

- **A plan says its direction on All too.**
  The spec says the Paired with cell says the direction of "each pairing", and this ticket says a plan "still shows ... on All as on the side lists".
  I read a planned pairing as a pairing for this purpose, so on All a plan reads *disciples* Taylor Brooks `planned`, *discipled by* Sam Rivera `planned`.
  Without it, a row on All could not say which way a plan would run, which is the one thing the side lists said for free.
  If that is not wanted it is one line: drop `<Direction>` from `PlanLine` in `app/roster/page.tsx`, and the three assertions that name it.
- **All three links name their list**, All included: `/roster?list=all`.
  `/roster` with no `list`, an empty one, or an unknown one shows All.
- **All is not a third rule.**
  `isDisciple` already takes whoever `isDiscipler` does not, so everybody on the Roster is on at least one side and `onList('all', ...)` is simply true.
  `lists.ts` is otherwise untouched in who it puts where, and a unit test pins that the two sides are the same people as before.
- **Order inside the cell on All** is leading first: every *disciples* line, then every *discipled by* line, then plans in the same order.
  The spec's own example reads that way round.
- **On All the heading is "Name" and the count is "N people total"**, from the plan's Roster mock and the acceptance line.
- **Receipts.**
  The paired receipt lands on `/roster?paired=N`, which is now All, so both people it is about are on the page under it; a test asserts both rows.
  The import and the held-row answer still redirect to `?list=disciples` by name, so nothing about them moved; a test asserts that.
  The password reset receipt is its own page under `/roster/reset/...` and never lands on a list, so there was nothing to change or assert there.
- **The Pair link on All** needed no change: the existing expression already sends a Discipler as `leaderId` and anybody else as `with`, which is what the spec wants from All.
  What the toggle decides for somebody on both lists is ticket 12's.
- **One thing beyond the letter of the ticket:** the size pill (`1:1`, `3 members`) now sits in a `nowrap` span with the last name before it, on every list.
  The direction makes a line on All longer, and in a narrow window the pill wrapped onto a line by itself.
  The text of the cell is unchanged; one assertion in `pairing-over-http` that read the raw markup now reads the text.
- `isAGroup` and `RosterStats.inGroups` are deleted, not left unused.
  Nothing else read them.
- `docs/pastor-dashboard.md` said two lists, opening on Disciplers, with four numbers.
  Those two sentences are corrected; the chip and the footnote in the same paragraph are ticket 07's to take out.
