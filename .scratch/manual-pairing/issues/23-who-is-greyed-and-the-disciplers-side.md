# 23 - Who is greyed, and the popup from a Discipler: the list and one tick

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The greying rule, set down once as a tested piece both sides of the popup use, and shown first on the Disciple's side: a Discipler who could not be chosen is greyed with the reason on the row, instead of being offered and then refused.
Then the popup opened as a Discipler: it lists Disciples with checkboxes, and ticking one and pressing **Create 1:1 pair** forms the one-to-one.

**Replaces:** *13 - Who is greyed for a Disciple* (stage 1) and *14 - The Pair popup, from a Discipler: the list and one tick* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged, with the one James added to 13 on 2026-09-20 out of ticket 12's Comments.
One section is new, *Two sides, two files*, and it is about where code lives and not about what an Admin sees.
Where another ticket says ticket 13 or ticket 14, it means this ticket; ticket 12's Comments say what it left for ticket 13.

**Blocked by:** 12

**Touches:** popup-disciple, popup-discipler

**Status:** ready-for-agent

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~100k (reads 30, writes 25, test runs 15, browser check 10, gate 20); stage 2 ~150k (reads 45, writes 35, test runs 20, browser check 20, gate 30).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

**Design source:** the plan's mock state A, for stage 2.

## Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

## Why

A refusal that arrives after the click costs a round trip and teaches the Admin nothing they could not have been shown.
The rules are the database's own, so the screen shows them; it does not invent any.

## Stage 1 - Who is greyed for a Disciple

- [ ] **Greying is computed against the declaration the shape implies, never against one person.**
  The rule takes a declaration (a gender, mixed, or none asked) and a candidate, and answers greyed-with-a-reason or open.
  It is pure, lives in one place, and is tested without a database.
- [ ] A one-to-one is same-gender while the Ministry enforces the match.
  Disciplers of another gender are greyed with the reason in words.
- [ ] Where the Ministry does not enforce the match, nobody is greyed for gender.
- [ ] **Somebody with no gender on file is never greyed**, as the person opened from or as a candidate.
  Both database triggers return early on a null gender so that the readiness rules refuse the row with something the Admin can act on, and the screen shows the same restraint.
- [ ] If this Disciple is already in a one-to-one, every Discipler is greyed with *Already in a 1:1 with {name}*.
  This is `participant_one_open_one_to_one`: one open one-to-one as a participant.
- [ ] **A Discipler who has not completed Intake, or who has opted out, is greyed** with the words their Roster row already says, **Awaiting Intake** or **Opted out**.
  Decided by James on 2026-09-20, out of ticket 12's Comments: ticket 12 lists every Discipler and lets the database refuse these two after the click, which is the round trip this stage exists to remove.
  This reason is about the candidate and not about a declaration, so it is `whyNotPairable` and `CANNOT_BE_PAIRED` (`app/roster/lists.ts`, `app/roster/copy.ts`), reused and not written a second time, and it is said in place of a gender reason where both hold.
- [ ] A greyed row cannot be chosen by mouse or keyboard, is announced as unavailable with its reason to a screen reader, and is never submitted.
- [ ] A greyed row is shown, not hidden.
- [ ] A choice restored from a refusal that is now greyed is not restored as chosen.
- [ ] The database still refuses what it refused before; the greying removes no rule underneath.
- [ ] Over HTTP: another-gender Discipler greyed in an enforcing Ministry and open in one that does not enforce; a null-gender Discipler open; every Discipler greyed for a Disciple already in a one-to-one; a Discipler who has not completed Intake, and one who has opted out, greyed with those words.
- [ ] Looked at in a browser: the greyed treatment reads as unavailable and not as broken, and the reason fits on one line at phone width.

## Stage 2 - The popup, from a Discipler: the list and one tick

### Not linked yet

The Discipler's side is reachable by address (`/roster?pair=<personId>` on Disciplers or All) and no row opens it until ticket 27.
Discipler rows keep opening the old Pair page, which can already do everything.
That is what lets this side be built over three tickets without an Admin ever meeting a half-built control.

In this ticket, two or more ticked has no shape to become: the button stays disabled and a line says the choice of shape is coming.
Ticket 24 replaces that line with the toggle.

### Two sides, two files

Added in the cut of 2026-09-20, so that tickets 24 and 25 can be open at the same time.

- [ ] The Discipler's side is a component in a file of its own, beside the Disciple's side that ticket 12 built.
  What the two share (the backdrop, the head, the refusal, the ways out, a person's row) is one piece both use, not a copy in each.
- [ ] After this ticket, work on one side of the popup edits that side's file and never the other's.
  Ticket 24 carries `Touches: popup-discipler` and ticket 25 carries `Touches: popup-disciple` on the strength of this.

### The list

- [ ] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [ ] One row per Disciple who has completed Intake and not opted out: a checkbox, avatar initials, name, email and phone beneath with each missing detail simply absent.
- [ ] Candidates are not filtered beyond that; everyone who could be paired is listed.
- [ ] The first-time note the Pair page shows today is kept on the row.
- [ ] A Disciple already in a group is listed, and the row names the group.
- [ ] A Disciple already in a one-to-one is listed, and greyed with *Already in a 1:1 with {name}* while the shape would make a one-to-one, which in this ticket is always.
- [ ] Other-gender Disciples are greyed through stage 1's rule; no gender on file is never greyed.
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
