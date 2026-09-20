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

- [x] The participation status chip under every name, and the footnote under the table that explains it.
- [x] The *Offered to mentor* tag.
  Answering Mentor on Intake still makes somebody a Discipler, and the Disciplers list already says so.
- [x] The *Pair people* button, from the Roster and from Suggested Pairs.
- [x] Copy and styles that only the removed pieces used go with them, and the copy tests are updated.

### What a row says instead

- [x] A row that cannot be paired says why in its Paired with cell: **Awaiting Intake** or **Opted out**, in place of *Unpaired* and a Pair button.
- [x] **Pair** appears on every Discipler row, including a Discipler who already leads somebody.
- [x] **Pair** appears on every Disciple row whose person has completed Intake and not opted out, and on no other Disciple row.
- [x] On All, a person who is a Discipler gets the Discipler's rule.
- [x] Pair still opens the existing Pair page with that person preselected, as it does today.
  Ticket 12 moves Disciple rows to the popup and ticket 20 moves Discipler rows.

### Pinned

- [x] A test asserts the words *Eligible to lead* never appear on the Roster, on any of the three lists.
  They left the app on 2026-09-07 and survive only in a design prototype.

### Glossary

- [x] **Roster** in `CONTEXT.md` stops saying it shows "their current participation status".
- [x] **Declared Side** in `CONTEXT.md` stops saying "it shows on their roster row".

### Checked

- [x] Over HTTP: a person awaiting Intake, a person opted out, a ready Disciple, a Discipler who leads nobody and one who leads somebody each show what this ticket says, on their side list and on All.
- [x] Looked at in a browser beside the plan's Roster mock.
  Row height, alignment of the Pair button and the reason text are right on all three lists.

## Comments

### Implementer, 2026-09-19: a Discipler who cannot be paired (decided by James)

Two lines of this ticket disagree for one kind of row.
*Pair appears on every Discipler row* and *a row that cannot be paired says why, in place of Unpaired and a Pair button* cannot both hold for a Discipler who has opted out, or who was imported as one and has not completed Intake.
The database refuses a pairing led by either.

James decided it on 2026-09-19: the reason wins, and there is no Pair.
*Every Discipler row* is read as the plan's mock words it: a Discipler keeps Pair even when they already lead somebody.

So there is one rule for both sides, `whyNotPairable` in `app/roster/lists.ts`: no Intake completed reads **Awaiting Intake**, opted out reads **Opted out**, and anybody else gets Pair, paired already or not.
The side decides only who is preselected on the Pair page, as it did before (`pairHref`).

### Implementer, 2026-09-19: the reason on a row that already names somebody

The ticket says where the reason goes when the cell would have said *Unpaired*.
It does not say where it goes when the cell already lists a pairing or a plan, and that row exists: opting out ends no relationship.
The chip used to say *Opted Out* on that row, and `tests/integration/the-roster-row-over-http.test.ts` pinned that an Admin can read it there.

I read the ticket's main clause, *a row that cannot be paired says why in its Paired with cell*, as covering it.
The reason sits after the lines, where Pair would have been.

The first review (d131148, CHANGES REQUIRED) accepted that for a pairing, *Uche Nwosu 1:1* and then **Opted out**.
It refused it for a plan, where the row read *Taylor Brooks planned - awaiting Intake* and then **Awaiting Intake**: the same words twice, on every pair an import brings in, and a reading the ticket does not reach.

James decided it on 2026-09-19: drop the repeat only.
A row whose plan line already ends in *awaiting Intake* does not say **Awaiting Intake** after it, and still offers no Pair.
Every other reason stays, because it says something the lines do not: **Opted out** beside a pairing or a plan, and **Awaiting Intake** beside a plan that was refused (*not made - see Follow-Up*).
`reasonOnRow` in `app/roster/lists.ts` is that rule, and `whyNotPairable` still decides the button.

### Implementer, 2026-09-19: what stayed, on purpose

- The person page still shows the status chip and *Offered to mentor*.
  The ticket is about the Roster row, and `participationStatusLabel` and `OFFERED_TO_MENTOR` stay in `app/roster/copy.ts` for it.
- *Pair people* is still the Pair page's title.
  Only the buttons went; ticket 20 retires the page.
- The Suggested Pairs button said *Pair manually*, not *Pair people*.
  It was the same way in, `/roster/pair` with nobody chosen, so it went.
- The import dialog still says *People land as No Intake Submitted*.
  No row prints that status any more, and the row says *Awaiting Intake*.
  Rewording the dialog is a copy decision this ticket does not make.

### Implementer, 2026-09-19: where the button sits

Beside what the cell says, never under it (`.paired-with` in `public/discipler.css`).
A one-line cell reads as the plan's mock draws it, *Emily Davis 1:1* and then Pair.
A cell whose lines wrap keeps the button at the cell's right edge, centred on the lines, so a long group does not push it onto a row of its own.
