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

- [ ] Three plain links under the title: **All**, **Disciplers**, **Disciples**, at `?list=all|disciplers|disciples`.
  No script is needed and a refresh keeps the list.
- [ ] All is the default: `/roster` with no `list`, or with a value that is none of the three, shows All.
  This changes today's default, which is Disciplers, and the tests that assumed it are updated rather than worked around.
- [ ] Who is on which list does not change.
  The one rule that decides it stays the one rule, and a person may be on both.
- [ ] On All, each person appears exactly once, including somebody who is on both lists.
- [ ] On All, the Paired with cell says the direction of each pairing: *disciples* Emily Davis, *discipled by* Grace Lee.
  Somebody on both sides shows both directions in the one cell.
- [ ] On All, the column heading and the count line read for people, not for one side.
- [ ] The stats line shows total, paired and unpaired on every list.
  *In groups* is gone from all three.
  On All, paired means in at least one open relationship in either role.
- [ ] A plan an import made still shows on the row of each person it is about, on All as on the side lists.
- [ ] Receipts (imported, paired, reset) still land and read correctly now that the default list is All.
- [ ] Over HTTP: the three lists, the default, the unknown value, and a person on both sides appearing once on All with both directions.
- [ ] Looked at in a browser beside the plan's Roster mock; the toggle sits directly under the title and nothing else on the page has shifted.
