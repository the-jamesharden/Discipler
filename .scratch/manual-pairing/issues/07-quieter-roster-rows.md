# 07 - Quieter Roster rows

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** Nothing on a Roster row that describes internal state, and every pairing starting from a row.

**Blocked by:** 06

**Status:** ready-for-agent

**Budget:** ~130k of 250k tokens (reads 35, writes 30, test runs 20, browser check 15, gate 30).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

The participation status chip, its footnote and the *Offered to mentor* tag explain the model to a pastor who came to see people.
Participation Status stays in the model and still decides who can be paired; it stops being printed under every name.

## Acceptance

### Removed

- [ ] The participation status chip under every name, and the footnote under the table that explains it.
- [ ] The *Offered to mentor* tag.
  Answering Mentor on Intake still makes somebody a Discipler, and the Disciplers list already says so.
- [ ] The *Pair people* button, from the Roster and from Suggested Pairs.
- [ ] Copy and styles that only the removed pieces used go with them, and the copy tests are updated.

### What a row says instead

- [ ] A row that cannot be paired says why in its Paired with cell: **Awaiting Intake** or **Opted out**, in place of *Unpaired* and a Pair button.
- [ ] **Pair** appears on every Discipler row, including a Discipler who already leads somebody.
- [ ] **Pair** appears on every Disciple row whose person has completed Intake and not opted out, and on no other Disciple row.
- [ ] On All, a person who is a Discipler gets the Discipler's rule.
- [ ] Pair still opens the existing Pair page with that person preselected, as it does today.
  Ticket 12 moves Disciple rows to the popup and ticket 20 moves Discipler rows.

### Pinned

- [ ] A test asserts the words *Eligible to lead* never appear on the Roster, on any of the three lists.
  They left the app on 2026-09-07 and survive only in a design prototype.

### Glossary

- [ ] **Roster** in `CONTEXT.md` stops saying it shows "their current participation status".
- [ ] **Declared Side** in `CONTEXT.md` stops saying "it shows on their roster row".

### Checked

- [ ] Over HTTP: a person awaiting Intake, a person opted out, a ready Disciple, a Discipler who leads nobody and one who leads somebody each show what this ticket says, on their side list and on All.
- [ ] Looked at in a browser beside the plan's Roster mock.
  Row height, alignment of the Pair button and the reason text are right on all three lists.
