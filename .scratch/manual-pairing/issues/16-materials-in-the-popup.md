# 16 - Materials on the 1:2 pair and on each of N × 1:1

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The Material dropdowns the mock draws for the two shapes ticket 15 made: one for a 1:2 pair, and one per Disciple for N × 1:1 pairs.

**Blocked by:** 05, 15

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~110k of 250k tokens (reads 35, writes 25, test runs 15, browser check 15, gate 20).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock states B and C.

## Acceptance

- [ ] Every Material dropdown lists the Ministry's live Materials with **No material** first, and No material is the default.
- [ ] A one-to-one from a single tick still asks nothing, a Material included.
- [ ] **1:2 pair** shows one dropdown, posted as the single Material ticket 02 holds on the relationship.
- [ ] **N × 1:1 pairs** shows one dropdown per ticked Disciple, each labelled with that Disciple's name, posted as ticket 05's per-Disciple choice.
- [ ] Ticking another Disciple adds their dropdown at No material; unticking one removes theirs and leaves the others' choices as they were.
- [ ] A choice made under one shape is not carried into the other: moving from N × 1:1 to 1:2 starts the 1:2's dropdown at No material.
- [ ] A Ministry with no live Materials shows no dropdowns and no empty label where they would have been.
- [ ] The dropdowns sit inside the popup without pushing the buttons off screen; with many ticked, they scroll with the panel they are in.
- [ ] A refusal restores every Material choice with the rest.
- [ ] A Material removed between opening the popup and submitting comes back as a refusal naming it, with the rest of the selection intact.
- [ ] Over HTTP: a 1:2 with a Material holds it as intended and writes it at acceptance; 2 × 1:1 with a different Material each hold one apiece.
- [ ] Looked at in a browser beside mock states B and C, and with five ticked at phone width.
