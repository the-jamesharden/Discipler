# 29 - The popup from a Discipler: the list and one tick

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
Tickets 28 to 32 are everything left to build, cut on 2026-09-20 out of tickets 11 and 21 to 27.
Any number from 01 to 27 is an earlier ticket: what was built from it is in `33-committed-already.md`, which also says where the rest of it went.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The popup opened as a Discipler: it lists Disciples with checkboxes, and ticking one and pressing **Create 1:1 pair** forms the one-to-one.

**Replaces:** stage 2 of *23 - Who is greyed, and the popup from a Discipler: the list and one tick*, which was *14 - The Pair popup, from a Discipler: the list and one tick*.
Every criterion of it is below, unchanged.
Stage 1 of ticket 23, who is greyed for a Disciple, is committed (`9e7c5e0`, `b30fe81`, `7df285f`) and is in `33-committed-already.md`.
Read its Comments there before starting: six readings were made while building it, and the third, that the Roster reads the Pair document while the popup is open, is what this side stands on.
The rule this side greys with is `app/roster/greying.ts`, and code written for it says "Manual pairing, ticket 23".

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Size:** ~150k tokens, one stage.
Build straight through (James, 2026-09-20): a gap in the ticket takes the conservative reading, written under Comments as a decision made, with its alternative beside it.
Stop only for a migration or a data change, for words sent to a real phone, or for removing a rule the database holds.

**Design source:** the plan's mock state A.

## Why

A refusal that arrives after the click costs a round trip and teaches the Admin nothing they could not have been shown.
The rules are the database's own, so the screen shows them; it does not invent any.

## Acceptance

### Not linked yet

The Discipler's side is reachable by address (`/roster?pair=<personId>` on Disciplers or All) and no row opens it until ticket 32.
Discipler rows keep opening the old Pair page, which can already do everything.
That is what lets this side be built over three tickets without an Admin ever meeting a half-built control.

In this ticket, two or more ticked has no shape to become: the button stays disabled and a line says the choice of shape is coming.
Ticket 30 replaces that line with the toggle.

### Two sides, two files

Added in the cut of 2026-09-20, when two tickets were to be open at the same time.
Nothing is built side by side now, and both criteria stand.

- [x] The Discipler's side is a component in a file of its own, beside the Disciple's side that ticket 12 built.
  What the two share (the backdrop, the head, the refusal, the ways out, a person's row) is one piece both use, not a copy in each.
- [x] After this ticket, work on one side of the popup edits that side's file and never the other's.

### The list

- [x] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [x] One row per Disciple who has completed Intake and not opted out: a checkbox, avatar initials, name, email and phone beneath with each missing detail simply absent.
- [x] Candidates are not filtered beyond that; everyone who could be paired is listed.
- [x] The first-time note the Pair page shows today is kept on the row.
- [x] A Disciple already in a group is listed, and the row names the group.
- [x] A Disciple already in a one-to-one is listed, and greyed with *Already in a 1:1 with {name}* while the shape would make a one-to-one, which in this ticket is always.
- [x] Other-gender Disciples are greyed through ticket 23's rule; no gender on file is never greyed.
- [x] A toolbar above the list counts it (*7 disciples*) and offers **Clear**, which unticks everything.
  There is no Select all.
- [x] Ticked rows take the selected treatment.
- [x] The list scrolls inside the popup; the title, the toolbar, the sentence and the buttons stay put.

### One tick

- [x] Nothing ticked: no sentence, **Pair** disabled.
- [x] One ticked: *Claire Martinez will disciple Sam Lee in a one-on-one.* and **Create 1:1 pair**.
  Nothing else is asked: no gender, no name, no Material.
- [x] It posts to the pairing route and forms a one-to-one awaiting acceptance.
- [x] A refusal reopens the popup on the Discipler's side with the reason and the tick restored.

### Opening side

- [x] Ticket 12's fallback is removed: a person who opens as a Discipler now gets this side.
- [x] The old Pair page and every link to it are untouched.

### Checked

- [x] Over HTTP: the list's contents for a Ministry with a Disciple in a group, one in a one-to-one, one of another gender, one with no gender, one awaiting Intake and one opted out.
- [x] Looked at in a browser beside mock state A at desktop and phone width.

## Comments

### Implementer, 2026-09-20: built already, as stage 2 of ticket 23

This ticket was cut out of ticket 23 while a session was already building ticket 23 straight through, both stages, as James had asked.
So it is built and committed, under ticket 23's name: `ab1f7e5` (who the list holds, how its rows are greyed, its words) and `5149ec8` (the two sides in two files, the popup from a Discipler, the route's refusal).
Code and tests written for it say "Manual pairing, ticket 23", which is what this ticket asks of them.
Nothing here is left to build; it needs its review and nothing else.

Checked: `npm run typecheck` clean; `tests/domain tests/app`, 69 files, 1263 tests; through `scripts/locked-tests.sh`, the two popup suites, `pairing-over-http`, `separate-one-to-ones-over-http`, `a-material-chosen-at-pairing-over-http`, the two Roster suites and `what-the-pair-screen-reads`, 8 files, 82 tests, none skipped.
Looked at in a browser beside mock state A at desktop width and at 390px: one tick, two ticks, a greyed box that will not tick, **Clear**, a restored tick scrolled into view, the list scrolling inside the popup, and every reason and the line for two ticks on one line.

### What was decided while building

The numbering carries on from the six readings of stage 1, which are with ticket 23 in `33-committed-already.md`.

Same terms as stage 1: small, reversible readings, each with its alternative, and none stopped the work.

**7. *One row per Disciple* means the Roster's Disciples list.**
Somebody who is only a Discipler (leads, or offered to on the Intake form, and is discipled by nobody) is not on the list, exactly as the other side lists only Disciplers (`disciplersFor`, from ticket 12).
Somebody on both lists is on it.
The alternative is everybody who can be paired, which is what the old Pair page offers; that is one condition in `disciplesFor` (`app/roster/lists.ts`).

**8. The first-time note says what the Pair page says: *New to this*, *Has done this before*, and nothing where nobody asked.**
The mock's row reads *first time*; the criterion says the note the Pair page shows today is kept, and `firstTimeLabel` is that note, so it is reused and not reworded.

**9. A group nobody has named is said by who leads it: *in Grace Lee's group*.**
A named one is *in Grace's Group*, as the mock has it.
The groups come off the `groups` key the Pair document already carries, matched by membership, so no read is added.
Ticket 31 lists groups as rows of their own and owns how an unnamed one is labelled there; `PAIR_POPUP.inGroup` is there for it to reuse or replace.

**10. The line for two or more ticked reads *Pairing two or more at once is coming. Tick one for now.***
The ticket asks for a line saying the choice of shape is coming and gives no words.
The button is disabled as the server sends it, so it holds without script too.
Without script, two boxes can still be ticked and posted: the route refuses it as it refuses any group with no name and no declaration, nothing is formed, and the popup comes back with both ticks, this line and the disabled button.
Ticket 30 replaces the line with the toggle.

**11. A refusal from this side carries who was ticked as `with`.**
That is the name the old Pair page's refusals already use for ticked Disciples.
The person the popup is for is in the address once, as `pair`, and is not repeated as `leaderId`.
From a Disciple the address is what ticket 12 made it, unchanged.

**12. The list of boxes is a `fieldset`.**
`tests/domain/relationship-kind-fence.test.ts` forbids the literal `'group'` in app code, to keep relationship kind out of copy (ADR-0004), and an ARIA `role="group"` trips it.
A `fieldset` is that role natively, so the fence was left as it is.

**13. Two sides, two files.**
`app/roster/pair-popup.tsx` is what both share: the backdrop, the head, the refusal, the ways out and a person's row.
`app/roster/pair-popup-from-a-disciple.tsx` and `app/roster/pair-popup-from-a-discipler.tsx` are the sides.
`app/roster/page.tsx` renders whichever `opensAs` names, and is the one file both later tickets may still meet in, for the props each side is fed.
