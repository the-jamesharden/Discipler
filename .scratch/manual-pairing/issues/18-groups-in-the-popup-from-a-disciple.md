# 18 - Groups in the popup, from a Disciple

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** Under the Disciplers, a **Groups** heading and the Ministry's groups.
Choosing one and pressing **Add to group** puts the Disciple straight into it.

**Blocked by:** 09, 13

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~140k of 250k tokens (reads 45, writes 30, test runs 20, browser check 20, gate 25).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock state H.

## Acceptance

### The rows

- [ ] A **Groups** heading below the Disciplers, then one row per group from ticket 08's read, listed like people.
- [ ] Each row gives the group's name, its leaders, how many Disciples it has, its declared gender, and its state when it is not running (paused, awaiting its leader).
- [ ] A group with no name is labelled by its leaders' names, which is how the Roster's Paired with cell already names a pairing.
- [ ] A group this Disciple is already in is not listed.
- [ ] A Ministry with no groups shows no heading.
- [ ] The line under the title counts both: *4 disciplers · 3 groups*.

### One choice

- [ ] Exactly one choice across both sections: round marks throughout.
  Choosing a group clears a chosen Discipler, and the other way round.
- [ ] Nothing else is asked.
  The group keeps the Material it has.

### Greying

- [ ] A group whose declaration rules this Disciple out is greyed with it (*A men's group*), through ticket 13's rule with the group's own declaration.
- [ ] A Coed group greys nobody, and a Disciple with no gender on file is never greyed.
- [ ] If this Disciple is already in a one-to-one, every Discipler is greyed and **the groups stay open**.

### Sentence, button, submit

- [ ] *Sam Lee will join Thursday Table, led by David Chen.* **Add to group**.
  Several leaders are all named.
- [ ] It posts to ticket 09's route; the Disciple is in the group at once, and the Roster's receipt says so.
- [ ] A refusal reopens the popup with the reason and the chosen group restored.

### Checked

- [ ] Over HTTP: the Groups section's contents for a Disciple already in one of three groups; a men's group greyed for a woman; the join round trip; a refusal restored.
- [ ] Looked at in a browser beside mock state H, scrolled to the bottom of the list, at desktop and phone width.
