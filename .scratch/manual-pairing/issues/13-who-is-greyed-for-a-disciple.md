# 13 - Who is greyed for a Disciple

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** In the popup opened from a Disciple, a Discipler who could not be chosen is greyed with the reason on the row, instead of being offered and then refused.
This ticket also sets down the greying rule as one tested piece the Discipler's side (tickets 14, 15, 17) reuses.

**Replaced by:** `.scratch/manual-pairing/issues/23-who-is-greyed-and-the-disciplers-side.md`, stage 1, in the cut of 2026-09-20.
Nothing is built from this file.
It is kept, and not deleted with the other replaced tickets, only because ticket 12's branch edits it; delete it once ticket 12 is integrated.

**Blocked by:** 12

**Touches:** popup

**Status:** wontfix

**Budget:** ~100k of 250k tokens (reads 30, writes 25, test runs 15, browser check 10, gate 20).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

A refusal that arrives after the click costs a round trip and teaches the Admin nothing they could not have been shown.
The rules are the database's own, so the screen shows them; it does not invent any.

## Acceptance

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
- [ ] A greyed row cannot be chosen by mouse or keyboard, is announced as unavailable with its reason to a screen reader, and is never submitted.
- [ ] A greyed row is shown, not hidden.
- [ ] A choice restored from a refusal that is now greyed is not restored as chosen.
- [ ] The database still refuses what it refused before; the greying removes no rule underneath.
- [ ] Over HTTP: another-gender Discipler greyed in an enforcing Ministry and open in one that does not enforce; a null-gender Discipler open; every Discipler greyed for a Disciple already in a one-to-one.
- [ ] Looked at in a browser: the greyed treatment reads as unavailable and not as broken, and the reason fits on one line at phone width.
