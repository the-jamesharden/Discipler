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

- [x] The popup is drawn over the Roster at `/roster?pair=<personId>`, and the Roster behind it is the list the Admin was on.
- [x] A refresh keeps it open.
- [x] The X, **Cancel** and the backdrop all close it without saving and return to the Roster as it was, on the same list.
- [x] A `pair` that names nobody on this Ministry's Roster, or somebody who cannot be paired, opens no popup and shows the Roster.
- [x] **The toggle decides which side it opens on** for somebody on both lists: as a Disciple on Disciples, as a Discipler on Disciplers and on All.
  Until ticket 14, a person who would open as a Discipler is sent to the old Pair page instead, so no row opens an empty popup.
- [x] Opening the popup costs one page read, not the Roster's read and the Pair document's beside it.
- [x] The popup needs JavaScript, as the import dialog does.
  The form inside it is an ordinary form and still posts without script.

### What it shows

- [x] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [x] One row per Discipler: a round mark, avatar initials, name, email and phone beneath with each missing detail simply absent, and how many they already lead (*leads nobody yet*, *leads 1*).
- [x] Exactly one can be chosen: round marks, not boxes.
  A Disciple is never given two Disciplers here.
- [x] No shape toggle ever appears on this side, and nothing else is asked.
- [x] Nothing chosen: no sentence, and the button reads **Pair** and is disabled.
- [x] One chosen: *Claire Martinez will disciple Sam Lee in a one-on-one.* and **Create 1:1 pair**.

### Submitting

- [x] It posts to the existing pairing route and forms a one-to-one awaiting acceptance; the Roster shows its receipt, on the list the Admin was on.
- [x] A refusal redirects to `/roster?pair=<personId>&error=<code>`, and the popup reopens with the reason and the chosen Discipler restored (mock state F).
- [x] The old Pair page's own refusals still return to the old Pair page until ticket 20 retires it.

### Rows

- [x] **Pair** on a Disciple's row, on Disciples and on All, opens the popup.

### Copy, styling, tests

- [x] Every new string lives with the Roster's copy and is covered by the pairing copy test.
- [x] The existing modal and segmented-control styles are reused, not duplicated; new classes are only what the mock needs beyond them.
- [x] Over HTTP: the popup's markup is present at `?pair=`, absent without it, keeps the list, and the refusal round trip restores the choice.
- [x] Looked at in a browser beside mock state E at desktop and phone width: backdrop, centring, title face, row rhythm, the disabled button.

## Comments

### Implementer, 2026-09-20: what was built, and three readings

All twenty-one criteria are met.
The popup is `app/roster/pair-popup.tsx`, drawn by the Roster page from the document it already read; the rules are in `app/roster/lists.ts` (`opensAs`, `pairHref`, `whoThePopupIsFor`, `disciplersFor`, `leadsCount`) and the words are `PAIR_POPUP` in `app/roster/copy.ts`.

**One page read** is held by construction and not by a counting test: the page still makes its one `readRosterPage('roster')` call, and the popup is handed rows out of that document.
Nothing in the repository counts requests per page, so I did not invent a harness for it.

Three places where the ticket and the spec left room, and what I did:

- ***leads 1* counts people, not relationships.**
  The spec says *how many they already lead* and *leads nobody yet*, and *nobody* is a word about people, so a Discipler leading a group of three reads *leads 3*.
  The mock only ever shows 0 and 1, where the two readings agree.
  If James meant relationships, it is one line in `leadsCount`.
- **The toolbar of mock E (*4 disciplers* and **Clear**) is built**, though the acceptance list does not name it.
  The mock is this ticket's design source, and with round marks Clear is the only way back to *nothing chosen*.
  Clear needs script and is absent without it.
- **Every Discipler is listed, one who has not completed Intake or has opted out included**, because the ticket says every Discipler can be chosen and the database's refusal stops a wrong one.
  Ticket 13 greys for gender and for a Disciple already in a one-to-one; it does not mention these two, so they will still be refused after the click.
  Worth deciding before ticket 13 starts whether its rule should grey them too.

Also decided here, from the orchestrator's note on `pairHref`: it now takes the list, because the toggle decides the side.
Somebody on both lists opens the popup from Disciples and goes to the old Pair page, preselected as the Discipler, from Disciplers and from All.
The same holds for an address typed by hand, which redirects.

Beyond the letter of the ticket, both small: the row's Pair link and the popup's three ways out do not scroll the Roster to the top, so it comes back as it was; and a choice restored from a refusal is scrolled into view when the list is long.

Looked at in a browser beside mock E and F at 923px and at 390px: centred both ways to the pixel, serif title over the ruled head, row rhythm and selected row as the mock, **Pair** disabled until a round mark is pressed, the refusal above the list with the choice restored, the import dialog shut behind it.
One flaw found and fixed: the keyboard focus ring was doubled and clipped by the scrolling list.
