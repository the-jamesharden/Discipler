# 12 - The Pair popup over the Roster, from a Disciple

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** Pressing **Pair** on a Disciple's row opens a popup over the Roster, titled **Pair {name}**, listing Disciplers.
Choosing one and pressing **Create 1:1 pair** forms the one-to-one.
This is the popup's shell and its simplest complete path; every later popup ticket builds on it.

**Blocked by:** 07

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~180k of 250k tokens (reads 50, writes 45, test runs 25, browser check 25, gate 35).
This is the tightest ticket in the effort.
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock state E (`.lavish/pair-popup/index.html`), and the import dialog for how a popup is drawn over the Roster.

## Out of this ticket

Greyed rows are ticket 13, so here every Discipler can be chosen and the database's refusal is what stops a wrong one.
Groups at the bottom of the list are ticket 18.
The Discipler's side is ticket 14, and Discipler rows keep opening the old Pair page until ticket 20.

## Acceptance

### Where it lives

- [ ] The popup is drawn over the Roster at `/roster?pair=<personId>`, and the Roster behind it is the list the Admin was on.
- [ ] A refresh keeps it open.
- [ ] The X, **Cancel** and the backdrop all close it without saving and return to the Roster as it was, on the same list.
- [ ] A `pair` that names nobody on this Ministry's Roster, or somebody who cannot be paired, opens no popup and shows the Roster.
- [ ] **The toggle decides which side it opens on** for somebody on both lists: as a Disciple on Disciples, as a Discipler on Disciplers and on All.
  Until ticket 14, a person who would open as a Discipler is sent to the old Pair page instead, so no row opens an empty popup.
- [ ] Opening the popup costs one page read, not the Roster's read and the Pair document's beside it.
- [ ] The popup needs JavaScript, as the import dialog does.
  The form inside it is an ordinary form and still posts without script.

### What it shows

- [ ] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [ ] One row per Discipler: a round mark, avatar initials, name, email and phone beneath with each missing detail simply absent, and how many they already lead (*leads nobody yet*, *leads 1*).
- [ ] Exactly one can be chosen: round marks, not boxes.
  A Disciple is never given two Disciplers here.
- [ ] No shape toggle ever appears on this side, and nothing else is asked.
- [ ] Nothing chosen: no sentence, and the button reads **Pair** and is disabled.
- [ ] One chosen: *Claire Martinez will disciple Sam Lee in a one-on-one.* and **Create 1:1 pair**.

### Submitting

- [ ] It posts to the existing pairing route and forms a one-to-one awaiting acceptance; the Roster shows its receipt, on the list the Admin was on.
- [ ] A refusal redirects to `/roster?pair=<personId>&error=<code>`, and the popup reopens with the reason and the chosen Discipler restored (mock state F).
- [ ] The old Pair page's own refusals still return to the old Pair page until ticket 20 retires it.

### Rows

- [ ] **Pair** on a Disciple's row, on Disciples and on All, opens the popup.

### Copy, styling, tests

- [ ] Every new string lives with the Roster's copy and is covered by the pairing copy test.
- [ ] The existing modal and segmented-control styles are reused, not duplicated; new classes are only what the mock needs beyond them.
- [ ] Over HTTP: the popup's markup is present at `?pair=`, absent without it, keeps the list, and the refusal round trip restores the choice.
- [ ] Looked at in a browser beside mock state E at desktop and phone width: backdrop, centring, title face, row rhythm, the disabled button.
