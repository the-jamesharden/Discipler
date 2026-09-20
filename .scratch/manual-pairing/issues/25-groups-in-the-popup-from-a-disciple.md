# 25 - Groups in the popup, from a Disciple

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** Under the Disciplers, a **Groups** heading and the Ministry's groups.
Choosing one and pressing **Add to group** puts the Disciple straight into it.

**Replaces:** *18 - Groups in the popup, from a Disciple*, in the cut of 2026-09-20.
Every criterion is below, unchanged, and one is added: the group row is a piece of its own, because ticket 26 now always comes after this one and reuses it.
Where another ticket says ticket 18, it means this ticket; ticket 08 says what its read leaves to the popup.

**Blocked by:** 22, 23

**Touches:** popup-disciple

**Status:** ready-for-agent

**Budget:** ~140k of 250k tokens (reads 45, writes 30, test runs 20, browser check 20, gate 25).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

**Design source:** the plan's mock state H.

## Beside ticket 24

This ticket and ticket 24 may be open at the same time.
Ticket 23 left each side of the popup in a file of its own, and this ticket edits the Disciple's side only.
Lines added to the Roster's copy and rules are additive, and the integrator keeps both tickets' lines.

## Acceptance

### The rows

- [ ] A **Groups** heading below the Disciplers, then one row per group from ticket 08's read, listed like people.
- [ ] Each row gives the group's name, its leaders, how many Disciples it has, its declared gender, and its state when it is not running (paused, awaiting its leader).
- [ ] A group with no name is labelled by its leaders' names, which is how the Roster's Paired with cell already names a pairing.
- [ ] A group this Disciple is already in is not listed.
- [ ] A Ministry with no groups shows no heading.
- [ ] The line under the title counts both: *4 disciplers · 3 groups*.
- [ ] The group row is a component in a file of its own, not part of the Disciple's side, so ticket 26 lists groups with it and edits neither.

### One choice

- [ ] Exactly one choice across both sections: round marks throughout.
  Choosing a group clears a chosen Discipler, and the other way round.
- [ ] Nothing else is asked.
  The group keeps the Material it has.

### Greying

- [ ] A group whose declaration rules this Disciple out is greyed with it (*A men's group*), through ticket 23's rule with the group's own declaration.
- [ ] A Coed group greys nobody, and a Disciple with no gender on file is never greyed.
- [ ] If this Disciple is already in a one-to-one, every Discipler is greyed and **the groups stay open**.

### Sentence, button, submit

- [ ] *Sam Lee will join Thursday Table, led by David Chen.* **Add to group**.
  Several leaders are all named.
- [ ] It posts to ticket 22's route; the Disciple is in the group at once, and the Roster's receipt says so.
- [ ] A refusal reopens the popup with the reason and the chosen group restored.

### Checked

- [ ] Over HTTP: the Groups section's contents for a Disciple already in one of three groups; a men's group greyed for a woman; the join round trip; a refusal restored.
- [ ] Looked at in a browser beside mock state H, scrolled to the bottom of the list, at desktop and phone width.
