# 14 - The Pair popup, from a Discipler: the list and one tick

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The popup opened as a Discipler lists Disciples with checkboxes.
Ticking one and pressing **Create 1:1 pair** forms the one-to-one.

**Blocked by:** 13

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~150k of 250k tokens (reads 45, writes 35, test runs 20, browser check 20, gate 30).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock state A.

## Not linked yet

The Discipler's side is reachable by address (`/roster?pair=<personId>` on Disciplers or All) and no row opens it until ticket 20.
Discipler rows keep opening the old Pair page, which can already do everything.
That is what lets this side be built over four tickets without an Admin ever meeting a half-built control.

In this ticket, two or more ticked has no shape to become: the button stays disabled and a line says the choice of shape is coming.
Ticket 15 replaces that line with the toggle.

## Acceptance

### The list

- [ ] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [ ] One row per Disciple who has completed Intake and not opted out: a checkbox, avatar initials, name, email and phone beneath with each missing detail simply absent.
- [ ] Candidates are not filtered beyond that; everyone who could be paired is listed.
- [ ] The first-time note the Pair page shows today is kept on the row.
- [ ] A Disciple already in a group is listed, and the row names the group.
- [ ] A Disciple already in a one-to-one is listed, and greyed with *Already in a 1:1 with {name}* while the shape would make a one-to-one, which in this ticket is always.
- [ ] Other-gender Disciples are greyed through ticket 13's rule; no gender on file is never greyed.
- [ ] A toolbar above the list counts it (*7 disciples*) and offers **Clear**, which unticks everything.
  There is no Select all.
- [ ] Ticked rows take the selected treatment.
- [ ] The list scrolls inside the popup; the title, the toolbar, the sentence and the buttons stay put.

### One tick

- [ ] Nothing ticked: no sentence, **Pair** disabled.
- [ ] One ticked: *Claire Martinez will disciple Sam Lee in a one-on-one.* and **Create 1:1 pair**.
  Nothing else is asked: no gender, no name, no Material.
- [ ] It posts to the pairing route and forms a one-to-one awaiting acceptance.
- [ ] A refusal reopens the popup on the Discipler's side with the reason and the tick restored.

### Opening side

- [ ] Ticket 12's fallback is removed: a person who opens as a Discipler now gets this side.
- [ ] The old Pair page and every link to it are untouched.

### Checked

- [ ] Over HTTP: the list's contents for a Ministry with a Disciple in a group, one in a one-to-one, one of another gender, one with no gender, one awaiting Intake and one opted out.
- [ ] Looked at in a browser beside mock state A at desktop and phone width.
