# 05 - A Material per Disciple in a separate submission

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** In `separate` mode, each Disciple carries their own Material choice, held as an intention on their one-to-one and spent at acceptance.
Invisible: the popup's per-Disciple dropdowns are ticket 16.

**Blocked by:** 04

**Status:** ready-for-agent

**Budget:** ~90k of 250k tokens (reads 30, writes 20, test runs 15, gate 20, overhead 5).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

James asked for the Material to be asked per person when pairing separately (mock state C).
A Discipler meeting two people apart is often reading different things with each.
Ticket 02 already holds one intended Material on a relationship; this ticket lets a set of relationships each hold a different one.

## Acceptance

- [ ] A `separate` submission can name a Material for each Disciple, and each one-to-one formed holds the Material named for its own Disciple.
- [ ] A Disciple with no Material named gets none.
  No material is the default, and one Disciple's choice never spills onto another.
- [ ] A Material named for somebody who is not among the submitted Disciples is ignored rather than refused.
- [ ] A Material the Ministry does not hold, or one that has been removed, refuses the whole set through ticket 03's check, and the refusal names the Disciple it was chosen for.
- [ ] A refusal returns every Disciple's Material choice with the rest of the selection.
- [ ] `together` mode still takes the single Material ticket 02 gave it, and ignores any per-Disciple choice.
- [ ] Over HTTP: a Discipler and two Disciples, a different Material each, produce two one-to-ones; accepting each writes that Disciple's Material into its history, as ticket 02 does for one.
